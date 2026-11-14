// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import { RtdbError } from '../errors'
import { MAX_RESYNCS, WebSocketManager } from '../websocket'
import {
	connectAndOpen,
	installMockWebSocket,
	type MockWebSocket,
	restoreWebSocket
} from './mocks/websocket.mock'

// A newer server may send message types, fields and change actions this client predates.

let sockets: MockWebSocket[] = []
let origError: typeof console.error
let origWarn: typeof console.warn

beforeEach(() => {
	jest.useFakeTimers()
	sockets = installMockWebSocket()
	origError = console.error
	origWarn = console.warn
	console.error = () => {}
	console.warn = () => {}
})

afterEach(() => {
	console.error = origError
	console.warn = origWarn
	jest.clearAllTimers()
	jest.useRealTimers()
	restoreWebSocket()
})

function makeManager(): WebSocketManager {
	return new WebSocketManager('test-db', () => 'test-token', 'wss://test.com', {
		enableCache: false,
		reconnect: false,
		reconnectDelay: 100,
		maxReconnectDelay: 1000,
		debug: false
	})
}

describe('rtdb version skew', () => {
	it('drops an unknown server message type and stays usable', async () => {
		const ws = makeManager()
		const socket = await connectAndOpen(ws, sockets)
		socket.simulateMessage({ id: 'x1', type: 'futureThing', data: { a: 1 } })

		const req = ws.send<{ ok: boolean }>({ type: 'ping' } as never)
		const id = socket.sent[socket.sent.length - 1].id
		socket.simulateMessage({ id, type: 'pong', data: {}, extra: 'field' })
		await expect(req).resolves.toBeDefined()
		expect(ws.isConnected()).toBe(true)
	})

	it('rejects a request whose response frame cannot be decoded', async () => {
		const ws = makeManager()
		const socket = await connectAndOpen(ws, sockets)
		const req = ws.send({ type: 'ping' } as never)
		const id = socket.sent[socket.sent.length - 1].id
		socket.simulateMessage({ id, type: 'futureThing' })

		await expect(req).rejects.toBeInstanceOf(RtdbError)
		await expect(req).rejects.toMatchObject({ code: 'RTDB-PARSE-FRAME' })
	})

	it('resubscribes on an unknown change action instead of delivering it', async () => {
		const ws = makeManager()
		const socket = await connectAndOpen(ws, sockets)
		const callback = jest.fn()
		ws.subscribe('posts', undefined, callback, () => {})
		await jest.advanceTimersByTimeAsync(0)

		const first = socket.sent.filter((m) => m.type === 'subscribe')
		expect(first).toHaveLength(1)
		socket.simulateMessage({
			id: first[0].id,
			type: 'subscribeResult',
			data: { subscriptionId: 'sub_1' }
		})
		await jest.advanceTimersByTimeAsync(0)

		socket.simulateMessage({
			id: 'rnd-1',
			type: 'change',
			data: { subscriptionId: 'sub_1', event: { action: 'teleport', path: 'posts/a' } }
		})
		await jest.advanceTimersByTimeAsync(0)

		expect(callback).not.toHaveBeenCalled()
		const unsub = socket.sent.filter((m) => m.type === 'unsubscribe')
		expect(unsub).toHaveLength(1)
		expect(JSON.stringify(unsub[0])).toContain('sub_1')
		// The resubscribe waits out the backoff (reconnectDelay on the first resync)
		expect(socket.sent.filter((m) => m.type === 'subscribe')).toHaveLength(1)
		await jest.advanceTimersByTimeAsync(100)
		expect(socket.sent.filter((m) => m.type === 'subscribe')).toHaveLength(2)

		// An event still in flight for the retired id is dropped, not buffered forever
		socket.simulateMessage({
			id: 'rnd-2',
			type: 'change',
			data: { subscriptionId: 'sub_1', event: { action: 'create', path: 'posts/b' } }
		})
		await jest.advanceTimersByTimeAsync(0)
		const pending = (ws as unknown as { pendingSubscriptionEvents: Map<string, unknown> })
			.pendingSubscriptionEvents
		expect(pending.size).toBe(0)
		expect(callback).not.toHaveBeenCalled()
	})

	it('gives up after MAX_RESYNCS when every replay has an unknown action', async () => {
		const ws = makeManager()
		const socket = await connectAndOpen(ws, sockets)
		const onError = jest.fn()
		ws.subscribe('posts', undefined, () => {}, onError)
		await jest.advanceTimersByTimeAsync(0)

		for (let i = 0; i <= MAX_RESYNCS; i++) {
			const subs = socket.sent.filter((m) => m.type === 'subscribe')
			expect(subs).toHaveLength(i + 1)
			socket.simulateMessage({
				id: subs[i].id,
				type: 'subscribeResult',
				data: { subscriptionId: `sub_${i}` }
			})
			await jest.advanceTimersByTimeAsync(0)
			// A known event first: it must not reset the budget before the unknown one
			for (const action of ['create', 'teleport']) {
				socket.simulateMessage({
					id: `rnd-${i}-${action}`,
					type: 'change',
					data: { subscriptionId: `sub_${i}`, event: { action, path: 'posts/a' } }
				})
			}
			await jest.advanceTimersByTimeAsync(30_000)
		}

		expect(socket.sent.filter((m) => m.type === 'subscribe')).toHaveLength(MAX_RESYNCS + 1)
		expect(onError).toHaveBeenCalledTimes(1)
		expect(onError.mock.calls[0][0]).toMatchObject({ code: 'RTDB-RESYNC-LIMIT' })
		const details = (ws as unknown as { subscriptionDetails: Map<string, unknown> })
			.subscriptionDetails
		expect(details.size).toBe(0)
	})

	it('drops a subscription whose subscribe response cannot be decoded', async () => {
		const ws = makeManager()
		const socket = await connectAndOpen(ws, sockets)
		const onError = jest.fn()
		ws.subscribe('posts', undefined, () => {}, onError)
		await jest.advanceTimersByTimeAsync(0)

		const sub = socket.sent.filter((m) => m.type === 'subscribe')[0]
		socket.simulateMessage({ id: sub.id, type: 'futureThing' })
		await jest.advanceTimersByTimeAsync(0)

		expect(onError).toHaveBeenCalledTimes(1)
		expect(onError.mock.calls[0][0]).toMatchObject({ code: 'RTDB-PARSE-FRAME' })
		const details = (ws as unknown as { subscriptionDetails: Map<string, unknown> })
			.subscriptionDetails
		expect(details.size).toBe(0)
	})
	/**
	 * One subscribe → `ready` → unknown-action round per iteration, `gap` ms apart. `skip`
	 * moves the clock between rounds without firing timers (a long one would ping out).
	 */
	async function resyncRounds(socket: MockWebSocket, rounds: number, gap: number, skip = 0) {
		for (let i = 0; i < rounds; i++) {
			jest.setSystemTime(Date.now() + skip)
			const subs = socket.sent.filter((m) => m.type === 'subscribe')
			if (subs.length !== i + 1) return
			socket.simulateMessage({
				id: subs[i].id,
				type: 'subscribeResult',
				data: { subscriptionId: `sub_${i}` }
			})
			await jest.advanceTimersByTimeAsync(0)
			for (const action of ['ready', 'teleport']) {
				socket.simulateMessage({
					id: `rnd-${i}-${action}`,
					type: 'change',
					data: { subscriptionId: `sub_${i}`, event: { action, path: 'posts' } }
				})
			}
			await jest.advanceTimersByTimeAsync(gap)
		}
	}

	it('does not let a replayed `ready` reset the resync budget', async () => {
		const ws = makeManager()
		const socket = await connectAndOpen(ws, sockets)
		const onError = jest.fn()
		ws.subscribe('posts', undefined, () => {}, onError)
		await jest.advanceTimersByTimeAsync(0)

		await resyncRounds(socket, MAX_RESYNCS + 1, 30_000)
		expect(onError).toHaveBeenCalledTimes(1)
		expect(onError.mock.calls[0][0]).toMatchObject({ code: 'RTDB-RESYNC-LIMIT' })
	})

	it('starts the resync budget over when resyncs are far apart', async () => {
		const ws = makeManager()
		const socket = await connectAndOpen(ws, sockets)
		const onError = jest.fn()
		ws.subscribe('posts', undefined, () => {}, onError)
		await jest.advanceTimersByTimeAsync(0)

		await resyncRounds(socket, MAX_RESYNCS + 2, 30_000, 6 * 60_000)
		expect(onError).not.toHaveBeenCalled()
		expect(socket.sent.filter((m) => m.type === 'subscribe')).toHaveLength(MAX_RESYNCS + 3)
	})

	it('does not resubscribe after disconnect during the resync backoff', async () => {
		const ws = makeManager()
		const socket = await connectAndOpen(ws, sockets)
		ws.subscribe(
			'posts',
			undefined,
			() => {},
			() => {}
		)
		await jest.advanceTimersByTimeAsync(0)
		await resyncRounds(socket, 1, 0)

		await ws.disconnect()
		await jest.advanceTimersByTimeAsync(60_000)
		expect(socket.sent.filter((m) => m.type === 'subscribe')).toHaveLength(1)
	})

	it('forgets a retired id once the server acknowledges the unsubscribe', async () => {
		const ws = makeManager()
		const socket = await connectAndOpen(ws, sockets)
		ws.subscribe(
			'posts',
			undefined,
			() => {},
			() => {}
		)
		await jest.advanceTimersByTimeAsync(0)
		await resyncRounds(socket, 1, 0)

		const retired = (ws as unknown as { retiredSubscriptionIds: Set<string> })
			.retiredSubscriptionIds
		expect(retired.size).toBe(1)
		const unsub = socket.sent.filter((m) => m.type === 'unsubscribe')[0]
		socket.simulateMessage({ id: unsub.id, type: 'unsubscribeResult', data: {} })
		await jest.advanceTimersByTimeAsync(0)
		expect(retired.size).toBe(0)
	})

	it('cancels a subscription whose undecodable response still names its id', async () => {
		const ws = makeManager()
		const socket = await connectAndOpen(ws, sockets)
		ws.subscribe(
			'posts',
			undefined,
			() => {},
			() => {}
		)
		await jest.advanceTimersByTimeAsync(0)

		const sub = socket.sent.filter((m) => m.type === 'subscribe')[0]
		socket.simulateMessage({
			id: sub.id,
			type: 'subscribeResultV2',
			data: { subscriptionId: 'sub_x' }
		})
		await jest.advanceTimersByTimeAsync(0)

		const unsub = socket.sent.filter((m) => m.type === 'unsubscribe')
		expect(unsub).toHaveLength(1)
		expect(JSON.stringify(unsub[0])).toContain('sub_x')
		socket.simulateMessage({
			id: 'rnd-x',
			type: 'change',
			data: { subscriptionId: 'sub_x', event: { action: 'create', path: 'posts/a' } }
		})
		await jest.advanceTimersByTimeAsync(0)
		const pending = (ws as unknown as { pendingSubscriptionEvents: Map<string, unknown> })
			.pendingSubscriptionEvents
		expect(pending.size).toBe(0)
	})
})

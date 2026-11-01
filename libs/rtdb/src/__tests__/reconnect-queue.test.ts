// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Writes must survive a reconnect. A `transaction` frame that never left the client
 * waits in the queue through any number of failed attempts and goes out on the next
 * `onopen`; one already on the wire when the socket dropped is rejected and never
 * replayed, because a `create` is not idempotent.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import { RtdbClient } from '../client'
import { AuthError, ConnectionError, TimeoutError } from '../errors'
import type { ClientMessage } from '../types'
import { WebSocketManager } from '../websocket'
import {
	connectAndOpen,
	installMockWebSocket,
	type MockWebSocket,
	restoreWebSocket
} from './mocks/websocket.mock'

const TX: ClientMessage = { type: 'transaction', operations: [] }

let sockets: MockWebSocket[] = []

beforeEach(() => {
	jest.useFakeTimers()
	sockets = installMockWebSocket()
})

afterEach(() => {
	jest.clearAllTimers()
	jest.useRealTimers()
	restoreWebSocket()
})

function createManager(
	overrides: { reconnect?: boolean; reconnectDelay?: number; maxQueuedWriteAgeMs?: number } = {}
) {
	const reconnectDelay = overrides.reconnectDelay ?? 100
	return new WebSocketManager('test-db', () => 'test-token', 'wss://test.com', {
		enableCache: false,
		reconnect: overrides.reconnect ?? true,
		reconnectDelay,
		maxReconnectDelay: Math.max(1000, reconnectDelay),
		debug: false,
		maxQueuedWriteAgeMs: overrides.maxQueuedWriteAgeMs
	})
}

/** Advance until the manager has built socket number `count + 1`, and return it. */
async function nextSocket(count: number): Promise<MockWebSocket> {
	for (let i = 0; i < 100 && sockets.length === count; i++) {
		await jest.advanceTimersByTimeAsync(50)
	}
	expect(sockets).toHaveLength(count + 1)
	return sockets[count]
}

function txIds(socket: MockWebSocket): unknown[] {
	return socket.sent.filter((m) => m.type === 'transaction').map((m) => m.id)
}

function answer(socket: MockWebSocket, id: unknown): void {
	socket.simulateMessage({ id, type: 'transactionResult', results: [] })
}

/** Observe a promise without awaiting it. */
function track(promise: Promise<unknown>) {
	const state: { settled: boolean; error?: unknown } = { settled: false }
	promise.then(
		() => {
			state.settled = true
		},
		(error) => {
			state.settled = true
			state.error = error
		}
	)
	return state
}

describe('reconnect write queue', () => {
	it('rejects a queued write older than maxQueuedWriteAgeMs and flushes a fresh one', async () => {
		const ws = createManager({ reconnectDelay: 60_000, maxQueuedWriteAgeMs: 50_000 })
		const s1 = await connectAndOpen(ws, sockets)
		s1.simulateClose()

		const stale = track(ws.send(TX))
		await jest.advanceTimersByTimeAsync(45_000)
		const fresh = track(ws.send(TX))
		await jest.advanceTimersByTimeAsync(15_000)

		const s2 = await nextSocket(1)
		s2.simulateOpen()
		await jest.advanceTimersByTimeAsync(0)
		expect(stale.error).toBeInstanceOf(ConnectionError)
		const ids = txIds(s2)
		expect(ids).toHaveLength(1)

		answer(s2, ids[0])
		await jest.advanceTimersByTimeAsync(0)
		expect(fresh).toEqual({ settled: true })
	})

	it('rejects a write once 1000 frames are queued', async () => {
		const ws = createManager({ reconnectDelay: 60_000 })
		const s1 = await connectAndOpen(ws, sockets)
		s1.simulateClose()

		for (let i = 0; i < 1000; i++) ws.send(TX).catch(() => undefined)
		const overflow = await ws.send(TX).catch((error) => error)
		expect(overflow).toBeInstanceOf(ConnectionError)
		expect(ws.getPendingWriteCount()).toBe(1000)
		await ws.disconnect()
	})

	it('queues a write sent while the socket is CLOSING, and sends it after reconnect', async () => {
		const ws = createManager()
		const s1 = await connectAndOpen(ws, sockets)

		s1.simulateClosing()
		const write = track(ws.send(TX))
		await jest.advanceTimersByTimeAsync(0)
		expect(write.settled).toBe(false)
		expect(txIds(s1)).toEqual([])

		s1.simulateClose()
		const s2 = await nextSocket(1)
		s2.simulateOpen()
		const ids = txIds(s2)
		expect(ids).toHaveLength(1)

		answer(s2, ids[0])
		await jest.advanceTimersByTimeAsync(0)
		expect(write).toEqual({ settled: true })
	})

	it('keeps a queued write through a failed reconnect attempt (open → close → close)', async () => {
		const ws = createManager()
		const s1 = await connectAndOpen(ws, sockets)
		s1.simulateClose()

		const write = track(ws.send(TX))
		const s2 = await nextSocket(1)
		// What a browser does for a failed attempt: `error`, then `close`.
		s2.simulateError()
		s2.simulateClose()
		await jest.advanceTimersByTimeAsync(0)
		expect(write.settled).toBe(false)
		expect(ws.getPendingWriteCount()).toBe(1)

		const s3 = await nextSocket(2)
		s3.simulateOpen()
		expect(txIds(s2)).toEqual([])
		const ids = txIds(s3)
		expect(ids).toHaveLength(1)

		answer(s3, ids[0])
		await jest.advanceTimersByTimeAsync(0)
		expect(write).toEqual({ settled: true })
	})

	it('schedules one reconnect per failed attempt (error + close), backing off once', async () => {
		const ws = createManager()
		const s1 = await connectAndOpen(ws, sockets)
		s1.simulateClose()

		// Attempt 1 (100ms) fails: a second timer or a double backoff would show below
		const s2 = await nextSocket(1)
		s2.simulateError()
		s2.simulateClose()
		await jest.advanceTimersByTimeAsync(199)
		expect(sockets).toHaveLength(2)
		await jest.advanceTimersByTimeAsync(1)
		expect(sockets).toHaveLength(3)

		// Attempt 2 fails too: the next delay is 400ms (one bump), not 800ms
		sockets[2].simulateError()
		sockets[2].simulateClose()
		await jest.advanceTimersByTimeAsync(399)
		expect(sockets).toHaveLength(3)
		await jest.advanceTimersByTimeAsync(1)
		expect(sockets).toHaveLength(4)
		await jest.advanceTimersByTimeAsync(2_000)
		expect(sockets).toHaveLength(4)
		await ws.disconnect()
	})

	it('rejects a write already on the wire when the socket drops, and never re-sends it', async () => {
		const ws = createManager()
		const s1 = await connectAndOpen(ws, sockets)

		const write = ws.send(TX).catch((error) => error)
		expect(txIds(s1)).toHaveLength(1)

		s1.simulateClose()
		expect(await write).toBeInstanceOf(ConnectionError)

		const s2 = await nextSocket(1)
		s2.simulateOpen()
		expect(txIds(s2)).toEqual([])
		expect(ws.getPendingWriteCount()).toBe(0)
	})

	it('does not time a queued write out while disconnected; the 30s starts on the wire', async () => {
		const ws = createManager({ reconnectDelay: 60_000 })
		const s1 = await connectAndOpen(ws, sockets)
		s1.simulateClose()

		const write = track(ws.send(TX))
		await jest.advanceTimersByTimeAsync(45_000)
		expect(write.settled).toBe(false)
		expect(sockets).toHaveLength(1)

		await jest.advanceTimersByTimeAsync(15_000)
		const s2 = await nextSocket(1)
		s2.simulateOpen()
		expect(txIds(s2)).toHaveLength(1)

		// Never answered: now that it is on the wire, the request timer applies.
		await jest.advanceTimersByTimeAsync(30_000)
		expect(write.error).toBeInstanceOf(TimeoutError)
	})

	it('rejects queued writes on disconnect()', async () => {
		const ws = createManager()
		const s1 = await connectAndOpen(ws, sockets)
		s1.simulateClose()

		const write = ws.send(TX).catch((error) => error)
		await ws.disconnect()

		expect(await write).toBeInstanceOf(ConnectionError)
		expect(ws.getPendingWriteCount()).toBe(0)
	})

	it('rejects a write at once when no socket is coming', async () => {
		const ws = createManager()
		await connectAndOpen(ws, sockets)
		await ws.disconnect()
		await expect(ws.send(TX)).rejects.toBeInstanceOf(ConnectionError)

		// Dropped, not connecting and reconnect off: nothing would ever flush the queue.
		const idle = createManager({ reconnect: false })
		const s = await connectAndOpen(idle, sockets)
		s.simulateClose()
		await expect(idle.send(TX)).rejects.toBeInstanceOf(ConnectionError)
	})

	it('queues a write sent before the first connect() and flushes it on open', async () => {
		const ws = createManager({ reconnect: false })
		const write = track(ws.send(TX))
		const s1 = await connectAndOpen(ws, sockets)
		await jest.advanceTimersByTimeAsync(0)

		expect(write.settled).toBe(false)
		const [id] = txIds(s1)
		expect(id).toBeDefined()
		answer(s1, id)
		await jest.advanceTimersByTimeAsync(0)
		expect(write).toEqual({ settled: true })
	})

	it('rejects queued writes on a 4403 close', async () => {
		const ws = createManager()
		const s1 = await connectAndOpen(ws, sockets)

		s1.simulateClosing()
		const write = ws.send(TX).catch((error) => error)
		s1.simulateClose(4403)

		expect(await write).toBeInstanceOf(AuthError)
		expect(ws.getPendingWriteCount()).toBe(0)
		await jest.advanceTimersByTimeAsync(5_000)
		expect(sockets).toHaveLength(1)
	})

	it.each([4403, 4404])('a write sent after a %i close rejects immediately', async (code) => {
		const ws = createManager()
		const s1 = await connectAndOpen(ws, sockets)
		s1.simulateClose(code)

		await expect(ws.send(TX)).rejects.toBeInstanceOf(ConnectionError)
		expect(ws.getPendingWriteCount()).toBe(0)
	})
})

describe('RtdbClient.pendingWrites / onConnectionChange', () => {
	function createClient() {
		return new RtdbClient({
			dbId: 'test-db',
			auth: { getToken: () => 'test-token' },
			serverUrl: 'wss://test.com',
			options: { reconnectDelay: 100, maxReconnectDelay: 1000 }
		})
	}

	async function connectClient(client: RtdbClient): Promise<MockWebSocket> {
		const connecting = client.connect()
		const socket = await nextSocket(sockets.length)
		socket.simulateOpen()
		await connecting
		return socket
	}

	it('counts queued and in-flight transactions only, down to 0 on answer', async () => {
		const client = createClient()
		const s1 = await connectClient(client)
		s1.simulateClose()

		const a = client.batch().commit()
		expect(client.pendingWrites()).toBe(1)

		const s2 = await nextSocket(1)
		s2.simulateOpen()
		const b = client.batch().commit()
		const createIndex = client.createIndex('posts', 'title').catch(() => {})
		expect(client.pendingWrites()).toBe(2)
		expect(client.getPendingRequests()).toBe(3)

		const ids = txIds(s2)
		expect(ids).toHaveLength(2)
		answer(s2, ids[0])
		answer(s2, ids[1])
		await Promise.all([a, b])
		expect(client.pendingWrites()).toBe(0)

		await client.disconnect()
		await createIndex
	})

	it('fires on transitions only, and stops after unsubscribe', async () => {
		const client = createClient()
		const events: boolean[] = []
		const unsubscribe = client.onConnectionChange((connected) => {
			events.push(connected)
		})

		const s1 = await connectClient(client)
		expect(events).toEqual([true])

		s1.simulateClose()
		const s2 = await nextSocket(1)
		s2.simulateError()
		s2.simulateClose()
		await jest.advanceTimersByTimeAsync(0)
		expect(events).toEqual([true, false])

		const s3 = await nextSocket(2)
		s3.simulateOpen()
		expect(events).toEqual([true, false, true])

		unsubscribe()
		s3.simulateClose()
		await client.disconnect()
		expect(events).toEqual([true, false, true])
	})
})

// vim: ts=4

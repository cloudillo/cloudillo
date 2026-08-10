// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import { WebSocketManager } from '../websocket'

function setGlobal(key: string, value: unknown): void {
	Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
}

function getGlobal(key: string): unknown {
	return (globalThis as Record<string, unknown>)[key]
}

class CloseEvent extends Event {
	code: number
	reason: string
	wasClean: boolean

	constructor(type: string, init?: { code?: number; reason?: string; wasClean?: boolean }) {
		super(type)
		this.code = init?.code ?? 0
		this.reason = init?.reason ?? ''
		this.wasClean = init?.wasClean ?? true
	}
}
setGlobal('CloseEvent', CloseEvent)

class MockWebSocket {
	readyState = 0
	onopen: ((event: Event) => void) | null = null
	onclose: ((event: CloseEvent) => void) | null = null
	onerror: ((event: Event) => void) | null = null
	onmessage: ((event: MessageEvent) => void) | null = null

	sent: Array<Record<string, unknown>> = []

	constructor(public url: string) {}

	send(data: string): void {
		this.sent.push(JSON.parse(data))
	}

	close(): void {
		this.simulateClose()
	}

	simulateOpen(): void {
		this.readyState = 1
		this.onopen?.(new Event('open'))
	}

	simulateClose(): void {
		this.readyState = 3
		this.onclose?.(new CloseEvent('close', { code: 1006 }))
	}

	/** Answer a `subscribe` this socket received, so the manager stops waiting on it. */
	ackSubscribes(): void {
		for (const msg of this.sent) {
			if (msg.type !== 'subscribe') continue
			this.onmessage?.(
				new MessageEvent('message', {
					data: JSON.stringify({
						id: msg.id,
						type: 'subscribeResult',
						subscriptionId: `srv-${String(msg.id)}`
					})
				})
			)
		}
	}
}

const originalWebSocket = getGlobal('WebSocket')
let sockets: MockWebSocket[] = []

beforeEach(() => {
	jest.useFakeTimers()
	sockets = []
	const ctor = jest.fn((url: string) => {
		const socket = new MockWebSocket(url)
		sockets.push(socket)
		return socket
	})
	// `send()` compares `readyState` against `WebSocket.OPEN` on the constructor,
	// so the mock has to carry the readyState constants too.
	Object.assign(ctor, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
	setGlobal('WebSocket', ctor)
})

afterEach(() => {
	jest.clearAllTimers()
	jest.useRealTimers()
	setGlobal('WebSocket', originalWebSocket)
})

function subscribeMessages(socket: MockWebSocket) {
	return socket.sent.filter((m) => m.type === 'subscribe')
}

/** Push one server-side change onto a subscription, as the backend would. */
function sendChange(socket: MockWebSocket, subscriptionId: string): void {
	socket.onmessage?.(
		new MessageEvent('message', {
			data: JSON.stringify({
				type: 'change',
				subscriptionId,
				event: { action: 'update', path: 'p/1', data: {} }
			})
		})
	)
}

describe('subscription field projection', () => {
	let ws: WebSocketManager

	beforeEach(() => {
		ws = new WebSocketManager('test-db', () => 'test-token', 'wss://test.com', {
			enableCache: false,
			reconnect: false,
			reconnectDelay: 100,
			maxReconnectDelay: 1000,
			debug: false
		})
	})

	async function connectAndOpen(): Promise<MockWebSocket> {
		const before = sockets.length
		const connecting = ws.connect()
		// `_doConnect` awaits the token before constructing the socket, so it
		// does not exist yet on the turn `connect()` was called.
		while (sockets.length === before) await jest.advanceTimersByTimeAsync(0)
		const socket = sockets[sockets.length - 1]
		socket.simulateOpen()
		await connecting
		return socket
	}

	it('sends select on the subscribe message', async () => {
		const socket = await connectAndOpen()

		ws.subscribe(
			'p',
			undefined,
			() => {},
			() => {},
			undefined,
			['ti', 'pp']
		)
		await jest.advanceTimersByTimeAsync(0)

		expect(subscribeMessages(socket)[0].select).toEqual(['ti', 'pp'])
	})

	it('omits select when none was given', async () => {
		const socket = await connectAndOpen()

		ws.subscribe(
			'p',
			undefined,
			() => {},
			() => {}
		)
		await jest.advanceTimersByTimeAsync(0)

		expect(subscribeMessages(socket)[0].select).toBeUndefined()
	})

	it('replays select when the subscription is re-established after a reconnect', async () => {
		// Without this a dropped connection silently upgrades the subscription back
		// to whole documents — which nothing observes, since the extra fields are a
		// superset of what the caller reads.
		const first = await connectAndOpen()

		ws.subscribe(
			'p',
			{ equals: { pp: '__root__' } },
			() => {},
			() => {},
			undefined,
			['ti', 'pp']
		)
		await jest.advanceTimersByTimeAsync(0)
		first.ackSubscribes()

		first.simulateClose()
		const second = await connectAndOpen()
		await jest.advanceTimersByTimeAsync(0)

		const replayed = subscribeMessages(second)
		expect(replayed).toHaveLength(1)
		expect(replayed[0].select).toEqual(['ti', 'pp'])
		// The filter has to survive alongside it, or the replay narrows to the
		// right fields over the wrong rows.
		expect(replayed[0].filter).toEqual({ equals: { pp: '__root__' } })
	})

	it('unsubscribes the id the server assigned after a reconnect', async () => {
		// The pre-reconnect id is dead on both sides; cancelling it would leave the
		// re-established subscription streaming into a consumer that has gone.
		const first = await connectAndOpen()

		const events: unknown[] = []
		const unsubscribe = ws.subscribe(
			'p',
			undefined,
			(event) => events.push(event),
			() => {}
		)
		await jest.advanceTimersByTimeAsync(0)
		first.ackSubscribes()
		const firstId = `srv-${String(subscribeMessages(first)[0].id)}`

		first.simulateClose()
		const second = await connectAndOpen()
		await jest.advanceTimersByTimeAsync(0)
		second.ackSubscribes()
		// The re-subscribe's `subscribeResult` resolves a promise, so the new id
		// only reaches the subscription maps on the next turn.
		await jest.advanceTimersByTimeAsync(0)
		const secondId = `srv-${String(subscribeMessages(second)[0].id)}`
		expect(secondId).not.toBe(firstId)

		sendChange(second, secondId)
		expect(events).toHaveLength(1)

		unsubscribe()
		await jest.advanceTimersByTimeAsync(0)

		const cancels = second.sent.filter((m) => m.type === 'unsubscribe')
		expect(cancels).toHaveLength(1)
		expect(cancels[0].subscriptionId).toBe(secondId)

		// And the callback is off the live subscription, not off the dead one.
		sendChange(second, secondId)
		expect(events).toHaveLength(1)
	})

	it('subscribes once when the subscribe was issued while disconnected', async () => {
		// `subscribe` records the details *and* queues its frame, so on the next open
		// both `flushMessageQueue` and `reestablishSubscriptions` would send one: two
		// server ids for one logical subscription, every event delivered twice, and an
		// unsubscribe able to cancel only one of them.
		const events: unknown[] = []
		ws.subscribe(
			'p',
			undefined,
			(event) => events.push(event),
			() => {}
		)

		const socket = await connectAndOpen()
		await jest.advanceTimersByTimeAsync(0)

		const sent = subscribeMessages(socket)
		expect(sent).toHaveLength(1)

		socket.ackSubscribes()
		await jest.advanceTimersByTimeAsync(0)

		sendChange(socket, `srv-${String(sent[0].id)}`)
		expect(events).toHaveLength(1)
	})

	it('cancels the new id when unsubscribed during an in-flight re-subscribe', async () => {
		// In this window the unsubscribe closure can only see the pre-reconnect id, so
		// nothing else can cancel the one the server is about to assign — and
		// re-registering the callback onto it would stream events into an unmounted
		// consumer forever.
		const first = await connectAndOpen()

		const events: unknown[] = []
		const unsubscribe = ws.subscribe(
			'p',
			undefined,
			(event) => events.push(event),
			() => {}
		)
		await jest.advanceTimersByTimeAsync(0)
		first.ackSubscribes()
		await jest.advanceTimersByTimeAsync(0)

		first.simulateClose()
		const second = await connectAndOpen()
		await jest.advanceTimersByTimeAsync(0)
		const secondId = `srv-${String(subscribeMessages(second)[0].id)}`

		// Unsubscribe *before* the re-subscribe is answered.
		unsubscribe()
		await jest.advanceTimersByTimeAsync(0)

		second.ackSubscribes()
		await jest.advanceTimersByTimeAsync(0)

		const cancels = second.sent.filter((m) => m.type === 'unsubscribe')
		expect(cancels.map((m) => m.subscriptionId)).toContain(secondId)

		sendChange(second, secondId)
		expect(events).toHaveLength(0)
	})

	it('drops a queued frame whose request timed out on its own', async () => {
		// The timeout deletes the pending request but cannot reach into the queue,
		// and `handleDisconnect` only clears the queue when a pending request is
		// still outstanding — so nothing but the flush filter stops this frame.
		const timedOut = ws.send({ type: 'ping' }).catch(() => 'timed out')
		await jest.advanceTimersByTimeAsync(30_000)
		expect(await timedOut).toBe('timed out')

		const socket = await connectAndOpen()
		await jest.advanceTimersByTimeAsync(0)

		expect(socket.sent.filter((m) => m.type === 'ping')).toHaveLength(0)
	})

	it('re-establishes a subscription whose queued frame timed out, exactly once', async () => {
		// Offline long enough for the queued subscribe to time out. The stale frame
		// must not be flushed: the server would answer with an id the client has no
		// record of, whose change events pile up unread forever. The record itself
		// stays, so the reconnect re-subscribes under a live id.
		const events: unknown[] = []
		const onError = jest.fn()
		ws.subscribe('p', undefined, (event) => events.push(event), onError)

		await jest.advanceTimersByTimeAsync(30_000)
		// A transport timeout is not a rejection of the subscription.
		expect(onError).not.toHaveBeenCalled()

		const socket = await connectAndOpen()
		await jest.advanceTimersByTimeAsync(0)

		const sent = subscribeMessages(socket)
		expect(sent).toHaveLength(1)

		socket.ackSubscribes()
		await jest.advanceTimersByTimeAsync(0)

		// Live, and the only one: the callback is registered on the id the server
		// just assigned.
		sendChange(socket, `srv-${String(sent[0].id)}`)
		expect(events).toHaveLength(1)
		expect(onError).not.toHaveBeenCalled()
	})

	it('keeps a subscription whose subscribe was interrupted by a disconnect', async () => {
		// The disconnect rejects the in-flight subscribe with a ConnectionError.
		// Treating that as a server rejection deletes the record, leaving
		// `reestablishSubscriptions` nothing to replay — and `Query.onSnapshot`'s
		// default onError only logs, so the consumer is silently dead until it
		// remounts.
		const first = await connectAndOpen()

		const events: unknown[] = []
		const onError = jest.fn()
		const unsubscribe = ws.subscribe('p', undefined, (event) => events.push(event), onError)
		await jest.advanceTimersByTimeAsync(0)
		expect(subscribeMessages(first)).toHaveLength(1)

		// Dropped before the `subscribeResult` ever arrives.
		first.simulateClose()
		await jest.advanceTimersByTimeAsync(0)
		expect(onError).not.toHaveBeenCalled()

		const second = await connectAndOpen()
		await jest.advanceTimersByTimeAsync(0)

		const replayed = subscribeMessages(second)
		expect(replayed).toHaveLength(1)

		second.ackSubscribes()
		await jest.advanceTimersByTimeAsync(0)

		sendChange(second, `srv-${String(replayed[0].id)}`)
		expect(events).toHaveLength(1)
		expect(onError).not.toHaveBeenCalled()

		unsubscribe()
	})

	it('does not report an error when the re-subscribe is interrupted by a disconnect', async () => {
		// Two consecutive drops: the second kills the re-subscribe before its ack, so
		// `clearPendingRequests` rejects it with a ConnectionError. That is a transport
		// failure, not a rejection of the subscription — the record survives and the
		// next open replays it, so reporting a failure would report one that did not
		// happen.
		const first = await connectAndOpen()

		const events: unknown[] = []
		const onError = jest.fn()
		const unsubscribe = ws.subscribe('p', undefined, (event) => events.push(event), onError)
		await jest.advanceTimersByTimeAsync(0)
		first.ackSubscribes()
		await jest.advanceTimersByTimeAsync(0)

		first.simulateClose()
		const second = await connectAndOpen()
		await jest.advanceTimersByTimeAsync(0)
		expect(subscribeMessages(second)).toHaveLength(1)

		// Dropped again before the re-subscribe is answered.
		second.simulateClose()
		await jest.advanceTimersByTimeAsync(0)
		expect(onError).not.toHaveBeenCalled()

		const third = await connectAndOpen()
		await jest.advanceTimersByTimeAsync(0)

		const replayed = subscribeMessages(third)
		expect(replayed).toHaveLength(1)

		third.ackSubscribes()
		await jest.advanceTimersByTimeAsync(0)

		sendChange(third, `srv-${String(replayed[0].id)}`)
		expect(events).toHaveLength(1)
		expect(onError).not.toHaveBeenCalled()

		unsubscribe()
	})

	it('drops queued frames whose promise was rejected', async () => {
		// `send` registers the pending request before queueing, so the two correspond
		// one-to-one: a frame whose promise was rejected must not reach the wire on
		// the next connect, or it creates server-side state the client has no record
		// of.
		const rejected = ws.send({ type: 'ping' }).catch(() => 'rejected')

		await ws.disconnect()
		expect(await rejected).toBe('rejected')

		const socket = await connectAndOpen()
		await jest.advanceTimersByTimeAsync(0)

		expect(socket.sent.filter((m) => m.type === 'ping')).toHaveLength(0)
	})
})

// vim: ts=4

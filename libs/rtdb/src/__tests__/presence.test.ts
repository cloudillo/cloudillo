// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PresenceEntry } from '@cloudillo/core'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import { RtdbPresence } from '../presence'
import type { PresenceEvent } from '../types'
import { WebSocketManager } from '../websocket'
import {
	connectAndOpen,
	installMockWebSocket,
	MockWebSocket,
	restoreWebSocket
} from './mocks/websocket.mock'

class PresenceSocket extends MockWebSocket {
	/** Request ids already answered, so `ack…` only ever answers new frames. */
	private answered = new Set<number>()

	/** Answer every unanswered `presence` frame the way the server would. */
	ackPresence(opts?: { throttled?: boolean }): void {
		for (const msg of this.presenceFrames()) {
			const id = msg.id as number
			if (this.answered.has(id)) continue
			this.answered.add(id)
			this.receive({
				id,
				type: 'presenceResult',
				...(opts?.throttled ? { throttled: true } : {})
			})
		}
	}

	/** An old server, which has no `"presence"` arm at all. */
	rejectPresence(): void {
		for (const msg of this.presenceFrames()) {
			const id = msg.id as number
			if (this.answered.has(id)) continue
			this.answered.add(id)
			this.receive({ id, type: 'error', code: 400, message: 'Unknown command: presence' })
		}
	}

	/** A server that knows the command but refused this frame — a blip, not an answer. */
	failPresence(code: number, message: string): void {
		for (const msg of this.presenceFrames()) {
			const id = msg.id as number
			if (this.answered.has(id)) continue
			this.answered.add(id)
			this.receive({ id, type: 'error', code, message })
		}
	}

	/** Push an unsolicited presence event, id a random string as the server mints it. */
	pushPresence(event: PresenceEvent): void {
		this.receive({ id: 'rnd-abc', type: 'presenceChange', event })
	}

	presenceFrames(): Array<Record<string, unknown>> {
		return this.sent.filter((m) => m.type === 'presence')
	}
}

let sockets: PresenceSocket[] = []

beforeEach(() => {
	jest.useFakeTimers()
	sockets = installMockWebSocket(PresenceSocket)
})

afterEach(() => {
	jest.clearAllTimers()
	jest.useRealTimers()
	restoreWebSocket()
})

function makeManager(presence: boolean): WebSocketManager {
	return new WebSocketManager('test-db', () => 'test-token', 'wss://test.com', {
		enableCache: false,
		reconnect: false,
		reconnectDelay: 100,
		maxReconnectDelay: 1000,
		debug: false,
		presence
	})
}

/** The roster as `subscribe` last reported it. */
function latest(seen: PresenceEntry[][]): PresenceEntry[] {
	return seen[seen.length - 1] ?? []
}

function entryState(entry: PresenceEntry, field: string): unknown {
	return (entry.state as Record<string, unknown> | undefined)?.[field]
}

describe('presence opt-in', () => {
	it('asks for the channel in the socket url only when enabled', async () => {
		const on = makeManager(true)
		expect((await connectAndOpen(on, sockets)).url).toContain('presence=1')

		const off = makeManager(false)
		expect((await connectAndOpen(off, sockets)).url).not.toContain('presence')
	})

	it('sends nothing when presence was never enabled', async () => {
		// The server answers such a frame with a 400, so not sending it at all is the
		// difference between "no presence" and "an error per keystroke".
		const ws = makeManager(false)
		const socket = await connectAndOpen(ws, sockets)

		const presence = new RtdbPresence(ws, { user: { name: 'Ada' } })
		await jest.advanceTimersByTimeAsync(0)

		expect(socket.presenceFrames()).toHaveLength(0)
		presence.close()
	})
})

describe('roster events', () => {
	let ws: WebSocketManager
	let socket: PresenceSocket
	let presence: RtdbPresence
	let seen: PresenceEntry[][]

	beforeEach(async () => {
		ws = makeManager(true)
		socket = await connectAndOpen(ws, sockets)
		// No local user: nothing is published, so the roster is exactly what the
		// server said and the assertions below are not competing with our own entry.
		presence = new RtdbPresence(ws)
		seen = []
		presence.subscribe((entries) => seen.push(entries))
	})

	afterEach(() => {
		presence.close()
	})

	it('replaces the whole roster on sync', () => {
		socket.pushPresence({
			action: 'sync',
			connId: 'me',
			users: [
				{ connId: 'a', state: { user: { name: 'Ada' } } },
				{ connId: 'b', state: { user: { name: 'Bo' } } }
			]
		})
		expect(latest(seen).map((e) => e.connId)).toEqual(['a', 'b'])

		// A reconnect's sync is the whole truth, not a delta — anything it omits has
		// gone, and leaving it behind is exactly the stale-ghost bug.
		socket.pushPresence({
			action: 'sync',
			connId: 'me',
			users: [{ connId: 'c', state: { user: { name: 'Cy' } } }]
		})
		expect(latest(seen).map((e) => e.connId)).toEqual(['c'])
	})

	it('upserts on join and update and deletes on leave', () => {
		socket.pushPresence({ action: 'sync', connId: 'me', users: [] })
		socket.pushPresence({ action: 'join', connId: 'a', state: { user: { name: 'Ada' } } })
		expect(latest(seen).map((e) => e.name)).toEqual(['Ada'])

		socket.pushPresence({
			action: 'update',
			connId: 'a',
			state: { user: { name: 'Ada' }, page: 'pg-7' }
		})
		expect(latest(seen)).toHaveLength(1)
		expect(entryState(latest(seen)[0], 'page')).toBe('pg-7')

		socket.pushPresence({ action: 'leave', connId: 'a' })
		expect(latest(seen)).toHaveLength(0)
	})

	it('marks the connection named by sync as self', () => {
		socket.pushPresence({
			action: 'sync',
			connId: 'me',
			users: [
				{ connId: 'a', state: { user: { name: 'Ada' } } },
				{ connId: 'me', state: { user: { name: 'Self' } } }
			]
		})

		expect(presence.connId).toBe('me')
		const bySelf = Object.fromEntries(latest(seen).map((e) => [e.connId, e.self]))
		expect(bySelf).toEqual({ a: false, me: true })
	})

	it('drops a connection that has published nothing readable', () => {
		// A member is in the room from connect but out of the roster until it
		// publishes, so a pure watcher must never show up as a faceless avatar.
		socket.pushPresence({
			action: 'sync',
			connId: 'me',
			users: [{ connId: 'a', state: null }, { connId: 'b' }]
		})
		expect(latest(seen)).toHaveLength(0)
	})
})

describe('publishing', () => {
	it('shows the local entry before the server has said anything', async () => {
		// The server never echoes an event to its originator, so nothing would ever
		// tell us about ourselves — our own avatar would be missing from our own
		// DocBar until a reconnect.
		const ws = makeManager(true)
		const socket = await connectAndOpen(ws, sockets)
		socket.pushPresence({ action: 'sync', connId: 'me', users: [] })

		const presence = new RtdbPresence(ws, { user: { name: 'Ada', idTag: '@ada.test' } })
		const seen: PresenceEntry[][] = []
		presence.subscribe((entries) => seen.push(entries))

		expect(latest(seen)).toHaveLength(1)
		expect(latest(seen)[0]).toMatchObject({ connId: 'me', name: 'Ada', self: true })
		presence.close()
	})

	it('survives a sync that predates our first publish', async () => {
		// The server builds `sync` when we JOIN, which is before we have published,
		// so it never contains us. Replacing the roster with it verbatim would blink
		// our own avatar out.
		const ws = makeManager(true)
		const socket = await connectAndOpen(ws, sockets)
		const presence = new RtdbPresence(ws, { user: { name: 'Ada' } })
		const seen: PresenceEntry[][] = []
		presence.subscribe((entries) => seen.push(entries))

		socket.pushPresence({
			action: 'sync',
			connId: 'me',
			users: [{ connId: 'a', state: { user: { name: 'Ada2' } } }]
		})

		expect(
			latest(seen)
				.map((e) => e.connId)
				.sort()
		).toEqual(['a', 'me'])
		presence.close()
	})

	it('coalesces a burst into a leading and a trailing frame', async () => {
		// Leading so the first move of a drag is instant, trailing so the last one is
		// never the one that gets dropped.
		const ws = makeManager(true)
		const socket = await connectAndOpen(ws, sockets)
		const presence = new RtdbPresence(ws, { user: { name: 'Ada' } })
		await jest.advanceTimersByTimeAsync(0)
		expect(socket.presenceFrames()).toHaveLength(1)

		presence.setState({ block: 'b1' })
		presence.setState({ block: 'b2' })
		presence.setState({ block: 'b3' })
		await jest.advanceTimersByTimeAsync(0)
		expect(socket.presenceFrames()).toHaveLength(1)

		await jest.advanceTimersByTimeAsync(500)
		const frames = socket.presenceFrames()
		expect(frames).toHaveLength(2)
		expect((frames[1].state as Record<string, unknown>).block).toBe('b3')

		presence.close()
	})

	it('re-sends once after the server reports a throttle', async () => {
		// A throttled frame is stored nowhere and broadcast to nobody, so the state
		// is simply lost unless the client says it again.
		const ws = makeManager(true)
		const socket = await connectAndOpen(ws, sockets)
		const presence = new RtdbPresence(ws, { user: { name: 'Ada' } })
		await jest.advanceTimersByTimeAsync(0)

		socket.ackPresence({ throttled: true })
		await jest.advanceTimersByTimeAsync(0)
		expect(socket.presenceFrames()).toHaveLength(1)

		await jest.advanceTimersByTimeAsync(500)
		expect(socket.presenceFrames()).toHaveLength(2)

		socket.ackPresence()
		await jest.advanceTimersByTimeAsync(1000)
		expect(socket.presenceFrames()).toHaveLength(2)

		presence.close()
	})

	it('records but does not queue a publish made while disconnected', async () => {
		// A queued frame would reach the wire alongside the `onopen` re-publish:
		// `flushMessageQueue` only drops frames whose promise has already settled,
		// and a presence promise is still live.
		const ws = makeManager(true)
		const presence = new RtdbPresence(ws, { user: { name: 'Ada' } })
		presence.setState({ block: 'b1' })
		// Past the throttle, so the trailing publish has recorded the block too.
		await jest.advanceTimersByTimeAsync(500)

		const socket = await connectAndOpen(ws, sockets)
		await jest.advanceTimersByTimeAsync(0)

		const frames = socket.presenceFrames()
		expect(frames).toHaveLength(1)
		expect((frames[0].state as Record<string, unknown>).block).toBe('b1')

		presence.close()
	})

	it('re-publishes after a reconnect without re-subscribing', async () => {
		// The `?presence=1` flag rides in the URL, so the server has already put us
		// back in the room — but it has forgotten what we said in it.
		const ws = makeManager(true)
		const first = await connectAndOpen(ws, sockets)
		const presence = new RtdbPresence(ws, { user: { name: 'Ada' } })
		presence.setState({ page: 'pg-7' })
		await jest.advanceTimersByTimeAsync(500)
		first.ackPresence()
		expect(first.presenceFrames()).toHaveLength(2)

		first.simulateClose()
		const second = await connectAndOpen(ws, sockets)
		await jest.advanceTimersByTimeAsync(0)

		const frames = second.presenceFrames()
		expect(frames).toHaveLength(1)
		expect((frames[0].state as Record<string, unknown>).page).toBe('pg-7')
		// Presence is connection-level; there is no such thing as a presence
		// subscription to re-establish.
		expect(second.sent.filter((m) => m.type === 'subscribe')).toHaveLength(0)

		presence.close()
	})

	it('gives up for good when the server rejects presence itself', async () => {
		// A server predating the channel answers `error 400 Unknown command`. Without
		// this the app pays a rejected request per keystroke, forever.
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		const ws = makeManager(true)
		const socket = await connectAndOpen(ws, sockets)
		const presence = new RtdbPresence(ws, { user: { name: 'Ada' } })
		await jest.advanceTimersByTimeAsync(0)
		expect(socket.presenceFrames()).toHaveLength(1)

		socket.rejectPresence()
		await jest.advanceTimersByTimeAsync(0)

		presence.setState({ block: 'b1' })
		await jest.advanceTimersByTimeAsync(1000)
		expect(socket.presenceFrames()).toHaveLength(1)
		expect(warn).toHaveBeenCalledTimes(1)

		presence.close()
		warn.mockRestore()
	})

	it('keeps publishing after a rate limit or a server error', async () => {
		// Only `400 Unknown command` says the channel is not there. A 429 or a 500 is
		// this frame's problem, and latching on one froze the roster for the rest of
		// the session.
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		for (const [code, message] of [
			[429, 'Too many requests'],
			[500, 'Internal error']
		] as const) {
			const ws = makeManager(true)
			const socket = await connectAndOpen(ws, sockets)
			const presence = new RtdbPresence(ws, { user: { name: 'Ada' } })
			await jest.advanceTimersByTimeAsync(0)
			expect(socket.presenceFrames()).toHaveLength(1)

			socket.failPresence(code, message)
			await jest.advanceTimersByTimeAsync(0)

			presence.setState({ block: 'b1' })
			await jest.advanceTimersByTimeAsync(1000)
			expect(socket.presenceFrames()).toHaveLength(2)

			presence.close()
		}
		warn.mockRestore()
	})

	it('keeps publishing when a frame dies with the socket', async () => {
		// A transport failure is not a rejection of the channel: the reconnect
		// re-publishes, so treating it as one would disable presence on the first
		// dropped connection.
		const ws = makeManager(true)
		const first = await connectAndOpen(ws, sockets)
		const presence = new RtdbPresence(ws, { user: { name: 'Ada' } })
		await jest.advanceTimersByTimeAsync(0)

		// Dropped before the `presenceResult` ever arrives.
		first.simulateClose()
		await jest.advanceTimersByTimeAsync(0)

		const second = await connectAndOpen(ws, sockets)
		await jest.advanceTimersByTimeAsync(0)
		expect(second.presenceFrames()).toHaveLength(1)

		presence.close()
	})
})

// vim: ts=4

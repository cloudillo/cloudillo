// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The 4401 token-refresh budgets, against the server behaviour that defeats a
 * naive implementation: accept the upgrade, send a frame, then close 4401.
 *
 * Replenishing on any inbound frame lets a single pong per attempt hand the budget
 * straight back, and the client loops refresh → reconnect → 4401 forever with no
 * delay. Only a connection that stays up replenishes, which that server cannot fake.
 *
 * The second block covers the split between the two budgets: a refresh that threw
 * or yielded nothing proves nothing about access, so it must not spend the
 * definitive one — and with `reconnect` disabled it must still terminate, since the
 * backoff is a no-op there.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

import { AuthError } from '../errors'
import { WebSocketManager } from '../websocket'

// Mirrors websocket.ts (module-private).
const MAX_TOKEN_REFRESH_ATTEMPTS = 2
const MAX_TOKEN_REFRESH_FAILURES = 5
const CONNECTION_HEALTHY_MS = 10_000

const RECONNECT_DELAY = 100

function setGlobal(key: string, value: unknown): void {
	Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
}

class TestCloseEvent extends Event {
	code: number
	reason: string
	constructor(type: string, init?: { code?: number; reason?: string }) {
		super(type)
		this.code = init?.code ?? 0
		this.reason = init?.reason ?? ''
	}
}
setGlobal('CloseEvent', TestCloseEvent)

/** What the fake server does with each socket it accepts. */
type ServerScript = (ws: FakeWebSocket) => void

let script: ServerScript = () => {}
let sockets: FakeWebSocket[] = []

class FakeWebSocket {
	static readonly CONNECTING = 0
	static readonly OPEN = 1
	static readonly CLOSED = 3

	readyState = 0
	onopen: ((event: Event) => void) | null = null
	onclose: ((event: TestCloseEvent) => void) | null = null
	onerror: ((event: Event) => void) | null = null
	onmessage: ((event: { data: string }) => void) | null = null

	constructor(readonly url: string) {
		sockets.push(this)
		// Not synchronous: the manager registers its handlers after the
		// constructor returns.
		setTimeout(() => script(this), 0)
	}

	/**
	 * Answer a `subscribe` so the manager promotes the subscription into the map
	 * `notifyAuthError` iterates — an unanswered one never gets an `onError`.
	 */
	send(data?: string): void {
		if (!data) return
		const msg = JSON.parse(data) as { type: string; id: number }
		if (msg.type === 'subscribe') {
			this.frame({ type: 'subscribeResult', id: msg.id, subscriptionId: `sub-${msg.id}` })
		}
	}

	/** The manager's own teardown. Never re-enters onclose — it nulls handlers first. */
	close(): void {
		this.readyState = FakeWebSocket.CLOSED
	}

	open(): void {
		this.readyState = FakeWebSocket.OPEN
		this.onopen?.(new Event('open'))
	}

	frame(message: unknown): void {
		this.onmessage?.({ data: JSON.stringify(message) })
	}

	closeWith(code: number): void {
		this.readyState = FakeWebSocket.CLOSED
		this.onclose?.(new TestCloseEvent('close', { code }))
	}
}

setGlobal('WebSocket', FakeWebSocket)

function createManager(
	refreshToken: () => Promise<string | undefined>,
	reconnect = true
): WebSocketManager {
	let generation = 0
	return new WebSocketManager(
		'test-db',
		() => `token-${generation++}`,
		'wss://test.example',
		{
			enableCache: false,
			reconnect,
			reconnectDelay: RECONNECT_DELAY,
			maxReconnectDelay: 1000,
			debug: false
		},
		refreshToken
	)
}

beforeEach(() => {
	jest.useFakeTimers()
	sockets = []
	script = () => {}
})

describe('4401 token-refresh cap', () => {
	it('stops refreshing after MAX_TOKEN_REFRESH_ATTEMPTS when every socket is closed 4401', async () => {
		// The defeating server: greet, then reject. The pong is what used to
		// replenish the budget on every single attempt.
		script = (ws) => {
			ws.open()
			ws.frame({ type: 'pong', id: 1 })
			ws.closeWith(4401)
		}
		const refreshToken = jest.fn(async () => 'fresh-token')
		const manager = createManager(refreshToken)

		// Not awaited before the clock moves: the fake socket only opens on a
		// timer, so `connect()` cannot settle until timers run.
		const connected = manager.connect().catch(() => {})
		// Far longer than the whole refresh/backoff sequence needs.
		await jest.advanceTimersByTimeAsync(60_000)
		await connected

		expect(refreshToken).toHaveBeenCalledTimes(MAX_TOKEN_REFRESH_ATTEMPTS)
		// One initial socket plus one per refresh, and nothing after the cap.
		expect(sockets).toHaveLength(MAX_TOKEN_REFRESH_ATTEMPTS + 1)

		await manager.disconnect()
	})

	it('spaces the post-refresh reconnect by the backoff instead of retrying at once', async () => {
		script = (ws) => {
			ws.open()
			ws.frame({ type: 'pong', id: 1 })
			ws.closeWith(4401)
		}
		const refreshToken = jest.fn(async () => 'fresh-token')
		const manager = createManager(refreshToken)

		const connected = manager.connect().catch(() => {})
		// Let the close and the refresh settle, but not the backoff.
		await jest.advanceTimersByTimeAsync(0)
		await connected
		expect(refreshToken).toHaveBeenCalledTimes(1)
		expect(sockets).toHaveLength(1)

		await jest.advanceTimersByTimeAsync(RECONNECT_DELAY)
		expect(sockets).toHaveLength(2)

		await manager.disconnect()
	})

	it('replenishes the budget once a connection stays up', async () => {
		// A connection that survives the health window is the only thing that
		// gives the budget back, so a later 4401 gets a full set of retries.
		let rejectNext = false
		script = (ws) => {
			ws.open()
			if (rejectNext) ws.closeWith(4401)
		}
		const refreshToken = jest.fn(async () => 'fresh-token')
		const manager = createManager(refreshToken)

		const connected = manager.connect()
		await jest.advanceTimersByTimeAsync(CONNECTION_HEALTHY_MS)
		await connected

		rejectNext = true
		sockets[0].closeWith(4401)
		await jest.advanceTimersByTimeAsync(60_000)

		expect(refreshToken).toHaveBeenCalledTimes(MAX_TOKEN_REFRESH_ATTEMPTS)

		await manager.disconnect()
	})
})

describe('4401 with an inconclusive refresh', () => {
	/** Connect, then register a subscription and collect what its onError sees. */
	async function connectAndSubscribe(manager: WebSocketManager): Promise<Error[]> {
		const errors: Error[] = []
		const connected = manager.connect()
		await jest.advanceTimersByTimeAsync(0)
		await connected
		manager.subscribe(
			'items',
			undefined,
			() => {},
			(err) => errors.push(err)
		)
		// The subscription only enters the map `notifyAuthError` reads once the
		// server's subscribeResult has been processed.
		await jest.advanceTimersByTimeAsync(0)
		return errors
	}

	it('fails the subscriptions when reconnect is disabled and the refresh throws', async () => {
		// The hang: with reconnect off, the inconclusive path fell through to a
		// backoff that is a no-op there, so no `onError` ever ran and the caller's
		// promise and UI waited forever.
		script = (ws) => {
			ws.open()
		}
		const refreshToken = jest.fn(async (): Promise<string | undefined> => {
			throw new Error('token endpoint down')
		})
		const manager = createManager(refreshToken, false)
		const errors = await connectAndSubscribe(manager)

		sockets[0].closeWith(4401)
		await jest.advanceTimersByTimeAsync(0)

		expect(refreshToken).toHaveBeenCalledTimes(1)
		expect(errors).toHaveLength(1)
		expect(errors[0]).toBeInstanceOf(AuthError)

		await manager.disconnect()
	})

	it('does not spend the definitive budget on refreshes that threw', async () => {
		// Sharing one budget, two blips at the token endpoint exhaust
		// MAX_TOKEN_REFRESH_ATTEMPTS and fail every subscription, though access was
		// never denied.
		script = (ws) => {
			ws.open()
			ws.closeWith(4401)
		}
		let calls = 0
		const refreshToken = jest.fn(async (): Promise<string | undefined> => {
			if (++calls <= 2) throw new Error('token endpoint down')
			return 'fresh-token'
		})
		const manager = createManager(refreshToken)

		const connected = manager.connect().catch(() => {})
		await jest.advanceTimersByTimeAsync(60_000)
		await connected

		// Two inconclusive refreshes, then the full definitive budget on top.
		expect(refreshToken).toHaveBeenCalledTimes(2 + MAX_TOKEN_REFRESH_ATTEMPTS)
		expect(sockets).toHaveLength(2 + MAX_TOKEN_REFRESH_ATTEMPTS + 1)

		await manager.disconnect()
	})

	it('still terminates after MAX_TOKEN_REFRESH_FAILURES consecutive throws', async () => {
		// The backstop: a throw does not spend the definitive budget, so a token
		// endpoint that never answers needs a bound of its own.
		script = (ws) => {
			ws.open()
			ws.closeWith(4401)
		}
		const refreshToken = jest.fn(async (): Promise<string | undefined> => {
			throw new Error('token endpoint down')
		})
		const manager = createManager(refreshToken)

		const connected = manager.connect().catch(() => {})
		await jest.advanceTimersByTimeAsync(60_000)
		await connected

		// One socket per failure plus the initial one, and nothing after the cap —
		// the last close falls through to the 4400-range branch. (That branch's
		// `onError` is covered by the reconnect-disabled case above; here every
		// socket dies before its subscribe is answered, so there is nothing in the
		// subscription map to notify.)
		expect(refreshToken).toHaveBeenCalledTimes(MAX_TOKEN_REFRESH_FAILURES)
		expect(sockets).toHaveLength(MAX_TOKEN_REFRESH_FAILURES + 1)

		await manager.disconnect()
	})
})

describe('teardown during an in-flight 4401 refresh', () => {
	/** A refresh the test resolves by hand, so the teardown lands mid-flight. */
	function deferredRefresh(): {
		refreshToken: () => Promise<string | undefined>
		resolve: (token: string | undefined) => void
	} {
		let resolve!: (token: string | undefined) => void
		const promise = new Promise<string | undefined>((r) => {
			resolve = r
		})
		return { refreshToken: () => promise, resolve }
	}

	it('does not reopen a socket when disconnect() lands before the refresh resolves', async () => {
		// The caller unmounted (useComments, taskillo) and is gone, so a late
		// refresh must not reconnect and re-establish subscriptions with no owner.
		script = (ws) => {
			ws.open()
			ws.closeWith(4401)
		}
		const { refreshToken, resolve } = deferredRefresh()
		const manager = createManager(refreshToken)

		const connected = manager.connect().catch(() => {})
		await jest.advanceTimersByTimeAsync(0)
		await connected
		expect(sockets).toHaveLength(1)

		await manager.disconnect()
		resolve('fresh-token')
		await jest.advanceTimersByTimeAsync(60_000)

		expect(sockets).toHaveLength(1)
	})

	it('does not defeat stopReconnection() with a late refresh', async () => {
		// `reconnect: false` is the riskiest case — the backoff is a no-op there, so
		// the 4401 path reconnects directly — and it is the state stopReconnection
		// installs.
		script = (ws) => {
			ws.open()
			ws.closeWith(4401)
		}
		const { refreshToken, resolve } = deferredRefresh()
		const manager = createManager(refreshToken, false)

		const connected = manager.connect().catch(() => {})
		await jest.advanceTimersByTimeAsync(0)
		await connected
		expect(sockets).toHaveLength(1)

		manager.stopReconnection()
		resolve('fresh-token')
		await jest.advanceTimersByTimeAsync(60_000)

		expect(sockets).toHaveLength(1)

		await manager.disconnect()
	})

	it('clears a pending reconnect timer on disconnect()', async () => {
		// A plain (non-auth) close arms the backoff; disconnect() must disarm it.
		script = (ws) => {
			ws.open()
			ws.closeWith(1006)
		}
		const manager = createManager(async () => 'fresh-token')

		const connected = manager.connect().catch(() => {})
		await jest.advanceTimersByTimeAsync(0)
		await connected
		expect(sockets).toHaveLength(1)

		await manager.disconnect()
		await jest.advanceTimersByTimeAsync(60_000)

		expect(sockets).toHaveLength(1)
	})
})

// vim: ts=4

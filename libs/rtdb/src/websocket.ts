// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { buildRtdbUrl } from '@cloudillo/core'
import * as T from '@symbion/runtype'

import { AuthError, ConnectionError, RtdbError, TimeoutError } from './errors.js'
import {
	type AggregateOptions,
	type ChangeEvent,
	type ClientMessage,
	type QueryFilter,
	type RtdbClientOptions,
	type ServerMessage,
	tServerMessage
} from './types.js'

// Token refreshes attempted for one unhealthy connection streak before the subscriptions are
// failed with an AuthError. Two covers the realistic cases (a token that expired mid-session,
// a racing renewal) without letting a permanently-rejected resource drive an unbounded loop.
const MAX_TOKEN_REFRESH_ATTEMPTS = 2

// Refreshes that threw or yielded nothing, for the same streak. A separate budget because
// such a refresh proves nothing about access: spending the definitive one on it would let two
// 5xx/offline blips at the token endpoint permanently fail every subscription on a resource
// the user can read fine. Also the backstop that keeps termination guaranteed — without it a
// token endpoint that never answers would reconnect forever.
const MAX_TOKEN_REFRESH_FAILURES = 5

// How long a connection must stay up to count as healthy and replenish the retry budgets.
// Longer than the accept-then-close-4401 sequence a rejected resource produces, shorter than
// the 30s ping interval so an idle-but-working connection still counts as healthy.
const CONNECTION_HEALTHY_MS = 10_000

interface PendingRequest {
	resolve: (value: unknown) => void
	reject: (reason: Error) => void
	timeout: ReturnType<typeof setTimeout>
}

interface Subscription {
	callback: (event: ChangeEvent) => void
	onError: (error: Error) => void
}

interface SubscriptionDetails {
	path: string
	filter: QueryFilter | undefined
	aggregate?: AggregateOptions
	callback: (event: ChangeEvent) => void
	onError: (error: Error) => void
}

export class WebSocketManager {
	private ws: WebSocket | null = null
	private connected = false
	private connecting = false
	private connectPromise: Promise<void> | null = null
	private connectionId = 0
	private errorNotified = false
	private reconnectAttempts = 0
	private pendingRequests = new Map<number, PendingRequest>()
	private subscriptions = new Map<string, Subscription>()
	private subscriptionDetails = new Map<string, SubscriptionDetails>() // Store subscription info for reconnection
	private pendingSubscriptionEvents = new Map<string, ChangeEvent[]>() // Buffer events that arrive before subscription is registered
	private messageQueue: ClientMessage[] = []
	private requestId = 0
	private pingInterval: ReturnType<typeof setInterval> | null = null
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
	private debug: boolean

	// Set by `disconnect()` and `stopReconnection()`: the caller is done with this client and
	// nothing already in flight may revive it. Distinct from `options.reconnect === false`,
	// which only means "never auto-reconnect on a dropped socket" — such a client may still
	// legitimately be reconnected by the 4401 refresh path.
	private stopped = false

	// Bounds the 4401 recovery path so a genuinely unauthorized resource can't spin through
	// refresh → reconnect → 4401 → refresh forever. Counting attempts is what makes the bound
	// real: tracking an in-flight refresh instead would not, since it settles from `onopen` —
	// and an upgrade the server accepts and *then* closes 4401 would clear the flag and loop
	// with no delay and no cap.
	//
	// Counted on the *success* path only: a refresh that produced a token and was answered
	// with another 4401 is the server saying no, and only that may spend this budget.
	// Inconclusive refreshes go to `tokenRefreshFailures`. Reset only from a connection that
	// proved healthy (see `healthyTimer`).
	private tokenRefreshAttempts = 0

	// Consecutive refreshes that threw or yielded nothing. See MAX_TOKEN_REFRESH_FAILURES;
	// reset alongside `tokenRefreshAttempts`.
	private tokenRefreshFailures = 0

	// Fires CONNECTION_HEALTHY_MS after `onopen` and is the only thing that replenishes the
	// *token-refresh* budgets. "A frame arrived" is not enough: a server that greets the socket
	// then closes it 4401 sends a frame on every attempt (a pong will do), handing the budget
	// straight back and making the cap unreachable — "the connection stayed up" cannot be faked
	// that way. Cleared on every teardown, so a socket dying inside the window replenishes
	// nothing. The plain reconnect backoff is not gated this way; see `onopen`.
	private healthyTimer: ReturnType<typeof setTimeout> | null = null

	constructor(
		private dbId: string,
		private getToken: () => string | undefined | Promise<string | undefined>,
		private serverUrl: string,
		private options: Required<Exclude<RtdbClientOptions['options'], undefined>>,
		private refreshToken?: () => Promise<string | undefined>
	) {
		this.debug = options.debug
	}

	/** Arm the healthy-connection timer, replacing any previous one. */
	private startHealthyTimer(): void {
		this.stopHealthyTimer()
		this.healthyTimer = setTimeout(() => {
			this.healthyTimer = null
			this.log('Connection healthy, token refresh budget replenished')
			this.tokenRefreshAttempts = 0
			this.tokenRefreshFailures = 0
		}, CONNECTION_HEALTHY_MS)
	}

	private stopHealthyTimer(): void {
		if (this.healthyTimer) {
			clearTimeout(this.healthyTimer)
			this.healthyTimer = null
		}
	}

	private cleanupWebSocket(): void {
		this.stopHealthyTimer()
		if (this.ws) {
			this.ws.onopen = null
			this.ws.onclose = null
			this.ws.onerror = null
			this.ws.onmessage = null
			if (
				this.ws.readyState === WebSocket.OPEN ||
				this.ws.readyState === WebSocket.CONNECTING
			) {
				this.ws.close()
			}
			this.ws = null
		}
	}

	async connect(): Promise<void> {
		if (this.connected) return
		if (this.connecting && this.connectPromise) return this.connectPromise

		this.stopped = false

		// Cancel any pending reconnect
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
			this.reconnectTimeout = null
		}

		this.connecting = true
		this.connectPromise = this._doConnect()
		try {
			await this.connectPromise
		} finally {
			this.connecting = false
			this.connectPromise = null
		}
	}

	private async _doConnect(): Promise<void> {
		try {
			const token = await this.getToken()

			return new Promise((resolve, reject) => {
				const wsUrl = buildRtdbUrl(this.serverUrl, this.dbId, token)

				// Clean up any previous WebSocket before creating a new one
				this.cleanupWebSocket()

				// Capture connection ID to detect stale handlers
				const connId = ++this.connectionId

				try {
					this.ws = new WebSocket(wsUrl)
				} catch (error) {
					reject(new ConnectionError('Failed to create WebSocket', { cause: error }))
					return
				}

				// Set up connection timeout before registering event handlers
				const timeout = setTimeout(() => {
					if (!this.connected) {
						reject(new TimeoutError('Connection timeout'))
						this.ws?.close()
					}
				}, 10000)

				this.ws.onopen = () => {
					if (connId !== this.connectionId) return // Stale handler
					clearTimeout(timeout)
					this.log('Connected to server')
					this.connected = true
					this.errorNotified = false
					// An accepted upgrade proves the *transport* works, so the backoff
					// resets here — otherwise a link that drops faster than the health
					// window (captive portal, idle-cutting proxy, mobile handoff)
					// ratchets to maxReconnectDelay and stays there even though every
					// reconnect succeeds.
					this.reconnectAttempts = 0
					// The token-refresh budget is NOT cleared here: an accepted upgrade
					// is not yet an accepted *authorization* (the server may close it
					// 4401 right after). Cleared only if this socket is still up
					// CONNECTION_HEALTHY_MS from now.
					this.startHealthyTimer()
					this.startPingInterval()
					this.flushMessageQueue()
					this.reestablishSubscriptions() // Re-establish subscriptions after reconnect
					resolve()
				}

				this.ws.onmessage = (event) => {
					if (connId !== this.connectionId) return // Stale handler
					this.handleMessage(event.data)
				}

				this.ws.onerror = (event) => {
					if (connId !== this.connectionId) return // Stale handler
					clearTimeout(timeout)
					const error = new ConnectionError('WebSocket error', { cause: event })
					this.handleError(error)
					reject(error)
				}

				this.ws.onclose = (event: CloseEvent) => {
					if (connId !== this.connectionId) return // Stale handler
					clearTimeout(timeout)
					this.handleDisconnect(event.code, event.reason)
				}
			})
		} catch (error) {
			this.handleError(error as Error)
			throw error
		}
	}

	async disconnect(): Promise<void> {
		this.stopped = true
		this.connecting = false
		this.connectPromise = null
		// Invalidate in-flight async work (the 4401 refresh IIFE, stale socket handlers) so a
		// late resolution cannot reopen a socket nobody owns.
		this.connectionId++
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
			this.reconnectTimeout = null
		}
		this.cleanupWebSocket()
		this.connected = false
		this.stopPingInterval()
		this.clearPendingRequests()
	}

	async send<T>(message: ClientMessage): Promise<T> {
		const id = ++this.requestId
		const messageWithId = { ...message, id }

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id)
					reject(new TimeoutError(`Request ${id} timeout after 30s`))
				}
			}, 30000)

			this.pendingRequests.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
				timeout
			})

			if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
				try {
					this.ws.send(JSON.stringify(messageWithId))
					this.log('Sent:', messageWithId)
				} catch (error) {
					this.pendingRequests.delete(id)
					clearTimeout(timeout)
					reject(new ConnectionError('Failed to send message', { cause: error }))
				}
			} else if (this.connected && this.ws) {
				// WebSocket exists but is not in OPEN state — reject immediately
				this.pendingRequests.delete(id)
				clearTimeout(timeout)
				reject(new ConnectionError('WebSocket is not in OPEN state'))
			} else {
				this.messageQueue.push(messageWithId)
				this.log('Queued:', messageWithId)
			}
		})
	}

	subscribe(
		path: string,
		filter: QueryFilter | undefined,
		callback: (event: ChangeEvent) => void,
		onError: (error: Error) => void,
		aggregate?: AggregateOptions
	): () => void {
		// Generate a local ID for tracking this subscription
		const localId = `local_sub_${++this.requestId}`
		let serverSubscriptionId: string | null = null
		let cancelled = false

		// Store subscription details for reconnection
		this.subscriptionDetails.set(localId, { path, filter, aggregate, callback, onError })

		// Send subscription message and wait for subscribeResult
		this.send({
			type: 'subscribe',
			path,
			filter,
			...(aggregate && { aggregate })
		})
			.then((result: unknown) => {
				const subId = (result as { subscriptionId: string }).subscriptionId

				// If unsubscribe was called before the server responded,
				// immediately tell the server to unsubscribe
				if (cancelled) {
					this.send({
						type: 'unsubscribe',
						subscriptionId: subId
					}).catch((error) => {
						this.log('Error unsubscribing cancelled subscription:', error)
					})
					this.pendingSubscriptionEvents.delete(subId)
					return
				}

				serverSubscriptionId = subId
				this.subscriptions.set(subId, { callback, onError })

				// Replay any events that arrived before the subscription was registered
				const buffered = this.pendingSubscriptionEvents.get(subId)
				if (buffered) {
					this.pendingSubscriptionEvents.delete(subId)
					for (const event of buffered) {
						try {
							callback(event)
						} catch (error) {
							console.error(
								'[RTDB] Error in subscription callback (replayed):',
								error
							)
							onError(error as Error)
						}
					}
				}
			})
			.catch((error) => {
				if (cancelled) return
				console.error('[RTDB] Subscribe failed:', error)
				this.subscriptionDetails.delete(localId) // Clean up on error
				onError(error)
			})

		// Return unsubscribe function
		return () => {
			cancelled = true
			this.subscriptionDetails.delete(localId) // Remove from re-subscription list
			if (serverSubscriptionId) {
				this.subscriptions.delete(serverSubscriptionId)
				this.send({
					type: 'unsubscribe',
					subscriptionId: serverSubscriptionId
				}).catch((error) => {
					console.error('[RTDB] Error unsubscribing:', error)
					this.log('Error unsubscribing:', error)
				})
			}
			// If serverSubscriptionId is null, the .then() handler will send unsubscribe
		}
	}

	private handleMessage(rawData: string): void {
		// Deliberately does NOT touch the retry budgets — a frame is trivially cheap for a
		// server about to close 4401. `startHealthyTimer` owns replenishment.
		try {
			const data = JSON.parse(rawData)
			this.log('Received:', data)

			const result = T.decode(tServerMessage, data)

			if (T.isErr(result)) {
				console.error('[RTDB] Invalid message format:', result.err)
				console.error('[RTDB] Failed message:', data)
				console.error('[RTDB] Raw data:', rawData)
				this.log('Invalid message format:', result.err)
				return
			}

			const message: ServerMessage = result.ok

			if ('id' in message && typeof message.id === 'number' && message.id) {
				const pending = this.pendingRequests.get(message.id)
				if (pending) {
					clearTimeout(pending.timeout)
					this.pendingRequests.delete(message.id)

					if (message.type === 'error') {
						const error = new RtdbError(message.message, message.code, message.details)
						pending.reject(error)
					} else {
						pending.resolve(message)
					}
				}
			}

			// Handle subscription changes
			if (message.type === 'change') {
				const sub = this.subscriptions.get(message.subscriptionId)
				if (sub) {
					try {
						sub.callback(message.event)
					} catch (error) {
						console.error('[RTDB] Error in subscription callback:', error)
						console.error('[RTDB] Event:', message.event)
						sub.onError(error as Error)
					}
				} else {
					// Buffer events that arrive before subscription is registered (race condition)
					const buf = this.pendingSubscriptionEvents.get(message.subscriptionId)
					if (buf) {
						buf.push(message.event)
					} else {
						this.pendingSubscriptionEvents.set(message.subscriptionId, [message.event])
					}
				}
			}

			// Handle pong (keepalive)
			if (message.type === 'pong') {
				this.log('Pong received')
			}
		} catch (error) {
			console.error('[RTDB] Error handling message:', error)
			console.error('[RTDB] Raw message:', rawData)
			this.log('Error handling message:', error)
		}
	}

	private handleError(error: Error): void {
		this.log('Error:', error)

		// Reject all pending requests
		for (const [_id, pending] of this.pendingRequests.entries()) {
			clearTimeout(pending.timeout)
			pending.reject(error)
		}
		this.pendingRequests.clear()

		// Notify all subscriptions
		this.errorNotified = true
		for (const [, sub] of this.subscriptions.entries()) {
			sub.onError(error)
		}
	}

	private reestablishSubscriptions(): void {
		// Clear old subscription map (server-side IDs are no longer valid)
		this.subscriptions.clear()

		// Re-subscribe to all stored subscriptions
		if (this.subscriptionDetails.size > 0) {
			console.log(
				`[RTDB] Re-establishing ${this.subscriptionDetails.size} subscriptions after reconnect`
			)

			for (const [_localId, details] of this.subscriptionDetails.entries()) {
				this.log(`Re-subscribing to ${details.path}`)

				this.send({
					type: 'subscribe',
					path: details.path,
					filter: details.filter,
					...(details.aggregate && { aggregate: details.aggregate })
				})
					.then((result: unknown) => {
						const serverSubscriptionId = (result as { subscriptionId: string })
							.subscriptionId
						this.subscriptions.set(serverSubscriptionId, {
							callback: details.callback,
							onError: details.onError
						})
						this.log(
							'Subscription re-established:',
							serverSubscriptionId,
							'for path:',
							details.path
						)
					})
					.catch((error) => {
						console.error('[RTDB] Failed to re-establish subscription:', error)
						details.onError(error)
					})
			}
		}
	}

	private handleDisconnect(code?: number, reason?: string): void {
		this.log('Disconnected from server', { code, reason })
		this.connected = false
		this.connecting = false
		// Before anything else: a socket that died inside the health window must not go on
		// to replenish the very budgets this close is spending.
		this.stopHealthyTimer()
		this.stopPingInterval()

		// Clear pending requests if not already cleared by handleError
		if (this.pendingRequests.size > 0) {
			this.clearPendingRequests()
		}

		// Clear stale buffered subscription events
		this.pendingSubscriptionEvents.clear()

		// 4401 = Unauthorized, usually just an expired token: renew and reconnect (the CRDT
		// provider in libs/crdt/src/crdt.ts does the same). Definitive and inconclusive
		// refreshes spend separate budgets (MAX_TOKEN_REFRESH_ATTEMPTS /
		// MAX_TOKEN_REFRESH_FAILURES); exceeding either falls through to the 4400-range
		// branch below, which fails the subscriptions with an AuthError.
		if (
			code === 4401 &&
			this.refreshToken &&
			this.tokenRefreshAttempts < MAX_TOKEN_REFRESH_ATTEMPTS &&
			this.tokenRefreshFailures < MAX_TOKEN_REFRESH_FAILURES
		) {
			this.log('Token rejected, refreshing and reconnecting')
			// Snapshot the generation: a `disconnect()`/`stopReconnection()` while the
			// refresh is in flight must not be undone by its late resolution.
			const connId = this.connectionId
			void (async () => {
				let token: string | undefined
				try {
					token = await this.refreshToken?.()
				} catch (err) {
					this.log('Token refresh failed', err)
				}
				// The caller tore the client down while we were awaiting: nothing here may
				// reconnect, and nothing may notify subscriptions it has already dropped.
				if (this.stopped || connId !== this.connectionId) return
				if (!token) {
					this.tokenRefreshFailures++
					// Inconclusive — retry on the reconnect backoff rather than killing
					// the client for what may be a transient failure.
					if (this.options.reconnect) {
						this.attemptReconnect()
						return
					}
					// Reconnect disabled: the backoff path is a no-op, so nothing would
					// retry and nothing would call `onError` — the caller's promise and
					// UI would wait forever. Failing the subscriptions is better.
					this.notifyAuthError(reason)
					return
				}
				// A token was obtained, so the next 4401 for it is the server's answer,
				// not ours — spend the definitive budget here.
				this.tokenRefreshAttempts++
				// `getToken` is a live thunk, so the reconnect picks up the renewed token
				// on its own. Through the normal backoff rather than `connect()` straight
				// away: a successful refresh says nothing about the server accepting the
				// new token, and an immediate reconnect turns even a capped loop into a
				// burst.
				if (this.options.reconnect) {
					this.attemptReconnect()
					return
				}
				// Reconnect disabled in the options (not stopped — that returned above),
				// so the backoff path is a no-op and this is the only way back. Bounded
				// by the attempt counter regardless.
				try {
					await this.connect()
				} catch (err) {
					this.log('Reconnect after token refresh failed', err)
				}
			})()
			return
		}

		// Don't reconnect on the remaining auth/resource errors: 4403 = Access denied,
		// 4404 = Not found (and 4401 once refresh is unavailable or already spent).
		if (code !== undefined && code >= 4400 && code < 4500) {
			this.log('Auth/resource error, not reconnecting', { code, reason })
			this.notifyAuthError(reason)
			return
		}

		if (this.options.reconnect) {
			this.attemptReconnect()
		}
	}

	/**
	 * Fail every live subscription with an auth error. Skipped when `handleError` already
	 * notified them for this connection.
	 */
	private notifyAuthError(reason?: string): void {
		if (this.errorNotified) return
		const authError = new AuthError(`Connection closed: ${reason || 'auth error'}`)
		for (const [, sub] of this.subscriptions.entries()) {
			sub.onError(authError)
		}
	}

	private attemptReconnect(): void {
		if (this.stopped || !this.options.reconnect) return

		const delay = Math.min(
			this.options.reconnectDelay * 2 ** this.reconnectAttempts,
			this.options.maxReconnectDelay
		)

		this.reconnectAttempts++

		this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

		this.reconnectTimeout = setTimeout(() => {
			this.connect().catch((error) => {
				this.log('Reconnection failed:', error)
				this.attemptReconnect()
			})
		}, delay)
	}

	private flushMessageQueue(): void {
		if (this.messageQueue.length === 0) return

		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			this.log('Cannot flush message queue: WebSocket not open')
			return
		}

		this.log(`Flushing ${this.messageQueue.length} queued messages`)

		const queue = this.messageQueue
		this.messageQueue = []

		for (const message of queue) {
			if (this.ws && this.ws.readyState === WebSocket.OPEN) {
				try {
					this.ws.send(JSON.stringify(message))
				} catch (error) {
					this.log('Error sending queued message:', error)
					this.messageQueue.push(message)
				}
			} else {
				// Socket closed mid-flush, re-queue remaining
				this.messageQueue.push(message)
			}
		}
	}

	private startPingInterval(): void {
		this.stopPingInterval()

		this.pingInterval = setInterval(() => {
			if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
				this.send({ type: 'ping' }).catch((error) => {
					this.log('Ping failed:', error)
				})
			}
		}, 30000)
	}

	private stopPingInterval(): void {
		if (this.pingInterval) {
			clearInterval(this.pingInterval)
			this.pingInterval = null
		}
	}

	private clearPendingRequests(): void {
		for (const [, pending] of this.pendingRequests.entries()) {
			clearTimeout(pending.timeout)
			pending.reject(new ConnectionError('Connection closed'))
		}
		this.pendingRequests.clear()
	}

	private log(...args: unknown[]): void {
		if (this.debug) {
			console.log('[RTDB-WS]', ...args)
		}
	}

	isConnected(): boolean {
		return this.connected
	}

	getPendingRequestCount(): number {
		return this.pendingRequests.size
	}

	getSubscriptionCount(): number {
		return this.subscriptions.size
	}

	/**
	 * Stop any pending reconnection attempts and disable auto-reconnect.
	 * Call this when you want to permanently stop the connection.
	 */
	stopReconnection(): void {
		this.stopped = true
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
			this.reconnectTimeout = null
		}
		this.options = { ...this.options, reconnect: false }
	}
}

// vim: ts=4

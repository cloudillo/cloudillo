// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as T from '@symbion/runtype'
import {
	ClientMessage,
	ServerMessage,
	tServerMessage,
	ChangeEvent,
	AggregateOptions,
	RtdbClientOptions
} from './types.js'
import { ConnectionError, AuthError, ValidationError, TimeoutError, RtdbError } from './errors.js'

interface PendingRequest {
	resolve: (value: any) => void
	reject: (reason: Error) => void
	timeout: ReturnType<typeof setTimeout>
}

interface Subscription {
	callback: (event: ChangeEvent) => void
	onError: (error: Error) => void
}

interface SubscriptionDetails {
	path: string
	filter: any
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

	constructor(
		private dbId: string,
		private getToken: () => string | undefined | Promise<string | undefined>,
		private serverUrl: string,
		private options: Required<Exclude<RtdbClientOptions['options'], undefined>>
	) {
		this.debug = options.debug
	}

	private cleanupWebSocket(): void {
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
			if (!token) {
				throw new AuthError('No auth token available')
			}

			return new Promise((resolve, reject) => {
				const wsUrl = `${this.serverUrl}/ws/rtdb/${this.dbId}?token=${encodeURIComponent(token)}`

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

				this.ws.onopen = () => {
					if (connId !== this.connectionId) return // Stale handler
					this.log('Connected to server')
					this.connected = true
					this.reconnectAttempts = 0
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
					const error = new ConnectionError('WebSocket error', { cause: event })
					this.handleError(error)
					reject(error)
				}

				this.ws.onclose = (event: CloseEvent) => {
					if (connId !== this.connectionId) return // Stale handler
					this.handleDisconnect(event.code, event.reason)
				}

				// Timeout for connection
				const timeout = setTimeout(() => {
					if (!this.connected) {
						reject(new TimeoutError('Connection timeout'))
						this.ws?.close()
					}
				}, 10000)

				const originalResolve = resolve
				resolve = () => {
					clearTimeout(timeout)
					originalResolve()
				}
			})
		} catch (error) {
			this.handleError(error as Error)
			throw error
		}
	}

	async disconnect(): Promise<void> {
		this.connecting = false
		this.connectPromise = null
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
				resolve,
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
		filter: any,
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
			.then((result: any) => {
				const subId = result.subscriptionId as string

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

			if ('id' in message && message.id) {
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
		for (const [id, pending] of this.pendingRequests.entries()) {
			clearTimeout(pending.timeout)
			pending.reject(error)
		}
		this.pendingRequests.clear()

		// Notify all subscriptions
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

			for (const [localId, details] of this.subscriptionDetails.entries()) {
				this.log(`Re-subscribing to ${details.path}`)

				this.send({
					type: 'subscribe',
					path: details.path,
					filter: details.filter,
					...(details.aggregate && { aggregate: details.aggregate })
				})
					.then((result: any) => {
						const serverSubscriptionId = result.subscriptionId
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
		this.stopPingInterval()

		// Always clear pending requests on disconnect — they can't succeed on a closed socket
		this.clearPendingRequests()

		// Clear stale buffered subscription events
		this.pendingSubscriptionEvents.clear()

		// Don't reconnect on auth/resource errors from backend:
		// 4401 = Unauthorized, 4403 = Access denied, 4404 = Not found
		if (code !== undefined && code >= 4400 && code < 4500) {
			this.log('Auth/resource error, not reconnecting', { code, reason })
			// For auth errors, also notify subscription error handlers
			const authError = new AuthError(`Connection closed: ${reason || 'auth error'}`)
			for (const [, sub] of this.subscriptions.entries()) {
				sub.onError(authError)
			}
			return
		}

		if (this.options.reconnect) {
			this.attemptReconnect()
		}
	}

	private attemptReconnect(): void {
		if (!this.options.reconnect) return

		const delay = Math.min(
			this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts),
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

	private log(...args: any[]): void {
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
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
			this.reconnectTimeout = null
		}
		this.options = { ...this.options, reconnect: false }
	}
}

// vim: ts=4

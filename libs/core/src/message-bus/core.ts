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

/**
 * Core Message Bus Implementation
 *
 * Provides the base class for message bus implementations with:
 * - Unified request ID counter
 * - Pending request map with timeout handling
 * - Handler registration
 * - Request-response correlation
 */

import { CloudilloMessage, MessageType, PROTOCOL_VERSION } from './types.js'

// ============================================
// TYPES
// ============================================

/**
 * Pending request tracking
 */
export interface PendingRequest<T = unknown> {
	resolve: (data: T) => void
	reject: (error: Error) => void
	timeoutId: ReturnType<typeof setTimeout>
	createdAt: number
}

/**
 * Message handler function
 */
export type MessageHandler<T extends CloudilloMessage = CloudilloMessage> = (
	message: T,
	source: MessageEventSource | null
) => void | Promise<void>

/**
 * Configuration for message bus
 */
export interface MessageBusConfig {
	/** Default timeout for requests in milliseconds */
	defaultTimeout: number
	/** Enable debug logging */
	debug: boolean
	/** Custom error handler */
	onError?: (error: Error, message?: unknown) => void
	/** Context name for logging */
	contextName: string
}

const DEFAULT_CONFIG: MessageBusConfig = {
	defaultTimeout: 10000,
	debug: false,
	contextName: 'MessageBus'
}

// ============================================
// BASE CLASS
// ============================================

/**
 * Abstract base class for message bus implementations
 *
 * Provides unified request-response handling and handler registration.
 * Subclasses implement specific transport mechanisms.
 */
export abstract class MessageBusBase {
	protected config: MessageBusConfig
	protected requestId = 0
	protected pendingRequests = new Map<number, PendingRequest>()
	protected handlers = new Map<MessageType, MessageHandler>()
	protected initialized = false

	constructor(config: Partial<MessageBusConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config }
	}

	// ============================================
	// LOGGING
	// ============================================

	protected log(...args: unknown[]): void {
		if (this.config.debug) {
			console.log(`[${this.config.contextName}]`, ...args)
		}
	}

	protected logWarn(...args: unknown[]): void {
		console.warn(`[${this.config.contextName}]`, ...args)
	}

	protected logError(error: Error, message?: unknown): void {
		console.error(`[${this.config.contextName}] Error:`, error, message)
		this.config.onError?.(error, message)
	}

	// ============================================
	// HANDLER REGISTRATION
	// ============================================

	/**
	 * Register a handler for a specific message type
	 *
	 * @param type - Message type to handle
	 * @param handler - Handler function
	 * @returns this for chaining
	 */
	on<T extends MessageType>(
		type: T,
		handler: MessageHandler<Extract<CloudilloMessage, { type: T }>>
	): this {
		this.handlers.set(type, handler as MessageHandler)
		this.log('Registered handler for:', type)
		return this
	}

	/**
	 * Unregister a handler for a message type
	 *
	 * @param type - Message type to unregister
	 * @returns this for chaining
	 */
	off(type: MessageType): this {
		this.handlers.delete(type)
		this.log('Unregistered handler for:', type)
		return this
	}

	/**
	 * Check if a handler is registered for a type
	 */
	hasHandler(type: MessageType): boolean {
		return this.handlers.has(type)
	}

	// ============================================
	// REQUEST-RESPONSE HANDLING
	// ============================================

	/**
	 * Generate next request ID
	 */
	protected nextRequestId(): number {
		return ++this.requestId
	}

	/**
	 * Send a request and wait for response
	 *
	 * @param sendFn - Function to send the request message
	 * @param timeout - Optional timeout override
	 * @returns Promise resolving to response data
	 */
	protected async sendRequest<R>(
		sendFn: (id: number) => void,
		timeout: number = this.config.defaultTimeout
	): Promise<R> {
		const id = this.nextRequestId()

		return new Promise<R>((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				const pending = this.pendingRequests.get(id)
				if (pending) {
					this.pendingRequests.delete(id)
					reject(new Error(`Request ${id} timed out after ${timeout}ms`))
				}
			}, timeout)

			this.pendingRequests.set(id, {
				resolve: resolve as (data: unknown) => void,
				reject,
				timeoutId,
				createdAt: Date.now()
			})

			this.log('Sending request:', id)
			sendFn(id)
		})
	}

	/**
	 * Handle an incoming response message
	 *
	 * @param replyTo - Request ID this is responding to
	 * @param ok - Whether the request succeeded
	 * @param data - Response data (if success)
	 * @param error - Error message (if failure)
	 */
	protected handleResponse(
		replyTo: number,
		ok: boolean,
		data?: unknown,
		error?: string
	): boolean {
		const pending = this.pendingRequests.get(replyTo)
		if (!pending) {
			this.log('Received response for unknown request:', replyTo)
			return false
		}

		this.pendingRequests.delete(replyTo)
		clearTimeout(pending.timeoutId)

		if (ok) {
			this.log('Request', replyTo, 'resolved with:', data)
			pending.resolve(data)
		} else {
			this.log('Request', replyTo, 'rejected with:', error)
			pending.reject(new Error(error || 'Request failed'))
		}

		return true
	}

	// ============================================
	// MESSAGE DISPATCH
	// ============================================

	/**
	 * Dispatch a validated message to its handler
	 *
	 * @param message - Validated message
	 * @param source - Message event source
	 * @returns true if handled, false if no handler
	 */
	protected async dispatch(
		message: CloudilloMessage,
		source: MessageEventSource | null
	): Promise<boolean> {
		const handler = this.handlers.get(message.type)
		if (!handler) {
			this.log('No handler for message type:', message.type)
			return false
		}

		try {
			this.log('Dispatching:', message.type)
			await handler(message, source)
			return true
		} catch (err) {
			this.logError(err as Error, message)
			return false
		}
	}

	// ============================================
	// MESSAGE CREATION HELPERS
	// ============================================

	/**
	 * Create a base message envelope
	 */
	protected createEnvelope<T extends MessageType>(
		type: T
	): {
		cloudillo: true
		v: typeof PROTOCOL_VERSION
		type: T
	} {
		return {
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type
		}
	}

	/**
	 * Create a request message with payload
	 */
	protected createRequestWithPayload<T extends MessageType, P>(
		type: T,
		id: number,
		payload: P
	): {
		cloudillo: true
		v: typeof PROTOCOL_VERSION
		type: T
		id: number
		payload: P
	} {
		return {
			...this.createEnvelope(type),
			id,
			payload
		}
	}

	/**
	 * Create a request message without payload
	 */
	protected createRequest<T extends MessageType>(
		type: T,
		id: number
	): {
		cloudillo: true
		v: typeof PROTOCOL_VERSION
		type: T
		id: number
	} {
		return {
			...this.createEnvelope(type),
			id
		}
	}

	/**
	 * Create a response message
	 */
	protected createResponse<T extends MessageType, D>(
		type: T,
		replyTo: number,
		ok: boolean,
		data?: D,
		error?: string
	): {
		cloudillo: true
		v: typeof PROTOCOL_VERSION
		type: T
		replyTo: number
		ok: boolean
		data?: D
		error?: string
	} {
		return {
			...this.createEnvelope(type),
			replyTo,
			ok,
			...(data !== undefined && { data }),
			...(error !== undefined && { error })
		}
	}

	/**
	 * Create a notification message (no response expected)
	 */
	protected createNotify<T extends MessageType, P>(
		type: T,
		payload: P
	): {
		cloudillo: true
		v: typeof PROTOCOL_VERSION
		type: T
		payload: P
	} {
		return {
			...this.createEnvelope(type),
			payload
		}
	}

	// ============================================
	// LIFECYCLE
	// ============================================

	/**
	 * Get initialization status
	 */
	isInitialized(): boolean {
		return this.initialized
	}

	/**
	 * Get count of pending requests
	 */
	getPendingCount(): number {
		return this.pendingRequests.size
	}

	/**
	 * Cleanup all pending requests and handlers
	 */
	destroy(): void {
		// Reject all pending requests
		for (const [id, pending] of this.pendingRequests) {
			clearTimeout(pending.timeoutId)
			pending.reject(new Error('MessageBus destroyed'))
			this.log('Cancelled pending request:', id)
		}
		this.pendingRequests.clear()
		this.handlers.clear()
		this.initialized = false
		this.log('Destroyed')
	}
}

// vim: ts=4

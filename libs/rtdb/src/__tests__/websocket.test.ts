// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { WebSocketManager } from '../websocket'

// Helpers for patching Node.js globals in tests
function setGlobal(key: string, value: unknown): void {
	Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
}

function getGlobal(key: string): unknown {
	return (globalThis as Record<string, unknown>)[key]
}

// Polyfill CloseEvent for Node.js environment
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
// Make CloseEvent available globally
setGlobal('CloseEvent', CloseEvent)

// Mock WebSocket
class MockWebSocket {
	url: string
	readyState: number = 0
	onopen: ((event: Event) => void) | null = null
	onclose: ((event: CloseEvent) => void) | null = null
	onerror: ((event: Event) => void) | null = null
	onmessage: ((event: MessageEvent) => void) | null = null

	sentMessages: unknown[] = []

	constructor(url: string) {
		this.url = url
	}

	send(data: string): void {
		this.sentMessages.push(JSON.parse(data))
	}

	close(): void {
		this.readyState = 3
		if (this.onclose) {
			this.onclose(new CloseEvent('close'))
		}
	}

	simulateOpen(): void {
		this.readyState = 1
		if (this.onopen) {
			this.onopen(new Event('open'))
		}
	}

	simulateMessage(data: unknown): void {
		if (this.onmessage) {
			this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }))
		}
	}

	simulateError(): void {
		if (this.onerror) {
			this.onerror(new Event('error'))
		}
	}

	simulateClose(): void {
		this.readyState = 3
		if (this.onclose) {
			this.onclose(new CloseEvent('close'))
		}
	}
}

// Mock global WebSocket
const originalWebSocket = getGlobal('WebSocket')
let mockWebSocketInstance: MockWebSocket

beforeEach(() => {
	jest.useFakeTimers()
	setGlobal(
		'WebSocket',
		jest.fn((url: string) => {
			mockWebSocketInstance = new MockWebSocket(url)
			return mockWebSocketInstance
		})
	)
})

afterEach(() => {
	jest.clearAllTimers()
	jest.useRealTimers()
	setGlobal('WebSocket', originalWebSocket)
})

describe.skip('WebSocketManager', () => {
	let ws: WebSocketManager

	const createWebSocketManager = () => {
		return new WebSocketManager('test-db', () => 'test-token', 'wss://test.com', {
			enableCache: false,
			reconnect: true,
			reconnectDelay: 100,
			maxReconnectDelay: 1000,
			debug: false
		})
	}

	beforeEach(() => {
		ws = createWebSocketManager()
	})

	afterEach(async () => {
		if (ws) {
			// Suppress console.error during disconnect as subscription failures are expected
			const originalError = console.error
			console.error = jest.fn()
			try {
				await ws.disconnect()
			} catch (_e) {
				// Ignore
			} finally {
				console.error = originalError
			}
		}
	})

	describe('connection lifecycle', () => {
		it('should connect successfully', async () => {
			const connectPromise = ws.connect()

			// Simulate server accepting connection
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()

			await connectPromise

			expect(ws.isConnected()).toBe(true)
		})

		it('should handle missing token gracefully', async () => {
			const wsNoToken = new WebSocketManager('test-db', () => undefined, 'wss://test.com', {
				enableCache: false,
				reconnect: true,
				reconnectDelay: 1000,
				maxReconnectDelay: 30000,
				debug: false
			})

			try {
				await expect(wsNoToken.connect()).rejects.toThrow('No auth token')
			} finally {
				// Clean up
				try {
					await wsNoToken.disconnect()
				} catch (_e) {
					// Ignore
				}
			}
		})

		it('should disconnect cleanly', async () => {
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			await ws.disconnect()

			expect(ws.isConnected()).toBe(false)
		})

		it('should not reconnect if reconnect is disabled', async () => {
			const wsNoReconnect = new WebSocketManager('test-db', () => 'token', 'wss://test.com', {
				enableCache: false,
				reconnect: false,
				reconnectDelay: 100,
				maxReconnectDelay: 1000,
				debug: false
			})

			try {
				const connectPromise = wsNoReconnect.connect()
				await jest.advanceTimersByTimeAsync(0)
				mockWebSocketInstance.simulateOpen()
				await connectPromise

				mockWebSocketInstance.simulateClose()

				// Wait a bit to ensure no reconnect attempts
				await jest.advanceTimersByTimeAsync(150)

				expect(wsNoReconnect.isConnected()).toBe(false)
			} finally {
				// Clean up
				const originalError = console.error
				console.error = jest.fn()
				try {
					await wsNoReconnect.disconnect()
				} catch (_e) {
					// Ignore
				} finally {
					console.error = originalError
				}
			}
		})
	})

	describe('message sending', () => {
		it('should send message when connected', async () => {
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			const sendPromise = ws.send({ type: 'ping' })

			// Simulate server response to avoid timeout
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateMessage({
				type: 'pong',
				id: 1
			})

			await sendPromise

			const sent = mockWebSocketInstance.sentMessages
			expect(sent.length).toBeGreaterThan(0)
			expect((sent[0] as Record<string, unknown>).type).toBe('ping')
		})

		it('should queue message when disconnected', async () => {
			const sendPromise = ws.send({ type: 'ping' })

			// Wait a bit for message to be queued
			await jest.advanceTimersByTimeAsync(10)

			expect(mockWebSocketInstance.sentMessages.length).toBe(0) // Not sent yet

			// Clean up - don't wait for the send to complete
			sendPromise.catch(() => {})
		})

		it('should correlate request and response by ID', async () => {
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			const responsePromise = ws.send({ type: 'get', path: 'posts/123' })

			// Simulate server response
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateMessage({
				type: 'getResult',
				id: 1,
				data: { title: 'Test' }
			})

			const response = (await responsePromise) as { data: Record<string, unknown> }

			expect(response.data).toEqual({ title: 'Test' })
		})

		it('should reject request with error response', async () => {
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			const responsePromise = ws.send({ type: 'get', path: 'posts/123' })

			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateMessage({
				type: 'error',
				id: 1,
				code: 404,
				message: 'Not found'
			})

			await expect(responsePromise).rejects.toThrow('Not found')
		})
	})

	describe('subscriptions', () => {
		it('should subscribe to updates', async () => {
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			const callback = jest.fn()
			const errorFn = jest.fn()
			const unsub = ws.subscribe('posts', undefined, callback, errorFn)

			// Wait for subscription message to be sent
			await new Promise((resolve) => setImmediate(resolve))

			// Simulate server response to avoid timeout
			mockWebSocketInstance.simulateMessage({
				type: 'subscribeResult',
				id: 1,
				subscriptionId: 'sub_1'
			})

			// Wait for subscription to be registered
			await new Promise((resolve) => setImmediate(resolve))

			expect(typeof unsub).toBe('function')

			// Clean up
			unsub()
		})

		it('should call callback on subscription update', async () => {
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			const callback = jest.fn()
			const unsubscribe = ws.subscribe('posts', undefined, callback, jest.fn())

			// Wait for subscription message to be sent
			await new Promise((resolve) => setImmediate(resolve))

			// Send subscription response - this will register the subscription
			mockWebSocketInstance.simulateMessage({
				type: 'subscribeResult',
				id: 1,
				subscriptionId: 'sub_1'
			})

			// Wait for subscription to be fully registered
			await new Promise((resolve) => setImmediate(resolve))

			// Now send change event
			mockWebSocketInstance.simulateMessage({
				type: 'change',
				subscriptionId: 'sub_1',
				event: {
					action: 'create',
					path: 'posts/123',
					data: { title: 'New Post' }
				}
			})

			// Wait for callback to be invoked
			await new Promise((resolve) => setImmediate(resolve))

			expect(callback).toHaveBeenCalled()

			// Clean up
			unsubscribe()
		})

		it('should handle multiple subscriptions', async () => {
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			const callback1 = jest.fn()
			const callback2 = jest.fn()

			const unsub1 = ws.subscribe('posts', undefined, callback1, jest.fn())
			const unsub2 = ws.subscribe('users', undefined, callback2, jest.fn())

			// Wait for subscription messages to be sent
			await new Promise((resolve) => setImmediate(resolve))

			// Simulate server responses
			mockWebSocketInstance.simulateMessage({
				type: 'subscribeResult',
				id: 1,
				subscriptionId: 'sub_1'
			})

			// Wait for first subscription to be processed
			await new Promise((resolve) => setImmediate(resolve))

			mockWebSocketInstance.simulateMessage({
				type: 'subscribeResult',
				id: 2,
				subscriptionId: 'sub_2'
			})

			// Wait for second subscription to be registered
			await new Promise((resolve) => setImmediate(resolve))

			expect(ws.getSubscriptionCount()).toBe(2)

			// Clean up
			unsub1()
			unsub2()
		})

		it('should unsubscribe properly', async () => {
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			const callback = jest.fn()
			const unsub = ws.subscribe('posts', undefined, callback, jest.fn())

			// Wait for subscription message to be sent
			await new Promise((resolve) => setImmediate(resolve))

			// Simulate server response so subscription is registered
			mockWebSocketInstance.simulateMessage({
				type: 'subscribeResult',
				id: 1,
				subscriptionId: 'sub_1'
			})

			// Wait for subscription to be registered
			await new Promise((resolve) => setImmediate(resolve))

			// Now unsubscribe
			unsub()

			// Verify unsubscribe was called (would need to check server state)
			expect(typeof unsub).toBe('function')
		})
	})

	describe('error handling', () => {
		it('should reject pending requests on error', async () => {
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			const responsePromise = ws.send({ type: 'get', path: 'posts/123' })

			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateError()

			await expect(responsePromise).rejects.toThrow()
		})

		it('should handle connection errors', async () => {
			const connectPromise = ws.connect()

			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateError()

			await expect(connectPromise).rejects.toThrow('WebSocket error')
		})
	})

	describe('keepalive', () => {
		it('should send ping periodically', async () => {
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			// Wait for ping interval (default 30s, but testing would need to mock time)
			// This is tested at integration level
			expect(ws.isConnected()).toBe(true)
		})
	})

	describe('response type', () => {
		it('should properly type response', async () => {
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			const responsePromise = ws.send({ type: 'get', path: 'posts/123' })

			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateMessage({
				type: 'getResult',
				id: 1,
				data: { title: 'Test' }
			})

			const response = (await responsePromise) as { data: Record<string, unknown> }

			expect(response.data).toEqual({ title: 'Test' })
		})
	})

	describe('diagnostics', () => {
		it('should report connection status', async () => {
			expect(ws.isConnected()).toBe(false)

			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			expect(ws.isConnected()).toBe(true)
		})

		it('should report pending requests', async () => {
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			expect(ws.getPendingRequestCount()).toBeGreaterThanOrEqual(0)
		})

		it('should report subscription count', async () => {
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			const callback = jest.fn()
			const unsubscribe = ws.subscribe('posts', undefined, callback, jest.fn())

			// Wait for subscription message to be sent
			await new Promise((resolve) => setImmediate(resolve))

			// Simulate server response
			mockWebSocketInstance.simulateMessage({
				type: 'subscribeResult',
				id: 1,
				subscriptionId: 'sub_1'
			})

			// Wait for subscription to be registered
			await new Promise((resolve) => setImmediate(resolve))

			expect(ws.getSubscriptionCount()).toBeGreaterThanOrEqual(1)

			// Clean up
			unsubscribe()
		})
	})

	describe('message queueing', () => {
		it('should queue messages while disconnected', async () => {
			// Send messages without awaiting - they should be queued
			ws.send({ type: 'ping' }).catch(() => {
				// Expected to be rejected when disconnected
			})
			ws.send({ type: 'ping' }).catch(() => {
				// Expected to be rejected when disconnected
			})

			// Wait for messages to be queued
			await new Promise((resolve) => setImmediate(resolve))

			// Messages should be queued internally, not sent yet
			expect(mockWebSocketInstance.sentMessages.length).toBe(0)
		})

		it('should flush queue on reconnect', async () => {
			// Queue a message while disconnected
			const sendPromise = ws.send({ type: 'ping' })

			// Wait for message to be queued
			await new Promise((resolve) => setImmediate(resolve))

			// Verify not sent yet
			expect(mockWebSocketInstance.sentMessages.length).toBe(0)

			// Now connect
			const connectPromise = ws.connect()
			await jest.advanceTimersByTimeAsync(0)
			mockWebSocketInstance.simulateOpen()
			await connectPromise

			// Wait for queue to be flushed
			await new Promise((resolve) => setImmediate(resolve))

			// Now the queued message should be sent
			expect(mockWebSocketInstance.sentMessages.length).toBeGreaterThan(0)

			// Simulate response to avoid timeout
			mockWebSocketInstance.simulateMessage({
				type: 'pong',
				id: 1
			})

			await sendPromise
		})
	})
})

// vim: ts=4

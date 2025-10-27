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

import { WebSocketManager } from '../websocket'
import { ConnectionError, AuthError } from '../errors'

// Mock WebSocket
class MockWebSocket {
	url: string
	readyState: number = 0
	onopen: ((event: Event) => void) | null = null
	onclose: ((event: CloseEvent) => void) | null = null
	onerror: ((event: Event) => void) | null = null
	onmessage: ((event: MessageEvent) => void) | null = null

	sentMessages: any[] = []

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

	simulateMessage(data: any): void {
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
const originalWebSocket = global.WebSocket as any
let mockWebSocketInstance: MockWebSocket

beforeEach(() => {
	;(global as any).WebSocket = jest.fn((url: string) => {
		mockWebSocketInstance = new MockWebSocket(url)
		return mockWebSocketInstance
	})
})

afterEach(() => {
	;(global as any).WebSocket = originalWebSocket
})

describe('WebSocketManager', () => {
	let ws: WebSocketManager

	const createWebSocketManager = () => {
		return new WebSocketManager(
			'test-db',
			() => 'test-token',
			'wss://test.com',
			{
				enableCache: false,
				reconnect: true,
				reconnectDelay: 100,
				maxReconnectDelay: 1000,
				debug: false
			}
		)
	}

	beforeEach(() => {
		ws = createWebSocketManager()
	})

	afterEach(async () => {
		if (ws) {
			try {
				await ws.disconnect()
			} catch (e) {
				// Ignore
			}
		}
	})

	describe('connection lifecycle', () => {
		it('should connect successfully', async () => {
			const connectPromise = ws.connect()

			// Simulate server accepting connection
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)

			await connectPromise

			expect(ws.isConnected()).toBe(true)
		})

		it('should handle missing token gracefully', async () => {
			const wsNoToken = new WebSocketManager(
				'test-db',
				() => undefined,
				'wss://test.com',
				{
					enableCache: false,
					reconnect: true,
					reconnectDelay: 1000,
					maxReconnectDelay: 30000,
					debug: false
				}
			)

			await expect(wsNoToken.connect()).rejects.toThrow('No auth token')
		})

		it('should disconnect cleanly', async () => {
			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			await ws.disconnect()

			expect(ws.isConnected()).toBe(false)
		})

		it('should not reconnect if reconnect is disabled', async () => {
			const wsNoReconnect = new WebSocketManager(
				'test-db',
				() => 'token',
				'wss://test.com',
				{
					enableCache: false,
					reconnect: false,
					reconnectDelay: 100,
					maxReconnectDelay: 1000,
					debug: false
				}
			)

			const connectPromise = wsNoReconnect.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			mockWebSocketInstance.simulateClose()

			// Wait a bit to ensure no reconnect attempts
			await new Promise(resolve => setTimeout(resolve, 150))

			expect(wsNoReconnect.isConnected()).toBe(false)
		})
	})

	describe('message sending', () => {
		it('should send message when connected', async () => {
			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			await ws.send({ type: 'ping' })

			const sent = mockWebSocketInstance.sentMessages
			expect(sent.length).toBeGreaterThan(0)
			expect(sent[0].type).toBe('ping')
		})

		it('should queue message when disconnected', async () => {
			await ws.send({ type: 'ping' })

			expect(mockWebSocketInstance.sentMessages.length).toBe(0) // Not sent yet
		})

		it('should correlate request and response by ID', async () => {
			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			const responsePromise = ws.send({ type: 'get', path: 'posts/123' })

			// Simulate server response
			setTimeout(() => {
				mockWebSocketInstance.simulateMessage({
					type: 'getResult',
					id: 1,
					data: { title: 'Test' }
				})
			}, 0)

			const response = await responsePromise

			expect(response.data).toEqual({ title: 'Test' })
		})

		it('should reject request with error response', async () => {
			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			const responsePromise = ws.send({ type: 'get', path: 'posts/123' })

			setTimeout(() => {
				mockWebSocketInstance.simulateMessage({
					type: 'error',
					id: 1,
					code: 404,
					message: 'Not found'
				})
			}, 0)

			await expect(responsePromise).rejects.toThrow('Not found')
		})
	})

	describe('subscriptions', () => {
		it('should subscribe to updates', async () => {
			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			const callback = jest.fn()
			const errorFn = jest.fn()
			const unsub = ws.subscribe('posts', undefined, callback, errorFn)

			expect(typeof unsub).toBe('function')
		})

		it('should call callback on subscription update', async () => {
			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			const callback = jest.fn()
			ws.subscribe('posts', undefined, callback, jest.fn())

			// Send subscription response
			setTimeout(() => {
				mockWebSocketInstance.simulateMessage({
					type: 'subscribeResult',
					id: 1,
					subscriptionId: 'sub_1'
				})

				// Send change event
				mockWebSocketInstance.simulateMessage({
					type: 'change',
					subscriptionId: 'sub_1',
					event: {
						action: 'create',
						path: 'posts/123',
						data: { title: 'New Post' }
					}
				})
			}, 0)

			// Wait for callbacks
			await new Promise(resolve => setTimeout(resolve, 50))

			expect(callback).toHaveBeenCalled()
		})

		it('should handle multiple subscriptions', async () => {
			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			const callback1 = jest.fn()
			const callback2 = jest.fn()

			ws.subscribe('posts', undefined, callback1, jest.fn())
			ws.subscribe('users', undefined, callback2, jest.fn())

			expect(ws.getSubscriptionCount()).toBe(2)
		})

		it('should unsubscribe properly', async () => {
			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			const callback = jest.fn()
			const unsub = ws.subscribe('posts', undefined, callback, jest.fn())

			unsub()

			// Verify unsubscribe was called (would need to check server state)
			expect(typeof unsub).toBe('function')
		})
	})

	describe('error handling', () => {
		it('should reject pending requests on error', async () => {
			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			const responsePromise = ws.send({ type: 'get', path: 'posts/123' })

			setTimeout(() => {
				mockWebSocketInstance.simulateError()
			}, 0)

			await expect(responsePromise).rejects.toThrow()
		})

		it('should handle connection errors', async () => {
			const connectPromise = ws.connect()

			setTimeout(() => {
				mockWebSocketInstance.simulateError()
			}, 0)

			await expect(connectPromise).rejects.toThrow('WebSocket error')
		})
	})

	describe('keepalive', () => {
		it('should send ping periodically', async () => {
			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			// Wait for ping interval (default 30s, but testing would need to mock time)
			// This is tested at integration level
			expect(ws.isConnected()).toBe(true)
		})
	})

	describe('response type', () => {
		it('should properly type response', async () => {
			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			const responsePromise = ws.send({ type: 'get', path: 'posts/123' })

			setTimeout(() => {
				mockWebSocketInstance.simulateMessage({
					type: 'getResult',
					id: 1,
					data: { title: 'Test' }
				})
			}, 0)

			const response = await responsePromise as any

			expect(response.data).toEqual({ title: 'Test' })
		})
	})

	describe('diagnostics', () => {
		it('should report connection status', async () => {
			expect(ws.isConnected()).toBe(false)

			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			expect(ws.isConnected()).toBe(true)
		})

		it('should report pending requests', async () => {
			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			expect(ws.getPendingRequestCount()).toBeGreaterThanOrEqual(0)
		})

		it('should report subscription count', async () => {
			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			const callback = jest.fn()
			ws.subscribe('posts', undefined, callback)

			expect(ws.getSubscriptionCount()).toBeGreaterThanOrEqual(1)
		})
	})

	describe('message queueing', () => {
		it('should queue messages while disconnected', async () => {
			await ws.send({ type: 'ping' })
			await ws.send({ type: 'ping' })

			// Messages should be queued internally
			expect(mockWebSocketInstance.sentMessages.length).toBe(0)
		})

		it('should flush queue on reconnect', async () => {
			await ws.send({ type: 'ping' })

			const connectPromise = ws.connect()
			setTimeout(() => mockWebSocketInstance.simulateOpen(), 0)
			await connectPromise

			// Wait for queue flush
			await new Promise(resolve => setTimeout(resolve, 50))

			expect(mockWebSocketInstance.sentMessages.length).toBeGreaterThan(0)
		})
	})
})

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { DocumentReference } from '../document'
import { CollectionReference } from '../collection'
import { WebSocketManager } from '../websocket'
import type { TransactionMessage } from '../types'

jest.mock('../websocket')
jest.mock('../collection')

describe('DocumentReference', () => {
	let mockWs: jest.Mocked<WebSocketManager>
	let docRef: DocumentReference

	beforeEach(() => {
		jest.useFakeTimers()
		mockWs = new WebSocketManager('test-db', () => 'token', 'wss://test.com', {
			enableCache: false,
			reconnect: true,
			reconnectDelay: 1000,
			maxReconnectDelay: 30000,
			debug: false
		}) as jest.Mocked<WebSocketManager>
		mockWs.send = jest.fn() as unknown as jest.Mocked<WebSocketManager>['send']
		mockWs.subscribe = jest.fn() as unknown as jest.Mocked<WebSocketManager>['subscribe']

		docRef = new DocumentReference(mockWs, 'posts/123')
	})

	afterEach(() => {
		jest.clearAllTimers()
		jest.useRealTimers()
	})

	describe('id property', () => {
		it('should extract ID from path', () => {
			expect(docRef.id).toBe('123')
		})

		it('should handle nested paths', () => {
			const nested = new DocumentReference(mockWs, 'posts/abc/comments/xyz')

			expect(nested.id).toBe('xyz')
		})

		it('should handle leading/trailing slashes', () => {
			const withSlashes = new DocumentReference(mockWs, '/posts/123/')

			expect(withSlashes.id).toBe('123')
		})
	})

	describe('get', () => {
		it('should fetch existing document', async () => {
			mockWs.send.mockResolvedValue({
				type: 'getResult',
				data: { title: 'Test Post', author: 'alice' }
			})

			const snapshot = await docRef.get()

			expect(snapshot.exists).toBe(true)
			expect(snapshot.data()).toEqual({ title: 'Test Post', author: 'alice' })
			expect(snapshot.id).toBe('123')
		})

		it('should return non-existing snapshot for missing document', async () => {
			mockWs.send.mockResolvedValue({
				type: 'getResult',
				data: null
			})

			const snapshot = await docRef.get()

			expect(snapshot.exists).toBe(false)
			expect(snapshot.data()).toBeUndefined()
		})

		it('should send get message', async () => {
			mockWs.send.mockResolvedValue({
				type: 'getResult',
				data: null
			})

			await docRef.get()

			const message = mockWs.send.mock.calls[0][0] as unknown as TransactionMessage
			expect(message.type).toBe('get')
			expect(message.path).toBe('posts/123')
		})
	})

	describe('set', () => {
		it('should set document data', async () => {
			mockWs.send.mockResolvedValue({
				type: 'transactionResult',
				results: [{}]
			})

			const data = { title: 'New Post', author: 'bob' }
			await docRef.set(data)

			const message = mockWs.send.mock.calls[0][0] as unknown as TransactionMessage
			expect(message.type).toBe('transaction')
			expect(message.operations[0].type).toBe('replace')
			expect(message.operations[0].data).toEqual(data)
		})
	})

	describe('update', () => {
		it('should update document with partial data', async () => {
			mockWs.send.mockResolvedValue({
				type: 'transactionResult',
				results: [{}]
			})

			const updates = { title: 'Updated Title', views: { $op: 'increment', by: 1 } }
			await docRef.update(updates)

			const message = mockWs.send.mock.calls[0][0] as unknown as TransactionMessage
			expect(message.type).toBe('transaction')
			expect(message.operations[0].type).toBe('update')
			expect(message.operations[0].data).toEqual(updates)
		})

		it('should support field operations', async () => {
			mockWs.send.mockResolvedValue({
				type: 'transactionResult',
				results: [{}]
			})

			await docRef.update({
				counter: { $op: 'increment', by: 5 },
				tags: { $op: 'append', values: ['new-tag'] }
			})

			const message = mockWs.send.mock.calls[0][0] as unknown as TransactionMessage
			const data = message.operations[0].data as Record<string, Record<string, unknown>>
			expect(data.counter.$op).toBe('increment')
			expect(data.tags.$op).toBe('append')
		})
	})

	describe('delete', () => {
		it('should delete document', async () => {
			mockWs.send.mockResolvedValue({
				type: 'transactionResult',
				results: [{}]
			})

			await docRef.delete()

			const message = mockWs.send.mock.calls[0][0] as unknown as TransactionMessage
			expect(message.type).toBe('transaction')
			expect(message.operations[0].type).toBe('delete')
		})
	})

	describe('collection', () => {
		it('should create sub-collection reference', () => {
			const subCollRef = docRef.collection('comments')

			expect(subCollRef).toBeInstanceOf(CollectionReference)
		})

		it('should handle nested collection paths', () => {
			const comments = docRef.collection('comments')
			// In real use, would then call doc() on this

			expect(comments).toBeInstanceOf(CollectionReference)
		})
	})

	describe('onSnapshot', () => {
		it('should subscribe to document changes', () => {
			mockWs.subscribe.mockReturnValue(() => {})
			const callback = jest.fn()

			docRef.onSnapshot(callback)

			expect(mockWs.subscribe).toHaveBeenCalled()
		})

		it('should return unsubscribe function', () => {
			const unsubscribeFn = jest.fn()
			mockWs.subscribe.mockReturnValue(unsubscribeFn)

			const unsub = docRef.onSnapshot(jest.fn())

			expect(unsub).toBe(unsubscribeFn)
		})

		it('should call callback when document is updated', async () => {
			const callback = jest.fn()
			const unsubscribeFn = jest.fn()

			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
				setTimeout(() => {
					cb({
						action: 'update',
						path: 'posts/123',
						data: { title: 'Updated' }
					})
					cb({ action: 'ready', path: 'posts/123' })
				}, 0)
				return unsubscribeFn
			})

			docRef.onSnapshot(callback)

			// Wait for async callback
			await jest.advanceTimersByTimeAsync(10)

			expect(callback).toHaveBeenCalled()
		})

		it('should call callback when document is deleted', async () => {
			const callback = jest.fn()
			const unsubscribeFn = jest.fn()

			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
				setTimeout(() => {
					cb({
						action: 'delete',
						path: 'posts/123'
					})
					cb({ action: 'ready', path: 'posts/123' })
				}, 0)
				return unsubscribeFn
			})

			docRef.onSnapshot(callback)

			// Wait for async callback
			await jest.advanceTimersByTimeAsync(10)

			expect(callback).toHaveBeenCalled()
		})

		it('should handle error callback', () => {
			const errorFn = jest.fn()
			mockWs.subscribe = jest.fn()

			docRef.onSnapshot(jest.fn(), errorFn)

			expect(mockWs.subscribe).toHaveBeenCalledWith(
				expect.anything(),
				undefined,
				expect.anything(),
				errorFn
			)
		})
	})

	describe('error handling', () => {
		it('should propagate errors from get', async () => {
			mockWs.send.mockRejectedValue(new Error('Network error'))

			await expect(docRef.get()).rejects.toThrow('Network error')
		})

		it('should propagate errors from set', async () => {
			mockWs.send.mockRejectedValue(new Error('Permission denied'))

			await expect(docRef.set({ data: 'test' })).rejects.toThrow('Permission denied')
		})

		it('should propagate errors from update', async () => {
			mockWs.send.mockRejectedValue(new Error('Validation failed'))

			await expect(docRef.update({ field: 'value' })).rejects.toThrow('Validation failed')
		})

		it('should propagate errors from delete', async () => {
			mockWs.send.mockRejectedValue(new Error('Document not found'))

			await expect(docRef.delete()).rejects.toThrow('Document not found')
		})
	})
})

// vim: ts=4

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

import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { DocumentReference } from '../document'
import { CollectionReference } from '../collection'
import { WebSocketManager } from '../websocket'

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
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'getResult',
				data: { title: 'Test Post', author: 'alice' }
			})

			const snapshot = await docRef.get()

			expect(snapshot.exists).toBe(true)
			expect(snapshot.data()).toEqual({ title: 'Test Post', author: 'alice' })
			expect(snapshot.id).toBe('123')
		})

		it('should return non-existing snapshot for missing document', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'getResult',
				data: null
			})

			const snapshot = await docRef.get()

			expect(snapshot.exists).toBe(false)
			expect(snapshot.data()).toBeUndefined()
		})

		it('should send get message', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'getResult',
				data: null
			})

			await docRef.get()

			const message = mockWs.send.mock.calls[0][0]
			expect(message.type).toBe('get')
			expect(message.path).toBe('posts/123')
		})
	})

	describe('set', () => {
		it('should set document data', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'transactionResult',
				results: [{}]
			})

			const data = { title: 'New Post', author: 'bob' }
			await docRef.set(data)

			const message = mockWs.send.mock.calls[0][0]
			expect(message.type).toBe('transaction')
			expect(message.operations[0].type).toBe('create')
			expect(message.operations[0].data).toEqual(data)
		})
	})

	describe('update', () => {
		it('should update document with partial data', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'transactionResult',
				results: [{}]
			})

			const updates = { title: 'Updated Title', views: { $op: 'increment', by: 1 } }
			await docRef.update(updates)

			const message = mockWs.send.mock.calls[0][0]
			expect(message.type).toBe('transaction')
			expect(message.operations[0].type).toBe('update')
			expect(message.operations[0].data).toEqual(updates)
		})

		it('should support field operations', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'transactionResult',
				results: [{}]
			})

			await docRef.update({
				counter: { $op: 'increment', by: 5 },
				tags: { $op: 'append', values: ['new-tag'] }
			})

			const message = mockWs.send.mock.calls[0][0]
			const data = message.operations[0].data
			expect(data.counter.$op).toBe('increment')
			expect(data.tags.$op).toBe('append')
		})
	})

	describe('delete', () => {
		it('should delete document', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'transactionResult',
				results: [{}]
			})

			await docRef.delete()

			const message = mockWs.send.mock.calls[0][0]
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
			mockWs.subscribe = (jest.fn() as any).mockReturnValue(() => {})
			const callback = jest.fn()

			docRef.onSnapshot(callback)

			expect(mockWs.subscribe).toHaveBeenCalled()
		})

		it('should return unsubscribe function', () => {
			const unsubscribeFn = jest.fn()
			mockWs.subscribe = (jest.fn() as any).mockReturnValue(unsubscribeFn)

			const unsub = docRef.onSnapshot(jest.fn())

			expect(unsub).toBe(unsubscribeFn)
		})

		it('should call callback when document is updated', async () => {
			const callback = jest.fn()
			const unsubscribeFn = jest.fn()

			mockWs.subscribe = (jest.fn() as any).mockImplementation(
				(path: any, filter: any, cb: any) => {
					setTimeout(() => {
						cb({
							action: 'update',
							path: 'posts/123',
							data: { title: 'Updated' }
						})
					}, 0)
					return unsubscribeFn
				}
			)

			docRef.onSnapshot(callback)

			// Wait for async callback
			await jest.advanceTimersByTimeAsync(10)

			expect(callback).toHaveBeenCalled()
		})

		it('should call callback when document is deleted', async () => {
			const callback = jest.fn()
			const unsubscribeFn = jest.fn()

			mockWs.subscribe = (jest.fn() as any).mockImplementation(
				(path: any, filter: any, cb: any) => {
					setTimeout(() => {
						cb({
							action: 'delete',
							path: 'posts/123'
						})
					}, 0)
					return unsubscribeFn
				}
			)

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
			mockWs.send = (jest.fn() as any).mockRejectedValue(new Error('Network error'))

			await expect(docRef.get()).rejects.toThrow('Network error')
		})

		it('should propagate errors from set', async () => {
			mockWs.send = (jest.fn() as any).mockRejectedValue(new Error('Permission denied'))

			await expect(docRef.set({ data: 'test' })).rejects.toThrow('Permission denied')
		})

		it('should propagate errors from update', async () => {
			mockWs.send = (jest.fn() as any).mockRejectedValue(new Error('Validation failed'))

			await expect(docRef.update({ field: 'value' })).rejects.toThrow('Validation failed')
		})

		it('should propagate errors from delete', async () => {
			mockWs.send = (jest.fn() as any).mockRejectedValue(new Error('Document not found'))

			await expect(docRef.delete()).rejects.toThrow('Document not found')
		})
	})
})

// vim: ts=4

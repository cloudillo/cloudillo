// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

import { CollectionReference } from '../collection'
import { DocumentReference } from '../document'
import type { ChangeEvent, DocumentSnapshot, TransactionMessage } from '../types'
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

			// The transport's own unsubscribe, unwrapped: nothing in the handler is
			// asynchronous any more, so there is no in-flight work to invalidate.
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

		// The subscription is self-contained: `ready` carries the document's
		// current value, so no separate read is needed to tell "exists" from
		// "does not exist".
		it('should emit the stored document carried by ready', async () => {
			let received: DocumentSnapshot<unknown> | undefined
			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
				setTimeout(() => {
					cb({
						action: 'ready',
						path: 'posts/123',
						data: [{ id: '123', title: 'Stored' }]
					})
				}, 0)
				return () => {}
			})

			docRef.onSnapshot((snapshot) => {
				received = snapshot
			})
			await jest.advanceTimersByTimeAsync(10)

			expect(received?.exists).toBe(true)
			expect(received?.data()).toEqual({ id: '123', title: 'Stored' })
			// The round trip a subscription exists to avoid.
			expect(mockWs.send).not.toHaveBeenCalled()
		})

		it('should report a missing document when ready carries an empty array', async () => {
			let received: DocumentSnapshot<unknown> | undefined
			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
				setTimeout(() => {
					cb({ action: 'ready', path: 'posts/123', data: [] })
				}, 0)
				return () => {}
			})

			docRef.onSnapshot((snapshot) => {
				received = snapshot
			})
			await jest.advanceTimersByTimeAsync(10)

			expect(received?.exists).toBe(false)
		})

		// A reconnect re-subscribes and replays `ready` with whatever is stored at
		// that moment, so a write that landed while the socket was down arrives
		// without a separate read.
		it('should re-emit from a replayed ready after a reconnect', async () => {
			const snapshots: DocumentSnapshot<unknown>[] = []
			let emit: ((event: ChangeEvent) => void) | undefined
			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
				emit = cb
				return () => {}
			})

			docRef.onSnapshot((snapshot) => {
				snapshots.push(snapshot)
			})
			emit?.({ action: 'ready', path: 'posts/123', data: [{ id: '123', title: 'First' }] })
			emit?.({
				action: 'ready',
				path: 'posts/123',
				data: [{ id: '123', title: 'Changed while offline' }]
			})

			expect(snapshots.map((s) => s.data())).toEqual([
				{ id: '123', title: 'First' },
				{ id: '123', title: 'Changed while offline' }
			])
		})

		// `ready` is built from the server's state at *subscribe* time, so a change
		// that races ahead of it is newer. Emitted as it arrives, the caller saw the
		// new value and then the old one, with no correction event to follow —
		// `emit`'s only guard is "differs from the last one".
		it('should not hand the caller older state after newer', async () => {
			const snapshots: DocumentSnapshot<unknown>[] = []
			let emit: ((event: ChangeEvent) => void) | undefined
			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
				emit = cb
				return () => {}
			})

			docRef.onSnapshot((snapshot) => {
				snapshots.push(snapshot)
			})
			// The update wins the race; `ready` carries what was stored before it.
			emit?.({
				action: 'update',
				path: 'posts/123',
				data: { id: '123', title: 'Updated' }
			})
			emit?.({ action: 'ready', path: 'posts/123', data: [{ id: '123', title: 'Stored' }] })

			// Old → new, monotonic, and the caller is not left holding the stale one.
			expect(snapshots.map((s) => s.data())).toEqual([
				{ id: '123', title: 'Stored' },
				{ id: '123', title: 'Updated' }
			])
		})

		it('should collapse a buffered change that agrees with ready', async () => {
			const callback = jest.fn()
			let emit: ((event: ChangeEvent) => void) | undefined
			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
				emit = cb
				return () => {}
			})

			docRef.onSnapshot(callback)
			emit?.({ action: 'update', path: 'posts/123', data: { id: '123', title: 'Same' } })
			emit?.({ action: 'ready', path: 'posts/123', data: [{ id: '123', title: 'Same' }] })

			// `emit`'s existing dedupe, doing its job on the flushed pair.
			expect(callback).toHaveBeenCalledTimes(1)
		})

		// A lock payload is lock state, not document fields. Wrapped as a snapshot
		// it would reach the caller looking like someone had rewritten the record.
		it('should ignore lock and unlock events', () => {
			const callback = jest.fn()
			let emit: ((event: ChangeEvent) => void) | undefined
			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
				emit = cb
				return () => {}
			})

			docRef.onSnapshot(callback)
			emit?.({ action: 'ready', path: 'posts/123', data: [{ id: '123', title: 'Stored' }] })
			emit?.({
				action: 'lock',
				path: 'posts/123',
				data: { userId: 'u1', mode: 'soft', connId: 'c1' }
			})
			emit?.({ action: 'unlock', path: 'posts/123', data: { userId: 'u1', connId: 'c1' } })

			expect(callback).toHaveBeenCalledTimes(1)
		})

		// Without it the server resolves the path as a collection and the replay
		// is empty, so the document reads as deleted however long it has existed.
		it('should subscribe with document scope', () => {
			mockWs.subscribe.mockReturnValue(() => {})

			docRef.onSnapshot(jest.fn())

			// By position rather than `toHaveBeenCalledWith`, which is
			// arity-sensitive and breaks whenever a trailing optional argument is
			// added to `subscribe`.
			expect(mockWs.subscribe.mock.calls[0][6]).toBe('document')
		})

		it('should handle error callback', () => {
			const errorFn = jest.fn()
			mockWs.subscribe = jest.fn()

			docRef.onSnapshot(jest.fn(), errorFn)

			expect(mockWs.subscribe.mock.calls[0][3]).toBe(errorFn)
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

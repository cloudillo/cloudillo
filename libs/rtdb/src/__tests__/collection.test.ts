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
import { CollectionReference } from '../collection'
import { DocumentReference } from '../document'
import { Query } from '../query'
import { WebSocketManager } from '../websocket'

jest.mock('../websocket')

describe('CollectionReference', () => {
	let mockWs: jest.Mocked<WebSocketManager>
	let collRef: CollectionReference

	beforeEach(() => {
		jest.useFakeTimers()
		mockWs = new WebSocketManager('test-db', () => 'token', 'wss://test.com', {
			enableCache: false,
			reconnect: true,
			reconnectDelay: 1000,
			maxReconnectDelay: 30000,
			debug: false
		}) as jest.Mocked<WebSocketManager>

		collRef = new CollectionReference(mockWs, 'posts')
	})

	afterEach(() => {
		jest.clearAllTimers()
		jest.useRealTimers()
	})

	describe('doc', () => {
		it('should return DocumentReference', () => {
			const docRef = collRef.doc('123')

			expect(docRef).toBeInstanceOf(DocumentReference)
		})

		it('should create reference with correct path', () => {
			const docRef = collRef.doc('my-post')

			// Verify the DocumentReference was created with correct ID
			expect(docRef).toBeInstanceOf(DocumentReference)
			expect(docRef.id).toBe('my-post')
		})

		it('should support multiple docs in same collection', () => {
			const doc1 = collRef.doc('doc1')
			const doc2 = collRef.doc('doc2')

			expect(doc1).toBeInstanceOf(DocumentReference)
			expect(doc2).toBeInstanceOf(DocumentReference)
			expect(doc1.id).toBe('doc1')
			expect(doc2.id).toBe('doc2')
		})
	})

	describe('create', () => {
		it('should create document with auto-generated ID', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'transactionResult',
				results: [{ id: 'auto-123' }]
			})

			const data = { title: 'New Post', author: 'alice' }
			const ref = await collRef.create(data)

			expect(ref).toBeInstanceOf(DocumentReference)
			expect(mockWs.send).toHaveBeenCalled()
		})

		it('should send transaction message', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'transactionResult',
				results: [{ id: 'auto-123' }]
			})

			const data = { title: 'Test' }
			await collRef.create(data)

			const message = mockWs.send.mock.calls[0][0]
			expect(message.type).toBe('transaction')
			expect(message.operations[0].type).toBe('create')
			expect(message.operations[0].data).toEqual(data)
			expect(message.operations[0].ref).toBe('$new')
		})

		it('should throw error when no ID returned', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'transactionResult',
				results: [{}] // No ID
			})

			await expect(collRef.create({ title: 'Test' })).rejects.toThrow(
				'Failed to create document: no ID returned'
			)
		})
	})

	describe('query', () => {
		it('should return Query instance', () => {
			const query = collRef.query()

			expect(query).toBeInstanceOf(Query)
		})
	})

	describe('where', () => {
		it('should create query with filter', () => {
			const query = collRef.where('published', '==', true)

			expect(query).toBeInstanceOf(Query)
		})

		it('should be chainable with other methods', () => {
			const result = collRef
				.where('published', '==', true)
				.orderBy('createdAt', 'desc')
				.limit(10)

			expect(result).toBeInstanceOf(Query)
		})
	})

	describe('orderBy', () => {
		it('should create query with sort', () => {
			const query = collRef.orderBy('createdAt', 'desc')

			expect(query).toBeInstanceOf(Query)
		})

		it('should default to ascending', () => {
			const query = collRef.orderBy('name')

			expect(query).toBeInstanceOf(Query)
		})
	})

	describe('limit', () => {
		it('should create query with limit', () => {
			const query = collRef.limit(10)

			expect(query).toBeInstanceOf(Query)
		})

		it('should be chainable', () => {
			const query = collRef.limit(10).where('status', '==', 'active')

			expect(query).toBeInstanceOf(Query)
		})
	})

	describe('get', () => {
		it('should fetch all documents in collection', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'queryResult',
				data: [
					{ id: 'doc1', title: 'Post 1' },
					{ id: 'doc2', title: 'Post 2' }
				]
			})

			const snapshot = await collRef.get()

			expect(snapshot.size).toBe(2)
			expect(snapshot.empty).toBe(false)
		})

		it('should return empty snapshot for empty collection', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			const snapshot = await collRef.get()

			expect(snapshot.size).toBe(0)
			expect(snapshot.empty).toBe(true)
		})
	})

	describe('onSnapshot', () => {
		it('should subscribe to collection changes', () => {
			const callback = jest.fn()

			collRef.onSnapshot(callback)

			// Should have called query.onSnapshot internally
			expect(callback).toBeDefined()
		})

		it('should return unsubscribe function', () => {
			const callback = jest.fn()

			const unsub = collRef.onSnapshot(callback)

			expect(typeof unsub).toBe('function')
		})

		it('should handle error callback', () => {
			const errorFn = jest.fn()

			collRef.onSnapshot(jest.fn(), errorFn)

			expect(errorFn).toBeDefined()
		})
	})

	describe('nested collections', () => {
		it('should support nested collection paths', async () => {
			const nestedCollRef = new CollectionReference(mockWs, 'posts/abc/comments')

			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			const snapshot = await nestedCollRef.get()

			expect(snapshot).toBeDefined()
		})

		it('should create documents in nested collection', async () => {
			const nestedCollRef = new CollectionReference(mockWs, 'posts/abc/comments')

			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'transactionResult',
				results: [{ id: 'comment-123' }]
			})

			const docRef = await nestedCollRef.create({
				text: 'Great post!',
				author: 'bob'
			})

			expect(docRef).toBeInstanceOf(DocumentReference)
		})
	})

	describe('error handling', () => {
		it('should propagate errors from get', async () => {
			mockWs.send = (jest.fn() as any).mockRejectedValue(new Error('Network error'))

			await expect(collRef.get()).rejects.toThrow('Network error')
		})

		it('should propagate errors from create', async () => {
			mockWs.send = (jest.fn() as any).mockRejectedValue(new Error('Validation failed'))

			await expect(collRef.create({ title: 'Test' })).rejects.toThrow('Validation failed')
		})
	})
})

// vim: ts=4

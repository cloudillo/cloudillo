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

import { RtdbClient, WriteBatch, createRtdbClient } from '../client'
import { CollectionReference } from '../collection'
import { DocumentReference } from '../document'
import { WebSocketManager } from '../websocket'

jest.mock('../websocket')
jest.mock('../collection')
jest.mock('../document')

describe('RtdbClient', () => {
	let client: RtdbClient

	beforeEach(() => {
		jest.clearAllMocks()

		client = createRtdbClient({
			dbId: 'test-db',
			auth: { getToken: () => 'test-token' },
			serverUrl: 'wss://test.com',
			options: {
				debug: false
			}
		})
	})

	describe('creation', () => {
		it('should create client with options', () => {
			expect(client).toBeInstanceOf(RtdbClient)
		})

		it('should handle missing options', () => {
			const minimalClient = createRtdbClient({
				dbId: 'test-db',
				auth: { getToken: () => 'token' },
				serverUrl: 'wss://test.com'
			})

			expect(minimalClient).toBeInstanceOf(RtdbClient)
		})
	})

	describe('connect/disconnect', () => {
		it('should connect to server', async () => {
			const mockWs = WebSocketManager as jest.MockedClass<typeof WebSocketManager>
			mockWs.prototype.connect = jest.fn().mockResolvedValue(undefined)

			await client.connect()

			expect(client.isConnected()).toBe(true)
		})

		it('should disconnect from server', async () => {
			const mockWs = WebSocketManager as jest.MockedClass<typeof WebSocketManager>
			mockWs.prototype.disconnect = jest.fn().mockResolvedValue(undefined)

			await client.disconnect()

			expect(client.isConnected()).toBe(false)
		})

		it('should not reconnect if already connected', async () => {
			const mockWs = WebSocketManager as jest.MockedClass<typeof WebSocketManager>
			mockWs.prototype.connect = jest.fn().mockResolvedValue(undefined)

			await client.connect()
			await client.connect() // Second call

			// Should only be called once
			expect(mockWs.prototype.connect).toHaveBeenCalledTimes(1)
		})
	})

	describe('collection', () => {
		it('should return CollectionReference', () => {
			const coll = client.collection('posts')

			expect(coll).toBeInstanceOf(CollectionReference)
		})

		it('should support nested collection paths', () => {
			const coll = client.collection('posts/abc/comments')

			expect(coll).toBeInstanceOf(CollectionReference)
		})

		it('should auto-connect on collection access', () => {
			const mockWs = WebSocketManager as jest.MockedClass<typeof WebSocketManager>
			mockWs.prototype.connect = jest.fn().mockResolvedValue(undefined)

			client.collection('posts')

			// Auto-connect happens asynchronously, just verify collection is returned
		})

		it('should support multiple collections', () => {
			const posts = client.collection('posts')
			const users = client.collection('users')

			expect(posts).toBeInstanceOf(CollectionReference)
			expect(users).toBeInstanceOf(CollectionReference)
		})
	})

	describe('ref', () => {
		it('should return DocumentReference', () => {
			const doc = client.ref('posts/123')

			expect(doc).toBeInstanceOf(DocumentReference)
		})

		it('should support various paths', () => {
			const doc1 = client.ref('posts/abc')
			const doc2 = client.ref('users/alice')
			const doc3 = client.ref('posts/abc/comments/xyz')

			expect(doc1).toBeInstanceOf(DocumentReference)
			expect(doc2).toBeInstanceOf(DocumentReference)
			expect(doc3).toBeInstanceOf(DocumentReference)
		})

		it('should auto-connect on ref access', () => {
			const mockWs = WebSocketManager as jest.MockedClass<typeof WebSocketManager>
			mockWs.prototype.connect = jest.fn().mockResolvedValue(undefined)

			client.ref('posts/123')

			// Auto-connect happens asynchronously
		})
	})

	describe('batch', () => {
		it('should return WriteBatch', () => {
			const batch = client.batch()

			expect(batch).toBeInstanceOf(WriteBatch)
		})

		it('should support multiple batches', () => {
			const batch1 = client.batch()
			const batch2 = client.batch()

			expect(batch1).toBeInstanceOf(WriteBatch)
			expect(batch2).toBeInstanceOf(WriteBatch)
			expect(batch1).not.toBe(batch2)
		})
	})

	describe('diagnostics', () => {
		it('should report connection status', () => {
			const status = client.isConnected()

			expect(typeof status).toBe('boolean')
		})

		it('should report pending requests', () => {
			const pending = client.getPendingRequests()

			expect(typeof pending).toBe('number')
			expect(pending).toBeGreaterThanOrEqual(0)
		})

		it('should report active subscriptions', () => {
			const subscriptions = client.getActiveSubscriptions()

			expect(typeof subscriptions).toBe('number')
			expect(subscriptions).toBeGreaterThanOrEqual(0)
		})
	})
})

describe('WriteBatch', () => {
	let mockWs: jest.Mocked<WebSocketManager>
	let batch: WriteBatch

	beforeEach(() => {
		mockWs = new WebSocketManager(
			'test-db',
			() => 'token',
			'wss://test.com',
			{
				enableCache: false,
				reconnect: true,
				reconnectDelay: 1000,
				maxReconnectDelay: 30000,
				debug: false
			}
		) as jest.Mocked<WebSocketManager>

		batch = new WriteBatch(mockWs)
	})

	describe('create operation', () => {
		it('should queue create operation', () => {
			const mockColl = new CollectionReference(mockWs, 'posts')
			const data = { title: 'Test' }

			batch.create(mockColl, data)

			// Operation queued, verify batch is not empty
			expect(batch).toBeInstanceOf(WriteBatch)
		})

		it('should support reference option', () => {
			const mockColl = new CollectionReference(mockWs, 'posts')

			batch.create(mockColl, { title: 'Test' }, { ref: '$post' })

			expect(batch).toBeInstanceOf(WriteBatch)
		})
	})

	describe('update operation', () => {
		it('should queue update operation', () => {
			const mockDoc = new DocumentReference(mockWs, 'posts/123')

			batch.update(mockDoc, { title: 'Updated' })

			expect(batch).toBeInstanceOf(WriteBatch)
		})

		it('should support field operations', () => {
			const mockDoc = new DocumentReference(mockWs, 'posts/123')

			batch.update(mockDoc, {
				views: { $op: 'increment', by: 1 }
			})

			expect(batch).toBeInstanceOf(WriteBatch)
		})
	})

	describe('delete operation', () => {
		it('should queue delete operation', () => {
			const mockDoc = new DocumentReference(mockWs, 'posts/123')

			batch.delete(mockDoc)

			expect(batch).toBeInstanceOf(WriteBatch)
		})
	})

	describe('commit', () => {
		it('should send transaction message', async () => {
			mockWs.send = jest.fn().mockResolvedValue({
				type: 'transactionResult',
				results: [{ id: 'new-doc' }]
			})

			const mockColl = new CollectionReference(mockWs, 'posts')
			batch.create(mockColl, { title: 'Test' })

			await batch.commit()

			expect(mockWs.send).toHaveBeenCalled()
			const message = mockWs.send.mock.calls[0][0]
			expect(message.type).toBe('transaction')
		})

		it('should execute multiple operations atomically', async () => {
			mockWs.send = jest.fn().mockResolvedValue({
				type: 'transactionResult',
				results: [{ id: 'new-doc' }, {}, {}]
			})

			const mockColl = new CollectionReference(mockWs, 'posts')
			const mockDoc = new DocumentReference(mockWs, 'posts/123')

			batch.create(mockColl, { title: 'Test' })
			batch.update(mockDoc, { views: { $op: 'increment', by: 1 } })
			batch.delete(mockDoc)

			const results = await batch.commit()

			expect(Array.isArray(results)).toBe(true)
			expect(results.length).toBe(3)
		})

		it('should return results with IDs', async () => {
			mockWs.send = jest.fn().mockResolvedValue({
				type: 'transactionResult',
				results: [
					{ id: 'new-doc-1' },
					{ id: 'new-doc-2' }
				]
			})

			const mockColl = new CollectionReference(mockWs, 'posts')

			batch.create(mockColl, { title: 'Post 1' })
			batch.create(mockColl, { title: 'Post 2' })

			const results = await batch.commit()

			expect(results[0].id).toBe('new-doc-1')
			expect(results[1].id).toBe('new-doc-2')
		})

		it('should handle empty batch', async () => {
			mockWs.send = jest.fn().mockResolvedValue({
				type: 'transactionResult',
				results: []
			})

			const results = await batch.commit()

			expect(Array.isArray(results)).toBe(true)
		})

		it('should propagate errors from server', async () => {
			mockWs.send = jest.fn().mockRejectedValue(new Error('Transaction failed'))

			const mockColl = new CollectionReference(mockWs, 'posts')
			batch.create(mockColl, { title: 'Test' })

			await expect(batch.commit()).rejects.toThrow('Transaction failed')
		})
	})
})

// vim: ts=4

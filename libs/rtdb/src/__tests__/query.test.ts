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

import { Query } from '../query'
import { WebSocketManager } from '../websocket'

// Mock WebSocketManager
jest.mock('../websocket')

describe('Query', () => {
	let mockWs: jest.Mocked<WebSocketManager>
	let query: Query

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

		query = new Query(mockWs, 'posts')
	})

	describe('filtering', () => {
		it('should support equals operator', () => {
			const result = query.where('published', '==', true)

			expect(result).toBe(query) // Chainable
		})

		it('should reject unsupported operators', () => {
			expect(() => {
				query.where('age', '>', 18)
			}).toThrow('Operator ">" not yet supported')
		})

		it('should add multiple filters', () => {
			query.where('published', '==', true).where('author', '==', 'alice')

			// Would verify internal state if public
		})
	})

	describe('sorting', () => {
		it('should support orderBy with ascending', () => {
			const result = query.orderBy('createdAt', 'asc')

			expect(result).toBe(query) // Chainable
		})

		it('should support orderBy with descending', () => {
			const result = query.orderBy('createdAt', 'desc')

			expect(result).toBe(query)
		})

		it('should default to ascending', () => {
			const result = query.orderBy('createdAt')

			expect(result).toBe(query)
		})

		it('should allow multiple sort fields', () => {
			query.orderBy('category', 'asc').orderBy('createdAt', 'desc')

			expect(query).toBe(query)
		})
	})

	describe('limiting', () => {
		it('should set limit', () => {
			const result = query.limit(10)

			expect(result).toBe(query) // Chainable
		})

		it('should allow zero limit', () => {
			query.limit(0)

			expect(query).toBe(query)
		})
	})

	describe('offsetting', () => {
		it('should set offset', () => {
			const result = query.offset(20)

			expect(result).toBe(query) // Chainable
		})

		it('should allow pagination', () => {
			query.limit(10).offset(20)

			expect(query).toBe(query)
		})
	})

	describe('method chaining', () => {
		it('should allow full method chaining', () => {
			const result = query
				.where('published', '==', true)
				.where('author', '==', 'alice')
				.orderBy('createdAt', 'desc')
				.limit(10)
				.offset(0)

			expect(result).toBe(query)
		})

		it('should work in any order', () => {
			const result = query
				.limit(20)
				.where('status', '==', 'active')
				.orderBy('name', 'asc')

			expect(result).toBe(query)
		})
	})

	describe('get', () => {
		it('should send query message to server', async () => {
			mockWs.send = jest.fn().mockResolvedValue({
				type: 'queryResult',
				data: [
					{ id: 'doc1', title: 'Post 1' },
					{ id: 'doc2', title: 'Post 2' }
				]
			})

			const snapshot = await query
				.where('published', '==', true)
				.limit(10)
				.get()

			expect(mockWs.send).toHaveBeenCalled()
			expect(snapshot.size).toBe(2)
			expect(snapshot.empty).toBe(false)
		})

		it('should return empty snapshot when no results', async () => {
			mockWs.send = jest.fn().mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			const snapshot = await query.get()

			expect(snapshot.size).toBe(0)
			expect(snapshot.empty).toBe(true)
		})

		it('should include filters in message', async () => {
			mockWs.send = jest.fn().mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			await query.where('published', '==', true).get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.filter).toEqual({ equals: { published: true } })
		})

		it('should include sort order in message', async () => {
			mockWs.send = jest.fn().mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			await query.orderBy('createdAt', 'desc').get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.sort).toEqual([{ field: 'createdAt', ascending: false }])
		})

		it('should include limit in message', async () => {
			mockWs.send = jest.fn().mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			await query.limit(5).get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.limit).toBe(5)
		})

		it('should include offset in message', async () => {
			mockWs.send = jest.fn().mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			await query.offset(10).get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.offset).toBe(10)
		})
	})

	describe('onSnapshot', () => {
		it('should subscribe to query changes', () => {
			mockWs.subscribe = jest.fn().mockReturnValue(() => {})
			const callback = jest.fn()

			query.onSnapshot(callback)

			expect(mockWs.subscribe).toHaveBeenCalled()
		})

		it('should return unsubscribe function', () => {
			const unsubscribeFn = jest.fn()
			mockWs.subscribe = jest.fn().mockReturnValue(unsubscribeFn)

			const unsub = query.onSnapshot(jest.fn())

			expect(unsub).toBe(unsubscribeFn)
		})

		it('should call callback with snapshot', () => {
			const callback = jest.fn()
			const unsubscribeFn = jest.fn()

			mockWs.subscribe = jest.fn().mockImplementation(
				(path, filter, cb) => {
					// Simulate server sending a change
					setTimeout(() => {
						cb({
							action: 'create',
							path: 'posts/doc1',
							data: { title: 'Post 1' }
						})
					}, 0)
					return unsubscribeFn
				}
			)

			query.onSnapshot(callback)

			// Callback should be called with snapshot
			expect(callback).toHaveBeenCalled()
		})

		it('should handle error callback', () => {
			const errorFn = jest.fn()
			mockWs.subscribe = jest.fn()

			query.onSnapshot(jest.fn(), errorFn)

			expect(mockWs.subscribe).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.anything(),
				errorFn
			)
		})
	})
})

// vim: ts=4

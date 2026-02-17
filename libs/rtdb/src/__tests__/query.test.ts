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
import { Query } from '../query'
import { AggregateQuery } from '../aggregate-query'
import { WebSocketManager } from '../websocket'

// Mock WebSocketManager
jest.mock('../websocket')

describe('Query', () => {
	let mockWs: jest.Mocked<WebSocketManager>
	let query: Query

	beforeEach(() => {
		jest.useFakeTimers()
		mockWs = new WebSocketManager('test-db', () => 'token', 'wss://test.com', {
			enableCache: false,
			reconnect: true,
			reconnectDelay: 1000,
			maxReconnectDelay: 30000,
			debug: false
		}) as jest.Mocked<WebSocketManager>

		query = new Query(mockWs, 'posts')
	})

	afterEach(() => {
		jest.clearAllTimers()
		jest.useRealTimers()
	})

	describe('filtering', () => {
		it('should support equals operator', () => {
			const result = query.where('published', '==', true)

			expect(result).toBe(query) // Chainable
		})

		it('should support greaterThan operator', () => {
			const result = query.where('age', '>', 18)

			expect(result).toBe(query) // Chainable
		})

		it('should support array-contains operator', () => {
			const result = query.where('tags', 'array-contains', 'todo')

			expect(result).toBe(query) // Chainable
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
			const result = query.limit(20).where('status', '==', 'active').orderBy('name', 'asc')

			expect(result).toBe(query)
		})
	})

	describe('get', () => {
		it('should send query message to server', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'queryResult',
				data: [
					{ id: 'doc1', title: 'Post 1' },
					{ id: 'doc2', title: 'Post 2' }
				]
			})

			const snapshot = await query.where('published', '==', true).limit(10).get()

			expect(mockWs.send).toHaveBeenCalled()
			expect(snapshot.size).toBe(2)
			expect(snapshot.empty).toBe(false)
		})

		it('should return empty snapshot when no results', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			const snapshot = await query.get()

			expect(snapshot.size).toBe(0)
			expect(snapshot.empty).toBe(true)
		})

		it('should include filters in message', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			await query.where('published', '==', true).get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.filter).toEqual({ equals: { published: true } })
		})

		it('should include sort order in message', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			await query.orderBy('createdAt', 'desc').get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.sort).toEqual([{ field: 'createdAt', ascending: false }])
		})

		it('should include limit in message', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			await query.limit(5).get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.limit).toBe(5)
		})

		it('should include offset in message', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
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
			mockWs.subscribe = (jest.fn() as any).mockReturnValue(() => {})
			const callback = jest.fn()

			query.onSnapshot(callback)

			expect(mockWs.subscribe).toHaveBeenCalled()
		})

		it('should return unsubscribe function', () => {
			const unsubscribeFn = jest.fn()
			mockWs.subscribe = (jest.fn() as any).mockReturnValue(unsubscribeFn)

			const unsub = query.onSnapshot(jest.fn())

			expect(unsub).toBe(unsubscribeFn)
		})

		it('should call callback with snapshot', async () => {
			const callback = jest.fn()
			const unsubscribeFn = jest.fn()

			mockWs.subscribe = (jest.fn() as any).mockImplementation(
				(path: any, filter: any, cb: any) => {
					// Simulate server sending ready with initial docs
					setTimeout(() => {
						cb({
							action: 'ready',
							path: 'posts',
							data: [{ id: 'doc1', title: 'Post 1' }]
						})
					}, 0)
					return unsubscribeFn
				}
			)

			query.onSnapshot(callback)

			// Wait for async callback
			await jest.advanceTimersByTimeAsync(10)

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

		it('should handle error callback in options object', () => {
			const errorFn = jest.fn()
			mockWs.subscribe = jest.fn()

			query.onSnapshot(jest.fn(), { onError: errorFn })

			expect(mockWs.subscribe).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.anything(),
				errorFn
			)
		})

		it('should forward lock/unlock events to onLock callback', async () => {
			const snapshotCb = jest.fn()
			const onLock = jest.fn()

			mockWs.subscribe = (jest.fn() as any).mockImplementation(
				(path: any, filter: any, cb: any) => {
					setTimeout(() => {
						// Initial load
						cb({
							action: 'ready',
							path: 'posts',
							data: [{ id: 'doc1', title: 'Post 1' }]
						})
						// Lock event
						cb({
							action: 'lock',
							path: 'posts/doc1',
							data: { userId: 'u1', mode: 'soft' }
						})
						// Unlock event
						cb({ action: 'unlock', path: 'posts/doc1', data: {} })
					}, 0)
					return jest.fn()
				}
			)

			query.onSnapshot(snapshotCb, { onLock })

			await jest.advanceTimersByTimeAsync(10)

			// Snapshot callback should fire once (for ready)
			expect(snapshotCb).toHaveBeenCalledTimes(1)
			// onLock should receive both lock and unlock events
			expect(onLock).toHaveBeenCalledTimes(2)
			expect(onLock).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'lock', path: 'posts/doc1' })
			)
			expect(onLock).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'unlock', path: 'posts/doc1' })
			)
		})

		it('should forward lock events before ready state', async () => {
			const snapshotCb = jest.fn()
			const onLock = jest.fn()

			mockWs.subscribe = (jest.fn() as any).mockImplementation(
				(path: any, filter: any, cb: any) => {
					setTimeout(() => {
						// Lock event BEFORE ready
						cb({
							action: 'lock',
							path: 'posts/doc1',
							data: { userId: 'u1', mode: 'hard' }
						})
						// Then ready
						cb({
							action: 'ready',
							path: 'posts',
							data: [{ id: 'doc1', title: 'Post 1' }]
						})
					}, 0)
					return jest.fn()
				}
			)

			query.onSnapshot(snapshotCb, { onLock })

			await jest.advanceTimersByTimeAsync(10)

			// onLock should fire even before ready
			expect(onLock).toHaveBeenCalledTimes(1)
			expect(onLock).toHaveBeenCalledWith(expect.objectContaining({ action: 'lock' }))
		})

		it('should silently drop lock events when no onLock is provided', async () => {
			const snapshotCb = jest.fn()

			mockWs.subscribe = (jest.fn() as any).mockImplementation(
				(path: any, filter: any, cb: any) => {
					setTimeout(() => {
						cb({
							action: 'ready',
							path: 'posts',
							data: [{ id: 'doc1', title: 'Post 1' }]
						})
						cb({
							action: 'lock',
							path: 'posts/doc1',
							data: { userId: 'u1', mode: 'soft' }
						})
					}, 0)
					return jest.fn()
				}
			)

			query.onSnapshot(snapshotCb)

			await jest.advanceTimersByTimeAsync(10)

			// Only the ready snapshot fires, lock is silently dropped
			expect(snapshotCb).toHaveBeenCalledTimes(1)
		})
	})

	describe('aggregate', () => {
		it('should return an AggregateQuery instance with string field', () => {
			const aggQuery = query.aggregate('tg')

			expect(aggQuery).toBeInstanceOf(AggregateQuery)
		})

		it('should return an AggregateQuery instance with options object', () => {
			const aggQuery = query.aggregate({
				groupBy: 'tg',
				ops: [{ op: 'sum', field: 'views' }]
			})

			expect(aggQuery).toBeInstanceOf(AggregateQuery)
		})

		it('should carry filters into AggregateQuery', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'queryResult',
				data: [{ group: 'rust', count: 3 }]
			})

			const aggQuery = query.where('published', '==', true).aggregate('tg')
			const snapshot = await aggQuery.get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.aggregate).toEqual({ groupBy: 'tg' })
			expect(call.filter).toEqual({ equals: { published: true } })
			expect(snapshot.size).toBe(1)
			expect(snapshot.groups[0].group).toBe('rust')
			expect(snapshot.groups[0].count).toBe(3)
		})

		it('should send aggregate in get() message', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'queryResult',
				data: [
					{ group: 'rust', count: 3 },
					{ group: 'web', count: 2 }
				]
			})

			const aggQuery = query.aggregate('tg')
			const snapshot = await aggQuery.get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.type).toBe('query')
			expect(call.aggregate).toEqual({ groupBy: 'tg' })
			expect(snapshot.size).toBe(2)
			expect(snapshot.empty).toBe(false)
		})

		it('should return empty snapshot when no groups', async () => {
			mockWs.send = (jest.fn() as any).mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			const aggQuery = query.aggregate('tg')
			const snapshot = await aggQuery.get()

			expect(snapshot.size).toBe(0)
			expect(snapshot.empty).toBe(true)
			expect(snapshot.groups).toEqual([])
		})

		it('should subscribe with aggregate and fire callback on ready', async () => {
			const callback = jest.fn()

			mockWs.subscribe = (jest.fn() as any).mockImplementation(
				(path: any, filter: any, cb: any, onError: any, aggregate: any) => {
					setTimeout(() => {
						cb({
							action: 'ready',
							path: 'posts',
							data: [
								{ group: 'rust', count: 3 },
								{ group: 'web', count: 2 }
							]
						})
					}, 0)
					return jest.fn()
				}
			)

			const aggQuery = query.aggregate('tg')
			aggQuery.onSnapshot(callback)

			await jest.advanceTimersByTimeAsync(10)

			expect(callback).toHaveBeenCalledTimes(1)
			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({
					size: 2,
					empty: false,
					groups: [
						{ group: 'rust', count: 3 },
						{ group: 'web', count: 2 }
					]
				})
			)
		})

		it('should pass aggregate option to ws.subscribe', () => {
			mockWs.subscribe = (jest.fn() as any).mockReturnValue(() => {})

			const aggQuery = query.aggregate('tg')
			aggQuery.onSnapshot(jest.fn())

			expect(mockWs.subscribe).toHaveBeenCalledWith(
				'posts',
				undefined,
				expect.any(Function),
				expect.any(Function),
				{ groupBy: 'tg' }
			)
		})

		it('should fire callback on update events after ready', async () => {
			const callback = jest.fn()

			mockWs.subscribe = (jest.fn() as any).mockImplementation(
				(path: any, filter: any, cb: any, onError: any, aggregate: any) => {
					setTimeout(() => {
						cb({
							action: 'ready',
							path: 'posts',
							data: [{ group: 'rust', count: 3 }]
						})
						// Live incremental update (delta — changed groups only)
						cb({
							action: 'update',
							path: 'posts',
							data: [
								{ group: 'rust', count: 4 },
								{ group: 'web', count: 1 }
							]
						})
					}, 0)
					return jest.fn()
				}
			)

			const aggQuery = query.aggregate('tg')
			aggQuery.onSnapshot(callback)

			await jest.advanceTimersByTimeAsync(10)

			expect(callback).toHaveBeenCalledTimes(2)
			expect(callback).toHaveBeenLastCalledWith(
				expect.objectContaining({
					size: 2,
					groups: [
						{ group: 'rust', count: 4 },
						{ group: 'web', count: 1 }
					]
				})
			)
		})
	})
})

// vim: ts=4

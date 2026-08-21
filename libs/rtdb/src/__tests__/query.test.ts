// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

import { AggregateQuery } from '../aggregate-query'
import { Query } from '../query'
import type { ChangeEvent, QuerySnapshot } from '../types'
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
		mockWs.send = jest.fn() as unknown as jest.Mocked<WebSocketManager>['send']
		mockWs.subscribe = jest.fn() as unknown as jest.Mocked<WebSocketManager>['subscribe']

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
			mockWs.send.mockResolvedValue({
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
			mockWs.send.mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			const snapshot = await query.get()

			expect(snapshot.size).toBe(0)
			expect(snapshot.empty).toBe(true)
		})

		it('should include filters in message', async () => {
			mockWs.send.mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			await query.where('published', '==', true).get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.filter).toEqual({ equals: { published: true } })
		})

		it('should include sort order in message', async () => {
			mockWs.send.mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			await query.orderBy('createdAt', 'desc').get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.sort).toEqual([{ field: 'createdAt', ascending: false }])
		})

		it('should include limit in message', async () => {
			mockWs.send.mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			await query.limit(5).get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.limit).toBe(5)
		})

		it('should include offset in message', async () => {
			mockWs.send.mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			await query.offset(10).get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.offset).toBe(10)
		})

		it('should include select in message', async () => {
			mockWs.send.mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			await query.select('title', 'author').get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.select).toEqual(['title', 'author'])
		})

		it('should omit select when no fields were asked for', async () => {
			mockWs.send.mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			// An empty projection would mean "return nothing", which no caller
			// wants; it has to read as "return everything" instead.
			await query.select().get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.select).toBeUndefined()
		})

		it('should leave the original query unprojected', async () => {
			// `select` is the only builder method that narrows `T`; mutating in place
			// would leave every other reference typed `Query<T>` while the server
			// sends it `Partial<T>` documents.
			mockWs.send.mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			const lite = query.select('title')
			await query.get()
			await lite.get()

			expect(mockWs.send.mock.calls[0][0].select).toBeUndefined()
			expect(mockWs.send.mock.calls[1][0].select).toEqual(['title'])
		})

		it('should carry the filters onto the projected copy', async () => {
			mockWs.send.mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			await query.where('status', '==', 'active').select('title').get()

			const call = mockWs.send.mock.calls[0][0]
			expect(call.filter).toEqual({ equals: { status: 'active' } })
			expect(call.select).toEqual(['title'])
		})

		it('should not leak a later where() between the copies', async () => {
			mockWs.send.mockResolvedValue({
				type: 'queryResult',
				data: []
			})

			const lite = query.select('title')
			lite.where('status', '==', 'active')
			await query.get()

			expect(mockWs.send.mock.calls[0][0].filter).toBeUndefined()
		})
	})

	describe('onSnapshot', () => {
		it('should subscribe to query changes', () => {
			mockWs.subscribe.mockReturnValue(() => {})
			const callback = jest.fn()

			query.onSnapshot(callback)

			expect(mockWs.subscribe).toHaveBeenCalled()
		})

		it('should return unsubscribe function', () => {
			const unsubscribeFn = jest.fn()
			mockWs.subscribe.mockReturnValue(unsubscribeFn)

			const unsub = query.onSnapshot(jest.fn())

			expect(unsub).toBe(unsubscribeFn)
		})

		it('should pass select through to the subscription', () => {
			mockWs.subscribe.mockReturnValue(() => {})

			query.select('title', 'author').onSnapshot(jest.fn())

			// `select` is the 6th argument, after the aggregate slot.
			expect(mockWs.subscribe.mock.calls[0][5]).toEqual(['title', 'author'])
		})

		it('should not pass a select the caller did not set', () => {
			mockWs.subscribe.mockReturnValue(() => {})

			query.onSnapshot(jest.fn())

			expect(mockWs.subscribe.mock.calls[0][5]).toBeUndefined()
		})

		it('should call callback with snapshot', async () => {
			const callback = jest.fn()
			const unsubscribeFn = jest.fn()

			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
				// Simulate server sending ready with initial docs
				setTimeout(() => {
					cb({
						action: 'ready',
						path: 'posts',
						data: [{ id: 'doc1', title: 'Post 1' }]
					})
				}, 0)
				return unsubscribeFn
			})

			query.onSnapshot(callback)

			// Wait for async callback
			await jest.advanceTimersByTimeAsync(10)

			// Callback should be called with snapshot
			expect(callback).toHaveBeenCalled()
		})

		it('reports the first ready as all-added', async () => {
			const callback = jest.fn()
			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
				setTimeout(() => {
					cb({
						action: 'ready',
						path: 'posts',
						data: [
							{ id: 'a', title: 'A' },
							{ id: 'b', title: 'B' }
						]
					})
				}, 0)
				return () => {}
			})

			query.onSnapshot(callback)
			await jest.advanceTimersByTimeAsync(10)

			const snapshot = callback.mock.calls[0][0] as QuerySnapshot<Record<string, unknown>>
			expect(snapshot.docChanges().map((c) => [c.type, c.doc.id])).toEqual([
				['added', 'a'],
				['added', 'b']
			])
		})

		it('diffs a reconnect replay so deletions are reported as removed', async () => {
			// A re-subscribe replays the whole result set as another `ready`. If that
			// replay claims everything is 'added', consumers tracking state from
			// `docChanges()` alone (notillo's `useRtdbToEditor` drives BlockNote that
			// way) never see a document deleted while they were disconnected — the
			// block stays in the editor and gets written back, undoing the delete.
			const callback = jest.fn()
			let emit: ((event: ChangeEvent) => void) | undefined
			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
				emit = cb
				return () => {}
			})

			query.onSnapshot(callback)

			emit?.({
				action: 'ready',
				path: 'posts',
				data: [
					{ id: 'a', title: 'A' },
					{ id: 'b', title: 'B' }
				]
			})
			// Reconnect replay: `b` was deleted while we were away, `c` appeared.
			emit?.({
				action: 'ready',
				path: 'posts',
				data: [
					{ id: 'a', title: 'A2' },
					{ id: 'c', title: 'C' }
				]
			})

			const snapshot = callback.mock.calls[1][0] as QuerySnapshot<Record<string, unknown>>
			expect(snapshot.docs.map((d) => d.id)).toEqual(['a', 'c'])

			const changes = snapshot.docChanges()
			expect(changes.map((c) => [c.type, c.doc.id])).toEqual([
				['modified', 'a'],
				['added', 'c'],
				['removed', 'b']
			])
			// The removed doc carries the data it had, so a consumer can act on it.
			const removed = changes.find((c) => c.type === 'removed')
			expect(removed?.oldIndex).toBe(1)
			expect(removed?.newIndex).toBe(-1)
		})

		// A query returns a collection's own documents, so its subscription covers
		// the same set. Before `scope` existed it also received events from
		// sub-collections beneath them — documents the equivalent `get()` never
		// returns, keyed by their last path segment into the same result map.
		it('should default to children scope', () => {
			mockWs.subscribe.mockReturnValue(() => {})

			query.onSnapshot(jest.fn())

			expect(mockWs.subscribe.mock.calls[0][6]).toBe('children')
		})

		it('should keep onError and onLock working alongside scope', () => {
			const errorFn = jest.fn()
			const lockFn = jest.fn()
			let emit: ((event: ChangeEvent) => void) | undefined
			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
				emit = cb
				return () => {}
			})

			query.onSnapshot(jest.fn(), { onError: errorFn, onLock: lockFn, scope: 'subtree' })
			emit?.({
				action: 'lock',
				path: 'posts/1',
				data: { userId: 'u1', mode: 'soft', connId: 'c1' }
			})

			expect(mockWs.subscribe.mock.calls[0][3]).toBe(errorFn)
			expect(mockWs.subscribe.mock.calls[0][6]).toBe('subtree')
			expect(lockFn).toHaveBeenCalledTimes(1)
		})

		it('should handle error callback', () => {
			const errorFn = jest.fn()
			mockWs.subscribe = jest.fn()

			query.onSnapshot(jest.fn(), errorFn)

			// By position rather than `toHaveBeenCalledWith`, which is arity-sensitive
			// and breaks whenever a trailing optional argument is added to `subscribe`.
			expect(mockWs.subscribe.mock.calls[0][3]).toBe(errorFn)
		})

		it('should handle error callback in options object', () => {
			const errorFn = jest.fn()
			mockWs.subscribe = jest.fn()

			query.onSnapshot(jest.fn(), { onError: errorFn })

			expect(mockWs.subscribe.mock.calls[0][3]).toBe(errorFn)
		})

		it('should forward lock/unlock events to onLock callback', async () => {
			const snapshotCb = jest.fn()
			const onLock = jest.fn()

			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
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
			})

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

			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
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
			})

			query.onSnapshot(snapshotCb, { onLock })

			await jest.advanceTimersByTimeAsync(10)

			// onLock should fire even before ready
			expect(onLock).toHaveBeenCalledTimes(1)
			expect(onLock).toHaveBeenCalledWith(expect.objectContaining({ action: 'lock' }))
		})

		it('should silently drop lock events when no onLock is provided', async () => {
			const snapshotCb = jest.fn()

			mockWs.subscribe.mockImplementation((_path, _filter, cb) => {
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
			})

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
			mockWs.send.mockResolvedValue({
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
			mockWs.send.mockResolvedValue({
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
			mockWs.send.mockResolvedValue({
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

			mockWs.subscribe.mockImplementation((_path, _filter, cb, _onError, _aggregate) => {
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
			})

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
			mockWs.subscribe.mockReturnValue(() => {})

			const aggQuery = query.aggregate('tg')
			aggQuery.onSnapshot(jest.fn())

			// By position rather than `toHaveBeenCalledWith`, which is arity-sensitive
			// and breaks whenever a trailing optional argument is added to `subscribe`.
			expect(mockWs.subscribe.mock.calls[0][0]).toBe('posts')
			expect(mockWs.subscribe.mock.calls[0][4]).toEqual({ groupBy: 'tg' })
		})

		it('should fire callback on update events after ready', async () => {
			const callback = jest.fn()

			mockWs.subscribe.mockImplementation((_path, _filter, cb, _onError, _aggregate) => {
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
			})

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

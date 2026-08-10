// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

import { AggregateQuery } from '../aggregate-query'
import type { AggregateOptions, AggregateSnapshot, ChangeEvent } from '../types'
import { WebSocketManager } from '../websocket'

jest.mock('../websocket')

describe('AggregateQuery.onSnapshot', () => {
	let mockWs: jest.Mocked<WebSocketManager>
	let emit: (event: ChangeEvent) => void

	beforeEach(() => {
		mockWs = new WebSocketManager('test-db', () => 'token', 'wss://test.com', {
			enableCache: false,
			reconnect: true,
			reconnectDelay: 1000,
			maxReconnectDelay: 30000,
			debug: false
		}) as jest.Mocked<WebSocketManager>
		mockWs.subscribe = jest.fn((_path, _filter, cb) => {
			emit = cb as (event: ChangeEvent) => void
			return jest.fn()
		}) as unknown as jest.Mocked<WebSocketManager>['subscribe']
	})

	function subscribe(aggregate: AggregateOptions = { groupBy: 'tg' }) {
		const callback = jest.fn() as jest.Mock<(snapshot: AggregateSnapshot) => void>
		new AggregateQuery(mockWs, 'posts', aggregate).onSnapshot(callback)
		const last = () => callback.mock.calls[callback.mock.calls.length - 1][0]
		return { callback, last }
	}

	it('should replace the whole group set on a min/max recompute', () => {
		const { callback, last } = subscribe({ groupBy: 'tg', ops: [{ op: 'min', field: 'p' }] })

		emit({
			action: 'ready',
			path: 'posts',
			data: [
				{ group: 'a', count: 2, min: 1 },
				{ group: 'b', count: 5, min: 3 }
			]
		})
		// A recompute cannot express an emptied group as a delta — group 'b' is just
		// absent from the payload. Merging would keep it forever, so `replace` has to
		// drop everything the payload does not mention.
		emit({
			action: 'replace',
			path: 'posts',
			data: [{ group: 'a', count: 3, min: 0 }]
		})

		expect(callback).toHaveBeenCalledTimes(2)
		expect(last()).toEqual({
			groups: [{ group: 'a', count: 3, min: 0 }],
			size: 1,
			empty: false
		})
	})

	it('should accept a replace before any ready', () => {
		const { callback, last } = subscribe({ groupBy: 'tg', ops: [{ op: 'max', field: 'p' }] })

		emit({
			action: 'replace',
			path: 'posts',
			data: [{ group: 'a', count: 1, max: 9 }]
		})

		expect(callback).toHaveBeenCalledTimes(1)
		expect(last().groups).toEqual([{ group: 'a', count: 1, max: 9 }])
	})

	it('should remove a group when the delta reports count 0', () => {
		const { callback, last } = subscribe()

		emit({
			action: 'ready',
			path: 'posts',
			data: [
				{ group: 'a', count: 2 },
				{ group: 'b', count: 5 }
			]
		})
		emit({
			action: 'update',
			path: 'posts',
			data: [
				{ group: 'a', count: 0 },
				{ group: 'b', count: 6 }
			]
		})

		expect(callback).toHaveBeenCalledTimes(2)
		expect(last()).toEqual({
			groups: [{ group: 'b', count: 6 }],
			size: 1,
			empty: false
		})
	})

	it('should keep existing groups in place and append new ones', () => {
		const { last } = subscribe()

		emit({
			action: 'ready',
			path: 'posts',
			data: [
				{ group: 'a', count: 3 },
				{ group: 'b', count: 2 }
			]
		})
		emit({
			action: 'update',
			path: 'posts',
			data: [
				{ group: 'c', count: 1 },
				{ group: 'a', count: 4 }
			]
		})

		expect(last().groups).toEqual([
			{ group: 'a', count: 4 },
			{ group: 'b', count: 2 },
			{ group: 'c', count: 1 }
		])
	})

	it('should merge a min/max update rather than treating it as a recompute', () => {
		// An `update` is always a delta, whatever its cardinality; reading one as a
		// full recompute would drop every group the payload does not mention.
		const { last } = subscribe({ groupBy: 'tg', ops: [{ op: 'max', field: 'score' }] })

		emit({
			action: 'ready',
			path: 'posts',
			data: [
				{ group: 'a', count: 2, max_score: 9 },
				{ group: 'b', count: 1, max_score: 4 }
			]
		})
		emit({
			action: 'update',
			path: 'posts',
			data: [
				{ group: 'a', count: 3, max_score: 12 },
				{ group: 'c', count: 1, max_score: 7 }
			]
		})

		expect(last().groups).toEqual([
			{ group: 'a', count: 3, max_score: 12 },
			{ group: 'b', count: 1, max_score: 4 },
			{ group: 'c', count: 1, max_score: 7 }
		])
		expect(last().size).toBe(3)
	})

	it('should drop only the tombstoned group when a min/max update carries one', () => {
		// `count: 0` is the tombstone for an emptied group; the groups the payload
		// does not mention are untouched, not dropped.
		const { last } = subscribe({ groupBy: 'tg', ops: [{ op: 'max', field: 'score' }] })

		emit({
			action: 'ready',
			path: 'posts',
			data: [
				{ group: 'a', count: 2, max_score: 9 },
				{ group: 'b', count: 1, max_score: 4 }
			]
		})
		emit({ action: 'update', path: 'posts', data: [{ group: 'a', count: 0 }] })

		expect(last().groups).toEqual([{ group: 'b', count: 1, max_score: 4 }])
		expect(last().size).toBe(1)
	})

	it('should not fire the callback on lock/unlock events', () => {
		const { callback } = subscribe()

		emit({ action: 'ready', path: 'posts', data: [{ group: 'a', count: 1 }] })
		emit({ action: 'lock', path: 'posts/doc1', data: { userId: 'u1', mode: 'soft' } })
		emit({ action: 'unlock', path: 'posts/doc1', data: { userId: 'u1' } })

		expect(callback).toHaveBeenCalledTimes(1)
	})

	it('should hand out a fresh array on every callback', () => {
		const { callback } = subscribe()

		emit({ action: 'ready', path: 'posts', data: [{ group: 'a', count: 1 }] })
		emit({ action: 'update', path: 'posts', data: [{ group: 'b', count: 1 }] })

		const first = callback.mock.calls[0][0]
		const second = callback.mock.calls[1][0]
		expect(first.groups).not.toBe(second.groups)
		expect(first.groups).toEqual([{ group: 'a', count: 1 }])
	})

	it('should replace the map on a second ready (reconnect replay)', () => {
		const { last } = subscribe()

		emit({
			action: 'ready',
			path: 'posts',
			data: [
				{ group: 'a', count: 2 },
				{ group: 'b', count: 5 }
			]
		})
		emit({ action: 'ready', path: 'posts', data: [{ group: 'b', count: 5 }] })

		expect(last()).toEqual({
			groups: [{ group: 'b', count: 5 }],
			size: 1,
			empty: false
		})
	})
})

// vim: ts=4

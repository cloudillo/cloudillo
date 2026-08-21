// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `useContentSearch` answers the sidebar's page-content search from the server.
 *
 * What is asserted is mostly what it *stops* showing: a hit was matched against
 * one query text and one tag set, and the tag filter is applied server-side
 * inside the match, so a result outliving its request is wrong, not merely stale.
 */

// Type-only, so the module mock below is unaffected.
import type { SearchHit } from '@cloudillo/core'
import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

type Deferred = {
	resolve: (hits: SearchHit[]) => void
	reject: (err: Error) => void
}

const pending: Deferred[] = []

const query = jest.fn(
	() =>
		new Promise<SearchHit[]>((resolve, reject) => {
			pending.push({ resolve, reject })
		})
)

jest.unstable_mockModule('@cloudillo/core', () => ({
	createApiClient: () => ({ search: { query } }),
	getAppBus: () => ({ accessToken: 'token' })
}))

const { useContentSearch } = await import('../hooks/useContentSearch.js')
type Options = Parameters<typeof useContentSearch>[0]

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Minimal renderHook, so the suite needs no @testing-library dependency. */
function renderHook(initial: Options) {
	const root = createRoot(document.createElement('div'))
	const result = { current: undefined as unknown as ReturnType<typeof useContentSearch> }
	function Probe({ opts }: { opts: Options }) {
		result.current = useContentSearch(opts)
		return null
	}
	act(() => {
		root.render(<Probe opts={initial} />)
	})
	return {
		result,
		rerender(opts: Options) {
			act(() => {
				root.render(<Probe opts={opts} />)
			})
		},
		unmount() {
			act(() => {
				root.unmount()
			})
		}
	}
}

/** Run out the 250 ms query debounce and let the response promise settle. */
async function flush() {
	await act(async () => {
		jest.advanceTimersByTime(300)
	})
}

function hit(partId: string): SearchHit {
	return {
		objTp: 'D',
		objId: 'f1',
		partId,
		score: 1,
		updatedAt: '2026-01-01T00:00:00Z'
	}
}

const BASE: Options = {
	fileId: 'f1',
	idTag: 'me.tld',
	query: 'brown',
	enabled: true
}

beforeEach(() => {
	pending.length = 0
	query.mockClear()
	jest.useFakeTimers()
	jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	jest.clearAllTimers()
	jest.useRealTimers()
	jest.restoreAllMocks()
})

describe('useContentSearch', () => {
	it('drops the previous hits as soon as the query changes', async () => {
		const { result, rerender, unmount } = renderHook(BASE)

		await flush()
		await act(async () => {
			pending[0].resolve([hit('p1')])
		})
		expect(result.current.ready).toBe(true)
		expect([...result.current.hits.keys()]).toEqual(['p1'])

		// Typing on. `p1` matched 'brown' and would render a snippet highlighting a
		// word no longer in the box.
		rerender({ ...BASE, query: 'brownie' })
		expect(result.current.ready).toBe(false)
		expect(result.current.hits.size).toBe(0)

		unmount()
	})

	it('drops the previous hits when only the tag filter changes', async () => {
		// The server applies the tag filter inside the match, so these hits were
		// vetted against the old tag set — keeping them would list pages that do
		// not carry the newly selected tag.
		const { result, rerender, unmount } = renderHook({ ...BASE, tags: new Set(['a']) })

		await flush()
		await act(async () => {
			pending[0].resolve([hit('p1')])
		})
		expect(result.current.hits.size).toBe(1)

		rerender({ ...BASE, tags: new Set(['b']) })
		expect(result.current.hits.size).toBe(0)
		expect(result.current.ready).toBe(false)

		unmount()
	})

	it('ignores a response that a newer query has superseded', async () => {
		const { result, rerender, unmount } = renderHook(BASE)

		await flush()
		rerender({ ...BASE, query: 'brownie' })
		await flush()
		expect(pending).toHaveLength(2)

		// The newer request answers first, then the older one arrives late.
		await act(async () => {
			pending[1].resolve([hit('p2')])
		})
		await act(async () => {
			pending[0].resolve([hit('p1')])
		})

		expect([...result.current.hits.keys()]).toEqual(['p2'])

		unmount()
	})

	it('answers a tag-only filter locally, without asking the server', async () => {
		const { result, unmount } = renderHook({ ...BASE, query: '', tags: new Set(['a']) })

		await flush()

		expect(query).not.toHaveBeenCalled()
		expect(result.current.ready).toBe(true)
		expect(result.current.hits.size).toBe(0)

		unmount()
	})

	it('clears a failure when the search box empties', async () => {
		// The error state is itself empty-and-ready, so without an explicit check
		// for it the hook would keep returning it forever, making the sidebar's
		// "Try again" a permanent no-op.
		const { result, rerender, unmount } = renderHook(BASE)

		await flush()
		await act(async () => {
			pending[0].reject(new Error('offline'))
		})
		expect(result.current.error).toBeInstanceOf(Error)
		expect(result.current.ready).toBe(true)

		rerender({ ...BASE, query: '' })
		expect(result.current.error).toBeUndefined()
		expect(result.current.ready).toBe(true)

		unmount()
	})

	it('re-runs the query on retry', async () => {
		const { result, unmount } = renderHook(BASE)

		await flush()
		await act(async () => {
			pending[0].reject(new Error('offline'))
		})
		expect(result.current.error).toBeInstanceOf(Error)

		act(() => {
			result.current.retry()
		})
		await flush()
		expect(query).toHaveBeenCalledTimes(2)

		await act(async () => {
			pending[1].resolve([hit('p1')])
		})
		expect(result.current.error).toBeUndefined()
		expect([...result.current.hits.keys()]).toEqual(['p1'])

		unmount()
	})
})

// vim: ts=4

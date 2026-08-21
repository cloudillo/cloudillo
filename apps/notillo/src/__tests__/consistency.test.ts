// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { RtdbClient } from '@cloudillo/rtdb'
import { jest } from '@jest/globals'

import { analyzePages, type ConsistencyResult, fixConsistency } from '../rtdb/consistency.js'
import type { StoredPageRecord } from '../rtdb/types.js'

function page(pp?: string): StoredPageRecord {
	return {
		ti: 'T',
		...(pp !== undefined && { pp }),
		o: 0,
		ca: '',
		ua: '',
		cb: 'u'
	}
}

function makePages(entries: Record<string, string | undefined>): Map<string, StoredPageRecord> {
	return new Map(Object.entries(entries).map(([id, pp]) => [id, page(pp)]))
}

describe('analyzePages', () => {
	it('reports a clean tree as needing nothing', () => {
		const result = analyzePages(makePages({ home: '__root__', a: 'home', b: 'a' }))
		expect(result).toMatchObject({
			totalPages: 3,
			rootPages: 1,
			unfiledPages: [],
			danglingPages: [],
			cyclicPages: [],
			needsFix: false
		})
	})

	it('reports unfiled pages without calling them broken', () => {
		// @-mention pages are deliberately unfiled — informational, never repaired.
		const result = analyzePages(makePages({ home: '__root__', note: undefined }))
		expect(result.unfiledPages).toEqual(['note'])
		expect(result.needsFix).toBe(false)
	})

	it('flags a page whose parent no longer exists', () => {
		const result = analyzePages(makePages({ home: '__root__', lost: 'gone' }))
		expect(result.danglingPages).toEqual(['lost'])
		expect(result.cyclicPages).toEqual([])
		expect(result.needsFix).toBe(true)
	})

	it('finds a two-page loop and breaks it by re-rooting exactly one member', () => {
		const result = analyzePages(makePages({ home: '__root__', x: 'y', y: 'x' }))
		expect(result.cyclicPages.sort()).toEqual(['x', 'y'])
		expect(result.cycleBreakPages).toHaveLength(1)
		expect(['x', 'y']).toContain(result.cycleBreakPages[0])
		expect(result.needsFix).toBe(true)
	})

	it('finds a three-page loop', () => {
		const result = analyzePages(makePages({ x: 'y', y: 'z', z: 'x' }))
		expect(result.cyclicPages.sort()).toEqual(['x', 'y', 'z'])
		expect(result.cycleBreakPages).toHaveLength(1)
	})

	it('reports a page hanging off a loop — it is just as unreachable', () => {
		const result = analyzePages(makePages({ hanger: 'x', x: 'y', y: 'x' }))
		expect(result.cyclicPages.sort()).toEqual(['hanger', 'x', 'y'])
		// The hanger is not part of the loop, so re-rooting it would leave the
		// loop intact — only a real member may be the break point.
		expect(['x', 'y']).toContain(result.cycleBreakPages[0])
		expect(result.cycleBreakPages).toHaveLength(1)
	})

	it('gives two separate loops one break point each', () => {
		const result = analyzePages(makePages({ a: 'b', b: 'a', c: 'd', d: 'c' }))
		expect(result.cyclicPages.sort()).toEqual(['a', 'b', 'c', 'd'])
		expect(result.cycleBreakPages).toHaveLength(2)
	})

	it('does not mistake a deep chain for a loop', () => {
		const result = analyzePages(
			makePages({ home: '__root__', a: 'home', b: 'a', c: 'b', d: 'c' })
		)
		expect(result.cyclicPages).toEqual([])
		expect(result.needsFix).toBe(false)
	})
})

/** Record every `update` per commit, so batch boundaries are observable. */
function mockClient() {
	const commits: string[][] = []
	let current: string[] = []
	const client = {
		ref: (path: string) => path,
		batch: () => {
			current = []
			return {
				update(ref: string, _data: unknown) {
					current.push(ref)
				},
				async commit() {
					commits.push(current)
				}
			}
		}
	}
	return { commits, client: client as unknown as RtdbClient }
}

function repairResult(ids: string[]): ConsistencyResult {
	return {
		totalPages: ids.length,
		rootPages: 0,
		unfiledPages: [],
		danglingPages: ids,
		cyclicPages: [],
		cycleBreakPages: [],
		needsFix: true
	}
}

describe('fixConsistency', () => {
	it('commits nothing when there is nothing to repair', async () => {
		const { commits, client } = mockClient()

		await fixConsistency(client, repairResult([]))

		expect(commits).toHaveLength(0)
	})

	it('splits a mass repair into fixed-size batches', async () => {
		// The case this repair exists for — an interrupted subtree delete leaving
		// hundreds of dangling children — is exactly when one unbounded commit is
		// most likely to be refused.
		const ids = Array.from({ length: 450 }, (_, i) => `p${i}`)
		const { commits, client } = mockClient()

		await fixConsistency(client, repairResult(ids))

		expect(commits.length).toBeGreaterThan(1)
		expect(Math.max(...commits.map((c) => c.length))).toBeLessThanOrEqual(200)
		// Every page repaired exactly once, none dropped at a batch boundary.
		expect(commits.flat()).toEqual(ids.map((id) => `p/${id}`))
	})

	it('repairs cycle break points alongside dangling pages', async () => {
		const { commits, client } = mockClient()

		await fixConsistency(client, { ...repairResult(['a']), cycleBreakPages: ['x'] })

		expect(commits).toEqual([['p/a', 'p/x']])
	})

	it('writes one page per loop, not every page in it', async () => {
		// What the repair prompt has to count: a 5-page loop is 5 pages "in a parent
		// loop" but exactly 1 rewrite, and offering to "repair 5 pages" then
		// updating one is a promise the repair does not keep.
		const analysis = analyzePages(makePages({ a: 'b', b: 'c', c: 'd', d: 'e', e: 'a' }))
		expect(analysis.cyclicPages).toHaveLength(5)
		expect(analysis.cycleBreakPages).toHaveLength(1)

		const { commits, client } = mockClient()
		await fixConsistency(client, analysis)

		expect(commits.flat()).toHaveLength(
			analysis.danglingPages.length + analysis.cycleBreakPages.length
		)
		expect(commits.flat()).toEqual([`p/${analysis.cycleBreakPages[0]}`])
	})

	it('re-roots each repaired page', async () => {
		const updates: Array<[string, unknown]> = []
		const client = {
			ref: (path: string) => path,
			batch: () => ({
				update(ref: string, data: unknown) {
					updates.push([ref, data])
				},
				commit: jest.fn(async () => {})
			})
		} as unknown as RtdbClient

		await fixConsistency(client, repairResult(['a']))

		expect(updates[0][0]).toBe('p/a')
		expect(updates[0][1]).toMatchObject({ pp: '__root__' })
	})
})

// vim: ts=4

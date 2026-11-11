// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { fetchAll } from '../api-client'

describe('fetchAll', () => {
	it('follows next across pages', async () => {
		let n = 0
		const rows = await fetchAll(async () => {
			n++
			return { data: [n], meta: n < 3 ? { next: `c${n}` } : {} }
		})
		expect(rows).toEqual([1, 2, 3])
	})

	it('throws when maxPages is hit with pages left', async () => {
		let n = 0
		await expect(
			fetchAll(
				async () => {
					n++
					return { data: [n], meta: { next: `c${n}` } }
				},
				{ maxPages: 3 }
			)
		).rejects.toThrow('more than 3 pages')
		expect(n).toBe(3)
	})

	it('returns [] for a single empty last page', async () => {
		const rows = await fetchAll(async () => ({ data: [], meta: {} }))
		expect(rows).toEqual([])
	})

	it('rejects before fetching when the signal is already aborted', async () => {
		const ac = new AbortController()
		ac.abort()
		let called = false
		await expect(
			fetchAll(
				async () => {
					called = true
					return { data: [], meta: {} }
				},
				{ signal: ac.signal }
			)
		).rejects.toMatchObject({ name: 'AbortError' })
		expect(called).toBe(false)
	})
})

// vim: ts=4

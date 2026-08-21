// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { RtdbClient } from '@cloudillo/rtdb'
import { jest } from '@jest/globals'

import { setHomePage } from '../rtdb/page-ops.js'
import { decodeDocSettings, type PageRecord } from '../rtdb/types.js'

// The document's settings cross the same trust boundary its pages do — a record
// written by a Notillo of unknown vintage — so an unreadable one has to read as "no
// settings", never as a throw that takes the document down with it.
//
// `setHomePage` is the storage half of promoting a page: the home page is the parent
// of the top-level pages, so its own children have to become top-level or the same
// URL namespace would have two storage locations behind it.

type PageWithId = PageRecord & { id: string }

function page(id: string, over: Partial<PageRecord> = {}): PageWithId {
	return { id, title: id, parentPageId: '__root__', order: 0, ...over }
}

function pageMap(...pages: PageWithId[]): Map<string, PageWithId> {
	return new Map(pages.map((p) => [p.id, p]))
}

/** The narrow slice of `RtdbClient` `setHomePage` touches, recording what it wrote. */
function fakeClient() {
	const writes: Array<{ path: string; data: unknown }> = []
	const commits: number[] = []
	const client = {
		ref: (path: string) => ({ path }),
		batch: () => {
			const staged: Array<{ path: string; data: unknown }> = []
			return {
				update: (ref: { path: string }, data: unknown) =>
					staged.push({ path: ref.path, data }),
				commit: async () => {
					commits.push(staged.length)
					writes.push(...staged)
				}
			}
		}
	} as unknown as RtdbClient
	return { client, writes, commits }
}

describe('decodeDocSettings', () => {
	it('should keep a cleared field as null rather than dropping it', () => {
		// `null` is what clearing writes, and every consumer tests `== null` — but it
		// must survive the decode to get that far.
		expect(decodeDocSettings({ homePageId: null })).toEqual({ homePageId: null })
	})

	it('should drop a field a newer Notillo added', () => {
		// `unknownFields: 'drop'`, the same policy every stored decode here follows.
		expect(decodeDocSettings({ siteMode: true, theme: 'dark' })).toEqual({ siteMode: true })
	})

	it.each([
		['a malformed record', { homePageId: 42 }],
		['a non-object', 'nope'],
		['null', null]
	])('should refuse %s without throwing', (_label, data) => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		expect(decodeDocSettings(data)).toBeUndefined()
		warn.mockRestore()
	})
})

describe('setHomePage', () => {
	it('should reparent the new home page’s direct children to the root', async () => {
		const { client, writes } = fakeClient()
		const pages = pageMap(
			page('home'),
			page('c1', { parentPageId: 'home' }),
			page('c2', { parentPageId: 'home' })
		)

		await setHomePage(client, pages, 'home')

		expect(writes.map((w) => w.path).sort()).toEqual(['p/c1', 'p/c2'])
		for (const write of writes) {
			expect(write.data).toMatchObject({ pp: '__root__' })
		}
	})

	it('should leave grandchildren where they are', async () => {
		// Only the direct children are the top-level pages; a grandchild stays a
		// subpage of its own parent and keeps its address under it.
		const { client, writes } = fakeClient()
		const pages = pageMap(
			page('home'),
			page('c1', { parentPageId: 'home' }),
			page('g1', { parentPageId: 'c1' })
		)

		await setHomePage(client, pages, 'home')

		expect(writes.map((w) => w.path)).toEqual(['p/c1'])
	})

	it('should write nothing for a page with no children', async () => {
		const { client, writes, commits } = fakeClient()
		await setHomePage(client, pageMap(page('home')), 'home')
		expect(writes).toEqual([])
		expect(commits).toEqual([])
	})

	it('should batch a wide subtree rather than committing it in one go', async () => {
		const { client, writes, commits } = fakeClient()
		const children = Array.from({ length: 250 }, (_, i) =>
			page(`c${i}`, { parentPageId: 'home' })
		)
		await setHomePage(client, pageMap(page('home'), ...children), 'home')

		expect(writes).toHaveLength(250)
		// The chunk size itself is private to `page-ops.ts` and free to be tuned; what
		// has to hold is that a wide subtree goes out in more than one commit and that
		// no page is dropped between them.
		expect(commits.length).toBeGreaterThan(1)
		expect(commits.reduce((a, b) => a + b, 0)).toBe(250)
	})
})

// vim: ts=4

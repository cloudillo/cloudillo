// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// The query half of an `index` block, which is the one piece of it the publisher and
// the live editor share. Both sides adapt their own page type to `ListingPage` and
// call `selectListing`, so what is asserted here is what "children", "subtree" and
// the rest *mean* — the definition that keeps an author's arrangement and its
// published copy from drifting.

import type { SiteListingQuery } from '@cloudillo/core'

import {
	type ListingPage,
	listingParentId,
	ROOT_PARENT,
	selectListing,
	siteListingQuery
} from '../publish/listing.js'
import { type PageWithId, resolveTree, toListingPage } from '../publish/tree.js'

function page(pageId: string, over: Partial<ListingPage> = {}): ListingPage {
	return { pageId, title: pageId, order: 0, ...over }
}

describe('siteListingQuery', () => {
	it('should default every knob', () => {
		expect(siteListingQuery(undefined)).toEqual({
			source: 'children',
			sort: 'date-desc',
			layout: 'list'
		})
		expect(siteListingQuery({})).toEqual(siteListingQuery(undefined))
	})

	it('should fall back for a value from a newer Notillo', () => {
		const query = siteListingQuery({ source: 'galaxy', sort: 'vibes', layout: 'hologram' })
		expect(query).toMatchObject({ source: 'children', sort: 'date-desc', layout: 'list' })
	})

	it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
		'should fall back for the prototype-chain value %p',
		(name) => {
			// A bare index lookup would answer with a truthy member of
			// `Object.prototype` and the fallback would never fire — the same hazard
			// `siteArchetype` guards, and the same decode that closes it.
			expect(siteListingQuery({ source: name, layout: name }).source).toBe('children')
			expect(siteListingQuery({ layout: name }).layout).toBe('list')
		}
	)

	it('should never answer with the string that cleanProps drops', () => {
		// `cleanProps` (`rtdb/transform.ts`) silently drops any prop whose value is
		// the literal `'default'` on write, so a prop that could hold it would appear
		// to save and come back as its default. Guarded here rather than by comment.
		const query = siteListingQuery({
			source: 'default',
			sort: 'default',
			layout: 'default'
		})
		expect(Object.values(query)).not.toContain('default')
		expect(query).toMatchObject({ source: 'children', sort: 'date-desc', layout: 'list' })
	})

	it('should treat a negative or unreadable count as no cap', () => {
		expect(siteListingQuery({ limit: -3, depth: 'lots' })).toMatchObject({
			source: 'children'
		})
		expect(siteListingQuery({ limit: -3 }).limit).toBeUndefined()
		expect(siteListingQuery({ depth: 'lots' }).depth).toBeUndefined()
		expect(siteListingQuery({ limit: 2.7 }).limit).toBe(2)
	})

	it('should treat anything but true as no feed', () => {
		expect(siteListingQuery({ feed: 'yes' }).feed).toBeUndefined()
		expect(siteListingQuery({ feed: false }).feed).toBeUndefined()
		expect(siteListingQuery({ feed: true }).feed).toBe(true)
	})
})

// A small tree, shared by the source cases:
//
//   root
//   ├── a          (2026-03, order 1, #news)
//   │   ├── a1     (2026-01, order 1)
//   │   └── a2     (2026-05, order 2, #news)
//   └── b          (2026-02, order 2)
const TREE: ListingPage[] = [
	page('a', { parentId: 'root', order: 1, date: '2026-03-01', tags: ['news'] }),
	page('a1', { parentId: 'a', order: 1, date: '2026-01-01' }),
	page('a2', { parentId: 'a', order: 2, date: '2026-05-01', tags: ['news'] }),
	page('b', { parentId: 'root', order: 2, date: '2026-02-01' }),
	page('root', { order: 0, date: '2026-04-01' })
]

function query(over: Partial<SiteListingQuery> = {}): SiteListingQuery {
	return { source: 'children', sort: 'date-desc', layout: 'list', ...over }
}

function ids(rows: ListingPage[]): string[] {
	return rows.map((row) => row.pageId)
}

describe('selectListing — sources', () => {
	it('should list the direct children of the page it sits on', () => {
		expect(ids(selectListing(TREE, query(), 'root'))).toEqual(['a', 'b'])
		expect(ids(selectListing(TREE, query(), 'a'))).toEqual(['a2', 'a1'])
	})

	it('should list the children of an explicit root instead', () => {
		expect(ids(selectListing(TREE, query({ root: 'a' }), 'root'))).toEqual(['a2', 'a1'])
	})

	it('should walk a subtree depth-first in tree order, annotating depth', () => {
		const rows = selectListing(TREE, query({ source: 'subtree' }), 'root')
		expect(ids(rows)).toEqual(['a', 'a1', 'a2', 'b'])
		expect(rows.map((row) => row.depth)).toEqual([0, 1, 1, 0])
	})

	it('should cap a subtree at the requested depth', () => {
		const rows = selectListing(TREE, query({ source: 'subtree', depth: 1 }), 'root')
		expect(ids(rows)).toEqual(['a', 'b'])
	})

	it('should list the other children of its own parent as siblings', () => {
		expect(ids(selectListing(TREE, query({ source: 'siblings' }), 'a1'))).toEqual(['a2'])
		expect(ids(selectListing(TREE, query({ source: 'siblings' }), 'a'))).toEqual(['b'])
	})

	it('should list every page carrying a tag, ignoring root', () => {
		const rows = selectListing(TREE, query({ source: 'tag', tag: 'news', root: 'b' }), 'root')
		expect(ids(rows)).toEqual(['a2', 'a'])
	})

	it('should list nothing for a tag nobody carries, or for no tag at all', () => {
		expect(selectListing(TREE, query({ source: 'tag', tag: 'nope' }), 'root')).toEqual([])
		expect(selectListing(TREE, query({ source: 'tag' }), 'root')).toEqual([])
	})

	it('should list every page for `all`', () => {
		expect(ids(selectListing(TREE, query({ source: 'all' }), 'root'))).toEqual([
			'a2',
			'a',
			'b',
			'a1'
		])
	})

	it('should exclude the page the block sits on from every source', () => {
		for (const source of ['children', 'subtree', 'siblings', 'tag', 'all'] as const) {
			const rows = selectListing(TREE, query({ source, tag: 'news' }), 'a')
			expect(ids(rows)).not.toContain('a')
		}
	})

	it('should survive a parent cycle rather than recursing forever', () => {
		// No UI can build one, but a concurrent re-parent of two pages can leave one
		// behind — and without the visited set this never returns.
		const looped = [
			page('x', { parentId: 'y', order: 1 }),
			page('y', { parentId: 'x', order: 2 })
		]
		expect(ids(selectListing(looped, query({ source: 'subtree' }), 'x'))).toEqual(['y'])
	})
})

describe('selectListing — order and limit', () => {
	it('should sort by date in both directions, with the sidebar order as tie-break', () => {
		expect(ids(selectListing(TREE, query({ sort: 'date-desc' }), 'root'))).toEqual(['a', 'b'])
		expect(ids(selectListing(TREE, query({ sort: 'date-asc' }), 'root'))).toEqual(['b', 'a'])

		const tied = [
			page('late', { parentId: 'root', order: 2, date: '2026-01-01' }),
			page('early', { parentId: 'root', order: 1, date: '2026-01-01' })
		]
		expect(ids(selectListing(tied, query(), 'root'))).toEqual(['early', 'late'])
	})

	it('should sort by title and by tree order', () => {
		const rows = [
			page('z', { parentId: 'root', order: 1, title: 'Zebra' }),
			page('m', { parentId: 'root', order: 2, title: 'Mango' })
		]
		expect(ids(selectListing(rows, query({ sort: 'title' }), 'root'))).toEqual(['m', 'z'])
		expect(ids(selectListing(rows, query({ sort: 'order' }), 'root'))).toEqual(['z', 'm'])
	})

	it('should keep tree order for a subtree and for the tree layout whatever sort says', () => {
		const subtree = selectListing(TREE, query({ source: 'subtree', sort: 'title' }), 'root')
		expect(ids(subtree)).toEqual(['a', 'a1', 'a2', 'b'])

		// A nested list sorted by date is a nesting that means nothing, so the layout
		// overrides the sort here too.
		const treeLayout = selectListing(TREE, query({ layout: 'tree', sort: 'date-asc' }), 'root')
		expect(ids(treeLayout)).toEqual(['a', 'b'])
	})

	it('should apply the limit last, after sorting', () => {
		expect(ids(selectListing(TREE, query({ sort: 'date-asc', limit: 1 }), 'root'))).toEqual([
			'b'
		])
		// For a subtree it caps the flattened list, not each level.
		expect(ids(selectListing(TREE, query({ source: 'subtree', limit: 2 }), 'root'))).toEqual([
			'a',
			'a1'
		])
	})

	it('should list nothing when there is no root to be relative to', () => {
		expect(selectListing(TREE, query(), undefined)).toEqual([])
		expect(selectListing(TREE, query({ source: 'siblings' }), undefined)).toEqual([])
	})
})

// The adapters themselves, run against each other.
//
// `selectListing` is shared, but each side reaches it through its own `ListingPage`
// adapter, and those are where the two drifted: the publisher passes the *resolved*
// parent (`toListingPage`, from `resolveTree`'s ancestry) while the editor used to
// pass the raw stored `pp` — and omit the key entirely when it was falsy. So a
// `children` block on the home page listed nothing here and the whole site once
// published, and an unfiled page was in every published root listing and no editor
// one. Comparing the two row lists is the guard that would have caught that.

function record(id: string, over: Partial<PageWithId> = {}): PageWithId {
	// `publishedAt` on every page so `listingDate` and the editor's own `pubAt` are
	// the same string, leaving `parentId` as the only thing that can differ.
	return {
		id,
		title: id,
		parentPageId: ROOT_PARENT,
		order: 0,
		publishedAt: '2026-01-01',
		...over
	}
}

/** What `PageIndex` builds and hands to `selectListing`. */
function editorRows(
	pages: PageWithId[],
	homePageId: string | undefined,
	q: SiteListingQuery,
	self: string | undefined
): ListingPage[] {
	const listing = pages.map((page) => ({
		pageId: page.id,
		title: page.title,
		parentId: listingParentId(page.id, page.parentPageId, homePageId),
		order: page.order,
		...(page.tags?.length && { tags: page.tags }),
		...(page.publishedAt !== undefined && { date: page.publishedAt })
	}))
	return selectListing(listing, q, self)
}

/** What the serializer builds and hands to `selectListing`. */
function publishRows(
	pages: PageWithId[],
	homePageId: string | undefined,
	q: SiteListingQuery,
	self: string | undefined
): ListingPage[] {
	const tree = resolveTree(
		new Map(pages.map((page) => [page.id, page])),
		homePageId ? { homePageId } : undefined
	)
	return selectListing(
		tree.pages.map((resolved) => toListingPage(resolved)),
		q,
		self
	)
}

describe('selectListing — the editor and the publisher agree', () => {
	const HOME = 'home'

	it('should list the same rows for a children block on the home page', () => {
		// The flagship case: `setHomePage` reparents top-level pages to `'__root__'`
		// while `resolveTree` gives them `ancestry: [home]`, so the two buckets used
		// to be `'__root__'` and `home` — one holding everything, the other nothing.
		const pages = [
			record(HOME, { title: 'Home' }),
			record('t1', { title: 'First', order: 1 }),
			record('t2', { title: 'Second', order: 2 }),
			record('c1', { title: 'Child', parentPageId: 't1' }),
			// A page the author filed *under* the home page is the same level.
			record('t3', { title: 'Third', parentPageId: HOME, order: 3 })
		]
		const q = query({ sort: 'order' })

		const editor = editorRows(pages, HOME, q, HOME)
		expect(ids(editor)).toEqual(['t1', 't2', 't3'])
		expect(editor).toEqual(publishRows(pages, HOME, q, HOME))
	})

	it('should list the same rows for an unfiled page at the top level', () => {
		// `removeFromSidebar` writes `pp: null`. Omitting `parentId` for it dropped
		// it from every editor listing, while `resolveTree` lifts it to top level.
		const pages = [
			record(HOME, { title: 'Home' }),
			record('t1', { title: 'Filed', order: 1 }),
			record('u1', { title: 'Unfiled', parentPageId: null, order: 2 }),
			record('u2', { title: 'Also unfiled', parentPageId: undefined, order: 3 })
		]
		const q = query({ sort: 'order' })

		const editor = editorRows(pages, HOME, q, HOME)
		expect(ids(editor)).toEqual(['t1', 'u1', 'u2'])
		expect(editor).toEqual(publishRows(pages, HOME, q, HOME))
	})

	it('should agree with no home page set at all', () => {
		const pages = [
			record('t1', { title: 'First', order: 1 }),
			record('t2', { title: 'Second', order: 2 }),
			record('c1', { title: 'Child', parentPageId: 't1' }),
			record('u1', { title: 'Unfiled', parentPageId: null, order: 3 })
		]
		const q = query({ sort: 'order', root: ROOT_PARENT })

		const editor = editorRows(pages, undefined, q, undefined)
		expect(ids(editor)).toEqual(['t1', 't2', 'u1'])
		expect(editor).toEqual(publishRows(pages, undefined, q, undefined))
	})

	it('should agree on a subtree listing further down the tree', () => {
		const pages = [
			record(HOME, { title: 'Home' }),
			record('t1', { title: 'Blog', order: 1 }),
			record('c1', { title: 'One', parentPageId: 't1', order: 1 }),
			record('c2', { title: 'Two', parentPageId: 't1', order: 2 }),
			record('g1', { title: 'Deep', parentPageId: 'c1' })
		]
		const q = query({ source: 'subtree' })

		const editor = editorRows(pages, HOME, q, 't1')
		expect(ids(editor)).toEqual(['c1', 'g1', 'c2'])
		expect(editor).toEqual(publishRows(pages, HOME, q, 't1'))
	})
})

// vim: ts=4

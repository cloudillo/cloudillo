// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	buildChildIndex,
	collectDescendants,
	getAncestorIds,
	isAncestor,
	planMove
} from '../rtdb/page-ops.js'
import type { PageRecord } from '../rtdb/types.js'

type PageWithId = PageRecord & { id: string }

function page(id: string, title: string, parentPageId?: string): PageWithId {
	return {
		id,
		title,
		...(parentPageId !== undefined && { parentPageId }),
		order: 0,
		createdAt: '',
		updatedAt: '',
		createdBy: 'u'
	}
}

function makePages(...list: PageWithId[]): Map<string, PageWithId> {
	return new Map(list.map((p) => [p.id, p]))
}

//     home (root)
//       └ a
//         └ b
//           └ c
//     unfiled  (no parent — an @-mention page)
//     lost     (parent points at a page that does not exist)
const pages = makePages(
	page('home', 'Home', '__root__'),
	page('a', 'A', 'home'),
	page('b', 'B', 'a'),
	page('c', 'C', 'b'),
	page('unfiled', 'Unfiled'),
	page('lost', 'Lost', 'gone')
)

describe('getAncestorIds', () => {
	it('lists ancestors outermost-first so expanding them in order reveals the page', () => {
		expect(getAncestorIds('c', pages)).toEqual({
			ancestorIds: ['home', 'a', 'b'],
			reachesRoot: true
		})
	})

	it('reports a root page as reachable with no ancestors', () => {
		expect(getAncestorIds('home', pages)).toEqual({ ancestorIds: [], reachesRoot: true })
	})

	it('reports unfiled and orphaned pages as unreachable from the tree', () => {
		expect(getAncestorIds('unfiled', pages).reachesRoot).toBe(false)
		expect(getAncestorIds('lost', pages).reachesRoot).toBe(false)
	})

	it('returns unreachable for an unknown page', () => {
		expect(getAncestorIds('nope', pages).reachesRoot).toBe(false)
	})

	it('terminates on a parent cycle instead of looping forever', () => {
		const cyclic = makePages(page('x', 'X', 'y'), page('y', 'Y', 'x'))
		expect(getAncestorIds('x', cyclic).reachesRoot).toBe(false)
	})
})

describe('isAncestor', () => {
	it('recognises indirect ancestry', () => {
		expect(isAncestor('c', 'home', pages)).toBe(true)
		expect(isAncestor('c', 'b', pages)).toBe(true)
	})

	it('rejects unrelated and reversed pairs', () => {
		expect(isAncestor('home', 'c', pages)).toBe(false)
		expect(isAncestor('unfiled', 'home', pages)).toBe(false)
	})

	it('terminates on a parent cycle', () => {
		const cyclic = makePages(page('x', 'X', 'y'), page('y', 'Y', 'x'))
		expect(isAncestor('x', 'home', cyclic)).toBe(false)
	})
})

describe('collectDescendants', () => {
	// deletePage batches exactly these ids: without the cascade the subtree keeps
	// a `pp` that no longer resolves and goes invisible everywhere but search.
	it('collects the whole subtree, not just direct children', () => {
		expect(collectDescendants('home', pages).sort()).toEqual(['a', 'b', 'c'])
		expect(collectDescendants('a', pages).sort()).toEqual(['b', 'c'])
	})

	it('returns nothing for a leaf', () => {
		expect(collectDescendants('c', pages)).toEqual([])
		expect(collectDescendants('unfiled', pages)).toEqual([])
	})

	it('never treats root pages as children of each other', () => {
		const roots = makePages(page('r1', 'R1', '__root__'), page('r2', 'R2', '__root__'))
		expect(collectDescendants('r1', roots)).toEqual([])
	})

	it('visits each page once when parents form a cycle', () => {
		const cyclic = makePages(page('x', 'X', 'y'), page('y', 'Y', 'x'))
		expect(collectDescendants('x', cyclic)).toEqual(['y'])
	})

	// The sidebar keeps this index for the tree render and hands it over, so the
	// delete path must not depend on building its own.
	it('gives the same answer with a supplied child index as without one', () => {
		const index = buildChildIndex(pages)
		for (const id of ['home', 'a', 'c', 'unfiled']) {
			expect(collectDescendants(id, pages, index)).toEqual(collectDescendants(id, pages))
		}
	})
})

describe('planMove', () => {
	// A rejected move keeps the tree a tree: `before`/`after` inherit the target's
	// parent, so a drop next to one's own descendant would make the page its own
	// ancestor — and a looped page is neither a root nor anyone's child, so it and
	// its whole subtree vanish from the sidebar.
	it('rejects a drop next to its own direct child', () => {
		expect(planMove('a', 'b', 'after', pages)).toBeNull()
		expect(planMove('a', 'b', 'before', pages)).toBeNull()
	})

	it('rejects a drop next to a deeper descendant', () => {
		expect(planMove('a', 'c', 'after', pages)).toBeNull()
		expect(planMove('home', 'c', 'before', pages)).toBeNull()
	})

	it('rejects a drop inside a descendant', () => {
		expect(planMove('a', 'b', 'inside', pages)).toBeNull()
		expect(planMove('a', 'c', 'inside', pages)).toBeNull()
	})

	it('rejects a self-drop and an unknown target', () => {
		expect(planMove('a', 'a', 'inside', pages)).toBeNull()
		expect(planMove('a', 'a', 'after', pages)).toBeNull()
		expect(planMove('a', 'nope', 'after', pages)).toBeNull()
	})

	it('reparents into an unrelated page, past its existing children', () => {
		// `b` is `a`'s only child and sits at order 0.
		expect(planMove('unfiled', 'a', 'inside', pages)).toEqual({ parentPageId: 'a', order: 1 })
	})

	it('sends a page dropped next to an unfiled one to root, never unfiled', () => {
		// `pp: null` would mean *unfiled* — dropping the page out of the sidebar.
		expect(planMove('c', 'unfiled', 'after', pages)?.parentPageId).toBe('__root__')
	})

	it('lands a sibling reorder strictly between its new neighbours', () => {
		const ordered = makePages(
			page('home', 'Home', '__root__'),
			{ ...page('s1', 'S1', 'home'), order: 10 },
			{ ...page('s2', 'S2', 'home'), order: 20 },
			{ ...page('s3', 'S3', 'home'), order: 30 }
		)
		const plan = planMove('s1', 's2', 'after', ordered)
		expect(plan?.parentPageId).toBe('home')
		expect(plan!.order).toBeGreaterThan(20)
		expect(plan!.order).toBeLessThan(30)
	})
})

// vim: ts=4

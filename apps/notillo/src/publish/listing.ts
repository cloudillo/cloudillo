// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * What one `index` block selects — the query half of a listing, as a pure function.
 *
 * **One definition of "what does `subtree` mean", used twice.** The publisher works
 * over `ResolvedPage`s and the live editor block over the `useAllPages` map; both
 * adapt to `ListingPage` and call `selectListing`, so the rows an author arranges are
 * the rows that publish. The rendering half is `render/listing.ts`.
 */

import type { SiteListingQuery, SiteListingSort } from '@cloudillo/core'
import { tSiteListingLayout, tSiteListingSort, tSiteListingSource } from '@cloudillo/core'
import * as T from '@symbion/runtype'

import { isTopLevel, ROOT_PARENT } from '../rtdb/types.js'

/**
 * A page, reduced to what a listing query needs — minimal so neither side's page type
 * leaks into the other's world.
 */
export interface ListingPage {
	pageId: string
	title: string
	/**
	 * Resolved parent, never the stored one. Publish passes `ancestry[last]`
	 * (`toListingPage` in `tree.ts`); the editor folds its stored `parentPageId`
	 * with `listingParentId` below. **Always set** — an absent parent drops the page
	 * out of every listing, which is not what an unfiled page means.
	 */
	parentId?: string
	order: number
	tags?: string[]
	/** ISO. Publish passes `listingDate(resolved)`; the editor has only `publishedAt`. */
	date?: string
	/** 0-based nesting under the query's root. Set by `selectListing` for `subtree`. */
	depth?: number
}

export { ROOT_PARENT } from '../rtdb/types.js'

/**
 * The bucket a page belongs in for listing purposes.
 *
 * **The editor's half of the adapter**, and the exact fold `childIndexOf` in `tree.ts`
 * applies: `selectListing` looks rows up by this key on both sides, and the home
 * page's children and the top-level pages are one bucket in the published tree. An
 * unfiled page lifts to the top level rather than being dropped.
 *
 * One case is left alone: a `parentPageId` naming a page that no longer exists keeps
 * that dead id, exactly as `childIndexOf` does. Publish lifts such an orphan in a
 * *later* pass, so the two do differ there — and equally in the sidebar, which is
 * what the author is looking at. The gate reports orphans by name
 * (`collectOrphaned`); a listing is not where that should be discovered.
 */
export function listingParentId(
	pageId: string,
	parentPageId: string | null | undefined,
	homePageId: string | undefined
): string {
	// The home page is the top level, not a page inside it.
	if (homePageId != null && pageId === homePageId) return ROOT_PARENT
	if (!parentPageId || isTopLevel(parentPageId, homePageId)) return homePageId ?? ROOT_PARENT
	return parentPageId
}

/**
 * A stored prop against a closed set, falling back to the default.
 *
 * Decoded rather than looked up, for the reason `siteArchetype` states: block props
 * are free-form stored values, so `'constructor'` reaching a bare index would answer
 * with a truthy member of `Object.prototype` and the fallback would never fire.
 */
function literalProp<A extends string>(validator: T.Type<A>, value: unknown, fallback: A): A {
	const decoded = T.decode(validator, value)
	return T.isOk(decoded) ? decoded.ok : fallback
}

/** A non-negative whole number, or 0 for anything else. `0` means "no cap". */
function countProp(value: unknown): number {
	const n = Number(value)
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function stringProp(value: unknown): string {
	return typeof value === 'string' ? value : ''
}

/**
 * The block's stored props, decoded and defaulted.
 *
 * **No value here may ever be the string `'default'`**: `cleanProps`
 * (`rtdb/transform.ts`) silently drops any prop whose value is that literal on
 * write, so such a prop would appear to save and then come back as its default.
 */
export function siteListingQuery(props: Record<string, unknown> | undefined): SiteListingQuery {
	const source = literalProp(tSiteListingSource, props?.source, 'children')
	const tag = stringProp(props?.tag)
	const root = stringProp(props?.root)
	const depth = countProp(props?.depth)
	const limit = countProp(props?.limit)
	return {
		source,
		...(tag && { tag }),
		...(root && { root }),
		...(depth && { depth }),
		sort: literalProp(tSiteListingSort, props?.sort, 'date-desc'),
		layout: literalProp(tSiteListingLayout, props?.layout, 'list'),
		...(limit && { limit }),
		...(props?.feed === true && { feed: true })
	}
}

/**
 * The order the sidebar shows siblings in: `order`, with the pageId breaking ties.
 *
 * The same rule `compareSiblings` (`tree.ts`) applies to a `PageWithId`, and it is
 * load-bearing for the same reason `compareBlocks` is: two pages sharing an `order`
 * must land in the same sequence on every republish, or an unchanged listing
 * re-renders into a different byte string.
 */
export function compareListingPages(a: ListingPage, b: ListingPage): number {
	return a.order - b.order || (a.pageId < b.pageId ? -1 : a.pageId > b.pageId ? 1 : 0)
}

/**
 * The index, memoized on the identity of the array it was built from.
 *
 * `selectListing` is called once per `index` block, and a site with a listing on
 * every page calls it once per page over the *same* array — rebuilding a full
 * parent→children index and re-sorting every bucket each time, which is exactly the
 * quadratic `buildContainer` builds `listingPages` once to avoid. Keyed on identity
 * rather than contents because both callers hold their array stable: the publisher
 * builds it once per container, the editor once per `pages` snapshot.
 *
 * A `WeakMap` so a stale array costs nothing once its owner is gone.
 */
const childIndexCache = new WeakMap<readonly ListingPage[], Map<string, ListingPage[]>>()

/** Children keyed by parent, each level in sidebar order. */
function childIndexOf(pages: readonly ListingPage[]): Map<string, ListingPage[]> {
	const cached = childIndexCache.get(pages)
	if (cached) return cached
	const index = new Map<string, ListingPage[]>()
	for (const page of pages) {
		if (!page.parentId) continue
		const siblings = index.get(page.parentId)
		if (siblings) siblings.push(page)
		else index.set(page.parentId, [page])
	}
	for (const siblings of index.values()) {
		siblings.sort(compareListingPages)
	}
	childIndexCache.set(pages, index)
	return index
}

/**
 * Every descendant of `root`, depth-first in tree order, annotated with its depth.
 * Cycle-guarded: no UI can build a `parentPageId` loop, but a concurrent re-parent of
 * two pages can leave one behind, and this would then recurse until the stack gives
 * out.
 */
function collectSubtree(
	root: string,
	index: Map<string, ListingPage[]>,
	maxDepth: number
): ListingPage[] {
	const out: ListingPage[] = []
	const seen = new Set<string>([root])

	function descend(parentId: string, depth: number): void {
		if (maxDepth && depth >= maxDepth) return
		for (const child of index.get(parentId) ?? []) {
			if (seen.has(child.pageId)) continue
			seen.add(child.pageId)
			out.push({ ...child, depth })
			descend(child.pageId, depth + 1)
		}
	}

	descend(root, 0)
	return out
}

/** The base order of a source, before `sort` has a say: the sidebar's own order. */
function inSidebarOrder(pages: readonly ListingPage[]): ListingPage[] {
	return [...pages].sort(compareListingPages)
}

function applySort(pages: ListingPage[], sort: SiteListingSort): ListingPage[] {
	if (sort === 'order') return pages
	return [...pages].sort((a, b) => {
		if (sort === 'title') {
			return a.title.localeCompare(b.title) || a.order - b.order
		}
		// The sidebar order breaks a date tie, mirroring `sortForListing`
		// (`publish/tree.ts`), so a listing is stable across republishes.
		const da = a.date ?? ''
		const db = b.date ?? ''
		if (da === db) return a.order - b.order
		return sort === 'date-desc' ? (da < db ? 1 : -1) : da < db ? -1 : 1
	})
}

/**
 * The rows one query selects, in display order, depth-annotated for `tree`.
 *
 * `self` is the page the block sits on, and is always excluded from its own listing.
 * A `subtree` source and the `tree` layout keep tree order whatever `sort` says: a
 * nested list sorted by date is a nesting that means nothing.
 */
export function selectListing(
	pages: readonly ListingPage[],
	query: SiteListingQuery,
	self: string | undefined
): ListingPage[] {
	const index = childIndexOf(pages)
	const root = query.root || self
	let selected: ListingPage[]

	switch (query.source) {
		case 'subtree':
			selected = root ? collectSubtree(root, index, query.depth ?? 0) : []
			break
		case 'siblings': {
			const parentId = pages.find((p) => p.pageId === self)?.parentId
			selected = parentId ? [...(index.get(parentId) ?? [])] : []
			break
		}
		case 'tag': {
			// `root` is meaningless for a tag roll-up: the tag *is* the selection.
			const tag = query.tag
			selected = tag ? inSidebarOrder(pages.filter((p) => p.tags?.includes(tag))) : []
			break
		}
		case 'all':
			selected = inSidebarOrder(pages)
			break
		default:
			selected = root ? [...(index.get(root) ?? [])] : []
	}

	selected = selected.filter((p) => p.pageId !== self)
	// Tree order is the whole point of both, so `sort` does not get to reshuffle it.
	if (query.source !== 'subtree' && query.layout !== 'tree') {
		selected = applySort(selected, query.sort)
	}
	return query.limit ? selected.slice(0, query.limit) : selected
}

// vim: ts=4

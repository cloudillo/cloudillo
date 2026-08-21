// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The page tree, resolved into everything the container needs to know about
 * where its pages live: paths, archetypes, draft state, navigation.
 *
 * Kept apart from the RTDB read and the zip so it is a pure function of the page
 * map — the one part of publishing that is worth reasoning about on its own.
 */

import type { SiteManifest, SiteManifestPage, SiteNavEntry } from '@cloudillo/core'

import { isTopLevel, type PageRecord, ROOT_PARENT } from '../rtdb/types.js'
import type { ListingPage } from './listing.js'
import { DEFAULT_ARCHETYPE } from './render/index.js'
import { uniqueSlug } from './slug.js'

export type PageWithId = PageRecord & { id: string }

/** One page resolved against the tree it sits in. */
export interface ResolvedPage {
	pageId: string
	page: PageWithId
	/** Container-relative, no leading slash and no extension: `blog/hello`. */
	path: string
	archetype: string
	/** pageIds from the top of the tree down to the parent, nearest last. */
	ancestry: string[]
	/** This page's own flag. Drafts are resolved like any other page, then left out. */
	draft: boolean
	/**
	 * Kept out of the container: this page is a draft, or one of its ancestors is.
	 *
	 * A draft suppresses its whole subtree. `/blog/hello` could technically be
	 * published without `/blog`, but nav and breadcrumbs would point at a 404, and a
	 * reader arriving at the child has no way back up.
	 */
	suppressed: boolean
}

export interface ResolveTreeOptions {
	/**
	 * The page served at the mount root. Absent, or naming a page that no longer
	 * exists, means the container has no root entry.
	 */
	homePageId?: string
}

export interface ResolvedTree {
	/** Published pages only, in tree order. Drafts and their subtrees are absent. */
	pages: ResolvedPage[]
	/** Every page including suppressed ones, by pageId — what `resolvePageHref` consults. */
	byId: Map<string, ResolvedPage>
	/**
	 * pageIds the walk down from the root never reached, and which were lifted to
	 * the top level instead — see `resolveTree`. Their descendants are not listed:
	 * once the head of the subtree has a place, so do they.
	 */
	orphaned: string[]
}

/** The order the sidebar shows siblings in: `o`, with the pageId as a tie-break. */
function compareSiblings(a: PageWithId, b: PageWithId): number {
	return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function sortSiblings(pages: PageWithId[]): PageWithId[] {
	return [...pages].sort(compareSiblings)
}

/**
 * A page whose address is already live and must not move: it has been published at
 * least once and stores the slug it went out under. `freezePublishedPages` writes
 * that slug back after the first publish precisely so this is knowable here.
 */
function isFrozen(page: PageWithId): boolean {
	return page.publishedAt !== undefined && page.slug != null
}

/**
 * Every page bucketed under its parent, each bucket in the order the sidebar shows
 * it. Built once per resolve: the walk visits every node, and re-filtering the whole
 * page array at each one made a large document quadratic in its page count.
 *
 * A page with no `parentPageId` is unfiled, not lost: it buckets as top-level so
 * publishing can never silently drop content. Truthiness and not `=== undefined`,
 * because `removeFromSidebar` unfiles by writing `pp: null`.
 *
 * The home page's own children fold into the top level here, while the buckets are
 * built, which is what keeps them in **one** `taken` slug set with one frozen-slug
 * claim pass. Walking them separately would let two pages claim one container entry.
 */
function childIndexOf(pages: PageWithId[], homePageId?: string): Map<string, PageWithId[]> {
	const index = new Map<string, PageWithId[]>()
	for (const page of pages) {
		const stored = page.parentPageId
		const parentId = stored && !isTopLevel(stored, homePageId) ? stored : ROOT_PARENT
		const siblings = index.get(parentId)
		if (siblings) siblings.push(page)
		else index.set(parentId, [page])
	}
	for (const siblings of index.values()) {
		siblings.sort(compareSiblings)
	}
	return index
}

/**
 * Walk the tree from the top, assigning each page a path and an archetype.
 *
 * A draft keeps its path and still hands its slug to its children: recomputing paths
 * around a drafted parent would move every descendant's URL on draft and back on
 * publish. What a draft takes with it is its *content* — the subtree is suppressed,
 * since a child under a missing parent breaks nav and breadcrumbs both.
 *
 * The archetype falls back to the parent's `childKind` and never to the parent's own
 * archetype: a child of a post is a note, not another post in the series. An explicit
 * `kind` always wins; the top of the tree falls back to `page`.
 *
 * A page the walk never reaches — broken `parentPageId`, or a cycle — is lifted to
 * the top level in a second pass and recorded in `orphaned`, so the container keeps
 * the content and the report can still name it.
 *
 * The **home page** is the parent of the top-level pages and publishes at the mount
 * root with no path segment, so setting or clearing it moves no other page's URL.
 */
export function resolveTree(
	allPages: Map<string, PageWithId>,
	opts?: ResolveTreeOptions
): ResolvedTree {
	const homePageId = opts?.homePageId
	const pages = [...allPages.values()]
	const childIndex = childIndexOf(pages, homePageId)
	const byId = new Map<string, ResolvedPage>()
	const published: ResolvedPage[] = []
	const orphaned: string[] = []
	// Guards against a `parentPageId` cycle, which no UI can create but a
	// concurrent re-parent of two pages can leave behind: without this the walk
	// below never terminates.
	const visited = new Set<string>()
	// Sibling slugs per parent, so the orphan pass below dedups its slugs against
	// the top-level pages the first pass already placed.
	const takenByParent = new Map<string, Set<string>>()

	function takenFor(parentId: string): Set<string> {
		const taken = takenByParent.get(parentId) ?? new Set<string>()
		takenByParent.set(parentId, taken)
		return taken
	}

	function place(
		page: PageWithId,
		prefix: string,
		ancestry: string[],
		archetype: string,
		hidden: boolean,
		taken: Set<string>,
		claimed?: string
	): void {
		visited.add(page.id)

		const slug = claimed ?? uniqueSlug(page.id, page.title, page.slug, taken, prefix === '')
		const draft = page.draft === true
		const resolved: ResolvedPage = {
			pageId: page.id,
			page,
			path: prefix ? `${prefix}/${slug}` : slug,
			archetype: page.kind || archetype,
			ancestry,
			draft,
			suppressed: draft || hidden
		}
		byId.set(page.id, resolved)
		if (!resolved.suppressed) published.push(resolved)

		walk(
			page.id,
			resolved.path,
			[...ancestry, page.id],
			// The parent's own declaration, not a table lookup off its archetype: an
			// archetype frames a page and says nothing about its children.
			page.childKind || DEFAULT_ARCHETYPE,
			resolved.suppressed
		)
	}

	function walk(
		parentId: string,
		prefix: string,
		ancestry: string[],
		archetype: string,
		hidden: boolean
	): void {
		const taken = takenFor(parentId)
		const siblings = childIndex.get(parentId) ?? []

		// Frozen addresses claim first, whatever the sidebar order says: a live page
		// keeps its URL and the new sibling gets the `-2`. Without this, dragging a
		// new "Hello" above a published one moved the published page off `/hello`
		// permanently — its slug is fixed, so nothing writes it back.
		//
		// Only the *claiming* is reordered; the placing loop below still visits in
		// sibling order, which is what `published[]`, the nav and listings read.
		const claimed = new Map<string, string>()
		for (const page of siblings) {
			if (visited.has(page.id) || !isFrozen(page)) continue
			claimed.set(page.id, uniqueSlug(page.id, page.title, page.slug, taken, prefix === ''))
		}

		for (const page of siblings) {
			if (visited.has(page.id)) continue
			place(page, prefix, ancestry, archetype, hidden, taken, claimed.get(page.id))
		}
	}

	// The home page is placed here rather than through `place()`, which would derive
	// a slug for it and then recurse into its own child bucket — both wrong: it has
	// no address of its own, and its children are the top-level pages the walk below
	// is about to visit anyway.
	const home = homePageId ? allPages.get(homePageId) : undefined
	let homeAncestry: string[] = []
	let rootArchetype: string = DEFAULT_ARCHETYPE

	if (home) {
		visited.add(home.id)
		const draft = home.draft === true
		const resolved: ResolvedPage = {
			pageId: home.id,
			page: home,
			// The mount root has no path segment of its own. `siteEntryPath('')`
			// spells it `index`, which is what `sitePageEntry` turns into the
			// container's `index.part.html`.
			path: '',
			archetype: home.kind || DEFAULT_ARCHETYPE,
			ancestry: [],
			draft,
			suppressed: draft
		}
		byId.set(home.id, resolved)
		if (!resolved.suppressed) published.push(resolved)
		homeAncestry = [home.id]
		rootArchetype = home.childKind || DEFAULT_ARCHETYPE
	}

	// `false`, never `resolved.suppressed`: a drafted home page must not take the
	// whole site down with it. The publish gate blocks that case by name instead
	// (`homeDraft`), which is a finding the author can act on rather than a site
	// that silently emptied.
	walk(ROOT_PARENT, '', homeAncestry, rootArchetype, false)

	// Whatever the walk did not reach. Placed head-first — heads before their
	// descendants, in sibling order — so an orphan subtree keeps its shape; each
	// `place` walks its own children, hence the `visited` re-check. Same two passes as
	// `walk`, over the same top-level `taken` set — a frozen orphan still loses to a
	// frozen page that claimed the name first, which `collectBadSlugs` reports.
	const orphans = sortSiblings(pages.filter((p) => !visited.has(p.id)))
	const claimedOrphans = new Map<string, string>()
	for (const page of orphans) {
		// Only the *heads* claim: an orphan whose parent is still a page in the map
		// is reached by that parent's own `walk` below, against a different `taken`
		// set. Claiming for it here would burn a top-level slug it never uses.
		if (!isFrozen(page) || (page.parentPageId && allPages.has(page.parentPageId))) continue
		// `true`: an orphan is lifted to the top level, so it is at the container root.
		claimedOrphans.set(
			page.id,
			uniqueSlug(page.id, page.title, page.slug, takenFor(ROOT_PARENT), true)
		)
	}

	// Heads first, then whatever they reached, to a fixed point: `sortSiblings` knows
	// nothing about ancestry, so lifting in sort order alone flattens a subtree whose
	// child happens to carry the lower `order`. Lifted pages get the top level's
	// ancestry and archetype fallback — with a home page that is the home page and its
	// `childKind`, exactly what a page the author filed there would get.
	let progress = true
	while (progress) {
		progress = false
		for (const page of orphans) {
			if (visited.has(page.id)) continue
			const parent = page.parentPageId
			// Not a head yet: its parent is still an unplaced orphan, and that parent's
			// own `place` is what gives this page its path.
			if (parent && allPages.has(parent) && !visited.has(parent)) continue
			orphaned.push(page.id)
			place(
				page,
				'',
				homeAncestry,
				rootArchetype,
				false,
				takenFor(ROOT_PARENT),
				claimedOrphans.get(page.id)
			)
			progress = true
		}
	}

	// A cycle has no head — every member's parent is another member — so nothing above
	// can reach it. Break it at the first page in sibling order; `place` recurses, so
	// one lift takes the rest of the ring with it.
	for (const page of orphans) {
		if (visited.has(page.id)) continue
		orphaned.push(page.id)
		place(
			page,
			'',
			homeAncestry,
			rootArchetype,
			false,
			takenFor(ROOT_PARENT),
			claimedOrphans.get(page.id)
		)
	}

	return { pages: published, byId, orphaned }
}

/**
 * The date a listing sorts and displays a page by: first publish, never creation.
 *
 * You create a page, write for a week, then publish — creation time would date the
 * post to the blank page. `ua` and `ca` are fallbacks for a page that
 * predates `pubAt` being written at all, so a listing is never sorted by nothing.
 */
export function listingDate(page: ResolvedPage): string {
	return page.page.publishedAt ?? page.page.updatedAt ?? page.page.createdAt ?? ''
}

/** Newest first, with the sidebar order as the tie-break so the result is stable. */
export function sortForListing(pages: ResolvedPage[]): ResolvedPage[] {
	return [...pages].sort((a, b) => {
		const da = listingDate(a)
		const db = listingDate(b)
		if (da !== db) return da < db ? 1 : -1
		return a.page.order - b.page.order
	})
}

/**
 * One resolved page as `selectListing`'s input — the publisher's half of the
 * adapter that lets one selector serve both publish and the live editor block.
 *
 * `parentId` is the **resolved** parent, not the stored `parentPageId`. The two
 * differ only where the tree had to invent a parent — top-level pages under a home
 * page, and lifted orphans — and both belong under the page they publish under. A
 * page with no resolved parent keeps `ROOT_PARENT`, which the sidebar and the
 * editor's adapter call that level too, so `siblings` means the same on both sides.
 */
export function toListingPage(resolved: ResolvedPage): ListingPage {
	const date = listingDate(resolved)
	return {
		pageId: resolved.pageId,
		title: resolved.page.title,
		parentId: resolved.ancestry[resolved.ancestry.length - 1] ?? ROOT_PARENT,
		order: resolved.page.order,
		...(resolved.page.tags?.length && { tags: resolved.page.tags }),
		...(date && { date })
	}
}

/**
 * The navigation: published **top-level** pages that do not opt out with `noNav`.
 *
 * Flat by design: nav is top-level links plus breadcrumbs, and a breadcrumb comes
 * from the page's own `ancestry`, which `buildManifest` already records.
 *
 * A `noNav` page and a lifted orphan are out — reachable by URL, but never something
 * the author chose to put in the bar. The home page leads the list, at the empty path
 * that only it has.
 */
function buildNav(
	tree: ResolvedTree,
	allPages: Map<string, PageWithId>,
	homePageId?: string
): SiteNavEntry[] {
	const entries: SiteNavEntry[] = []
	// The front page leads the bar whatever its `order` puts it at among the top-level
	// pages: `/` is where the site starts. `noNav` and draft suppression still apply.
	const home = homePageId ? tree.byId.get(homePageId) : undefined
	if (home && !home.suppressed && home.page.noNav !== true) {
		entries.push({ path: home.path, title: home.page.title })
	}
	// The same fold `resolveTree` walks against, so "top level" means one thing.
	const topLevel = childIndexOf([...allPages.values()], homePageId).get(ROOT_PARENT) ?? []
	for (const page of topLevel) {
		const resolved = tree.byId.get(page.id)
		if (!resolved || resolved.suppressed || page.noNav === true) continue
		if (resolved.path === '') continue
		entries.push({ path: resolved.path, title: page.title })
	}
	return entries
}

/**
 * `_site/manifest.json`: metadata only, no page text. The fragments are the one
 * copy of the content, and search indexing extracts indexable text from them.
 *
 * No redirect table. Redirecting a page's old path after a slug change was dropped
 * from the design by decision (2026-08-16): it needs the previous published path of
 * every page, which nothing records, and the machinery to record it costs more than
 * the feature.
 */
export function buildManifest(
	tree: ResolvedTree,
	allPages: Map<string, PageWithId>,
	mountPath: string,
	homePageId?: string
): SiteManifest {
	const pages: Record<string, SiteManifestPage> = {}
	for (const resolved of tree.pages) {
		const { page } = resolved
		pages[resolved.pageId] = {
			path: resolved.path,
			title: page.title,
			archetype: resolved.archetype,
			...(page.tags?.length && { tags: page.tags }),
			...(resolved.ancestry.length > 0 && { ancestry: resolved.ancestry })
		}
	}

	// The home page is in `pages` like any other, at `path: ''`. That is what lets
	// `siteManifestPage` match the front page at all: `siteHref` composes
	// `mountPath` and `path`, which for `('/', '')` is `'/'` — so `/` gains the
	// breadcrumb and the owner's "Edit this page" link that it never had.
	return {
		version: 1,
		mountPath,
		pages,
		nav: buildNav(tree, allPages, homePageId)
	}
}

// vim: ts=4

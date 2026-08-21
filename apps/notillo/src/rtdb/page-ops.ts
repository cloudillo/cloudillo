// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { QuerySnapshot, RtdbClient } from '@cloudillo/rtdb'
import * as T from '@symbion/runtype'

import { shortId } from './ids.js'
import { toStoredPage } from './transform.js'
import type { PageRecord, StoredPageRecord } from './types.js'
import { ROOT_PARENT } from './types.js'

/** The one field the delete cascade re-checks. See `deletePage` below. */
const tBlockOwner = T.struct({ p: T.string })

type PageMap = Map<string, PageRecord & { id: string }>

export async function createPage(
	client: RtdbClient,
	userId: string,
	title: string,
	parentPageId?: string,
	/**
	 * Archetype for the new page, from the parent's `childKind` — `childKindFor` in
	 * `utils/archetype.ts` works it out. Left absent for the `page` default, which is
	 * what an absent `kind` already means.
	 */
	kind?: string
): Promise<string> {
	const id = shortId()
	const now = new Date().toISOString()

	await client
		.collection('p')
		.doc(id)
		.set(
			toStoredPage({
				title,
				...(parentPageId !== undefined && { parentPageId }),
				...(kind !== undefined && { kind }),
				order: Date.now(),
				createdAt: now,
				updatedAt: now,
				createdBy: userId
			})
		)

	return id
}

/**
 * Application field name -> stored key, for every field a patch may carry.
 *
 * The **one** list. `PageUpdate` below is derived from it and `PATCH_FIELDS` in
 * `hooks/usePageProperties.ts` is driven off its keys, so a tenth site field is added
 * here and nowhere else. The value type is `keyof StoredPageRecord`, which is what
 * makes a stored key that no longer exists a compile error rather than a write into
 * a field nothing reads.
 *
 * `publishedAt`/`pubAt` is deliberately absent: the publisher owns it.
 */
const UPDATE_KEYS = {
	title: 'ti',
	icon: 'ic',
	slug: 'slug',
	draft: 'draft',
	kind: 'kind',
	childKind: 'childKind',
	author: 'author',
	desc: 'desc',
	image: 'image',
	noNav: 'noNav'
} as const satisfies Record<string, keyof StoredPageRecord>

/** Every field a patch may name, in application spelling. */
export type PageUpdateField = keyof typeof UPDATE_KEYS

/**
 * A page patch in application spelling. `null` clears the stored field — the same
 * convention `removeFromSidebar` uses for `pp` — which is how a site field goes
 * back to its derived or inherited default.
 *
 * Each field's type comes from `PageRecord`, so the two cannot drift: widening
 * `slug` in the record widens it here, and dropping a field from `UPDATE_KEYS`
 * drops it here.
 */
export type PageUpdate = Partial<Pick<PageRecord, PageUpdateField>>

/** The patchable fields, for anyone that has to walk a patch rather than write one. */
export function pageUpdateFields(): PageUpdateField[] {
	return Object.keys(UPDATE_KEYS) as PageUpdateField[]
}

export async function updatePage(
	client: RtdbClient,
	pageId: string,
	updates: PageUpdate
): Promise<void> {
	const stored: Record<string, unknown> = {}
	for (const field of pageUpdateFields()) {
		const value = updates[field]
		if (value !== undefined) stored[UPDATE_KEYS[field]] = value
	}
	stored.ua = new Date().toISOString()

	await client.ref(`p/${pageId}`).update(stored)
}

/** Check if `ancestorId` is an ancestor of `pageId` (prevents circular reparenting) */
export function isAncestor(pageId: string, ancestorId: string, pages: PageMap): boolean {
	let current = pages.get(pageId)
	const seen = new Set<string>([pageId])
	while (current?.parentPageId) {
		if (current.parentPageId === ancestorId) return true
		if (seen.has(current.parentPageId)) return false // cycle guard
		seen.add(current.parentPageId)
		current = pages.get(current.parentPageId)
	}
	return false
}

/**
 * Walk a page's ancestry. `ancestorIds` runs outermost-first, so expanding them
 * in order reveals the page. `reachesRoot` is false when the chain stops at an
 * unfiled page (no `pp`) or at a `pp` pointing to a page that no longer exists —
 * in both cases the page has no place in the sidebar tree.
 */
export function getAncestorIds(
	pageId: string,
	pages: PageMap
): { ancestorIds: string[]; reachesRoot: boolean } {
	const ancestorIds: string[] = []
	const start = pages.get(pageId)
	if (!start) return { ancestorIds, reachesRoot: false }

	let current: PageRecord & { id: string } = start
	const seen = new Set<string>([pageId])
	while (current.parentPageId && current.parentPageId !== ROOT_PARENT) {
		const parentId: string = current.parentPageId
		const parent = seen.has(parentId) ? undefined : pages.get(parentId)
		if (!parent) return { ancestorIds, reachesRoot: false }
		seen.add(parentId)
		ancestorIds.unshift(parentId)
		current = parent
	}
	return { ancestorIds, reachesRoot: current.parentPageId === ROOT_PARENT }
}

/**
 * Group page ids by their parent; root and unfiled pages are skipped. Callers
 * that already keep such an index (the sidebar builds one for the tree) can hand
 * it to `collectDescendants` and `deletePage` instead of having them rebuild it.
 */
export function buildChildIndex(pages: PageMap): Map<string, string[]> {
	const childrenOf = new Map<string, string[]>()
	for (const page of pages.values()) {
		if (!page.parentPageId || page.parentPageId === ROOT_PARENT) continue
		const siblings = childrenOf.get(page.parentPageId)
		if (siblings) siblings.push(page.id)
		else childrenOf.set(page.parentPageId, [page.id])
	}
	return childrenOf
}

/** All descendants of `pageId`, breadth-first. Excludes `pageId` itself. */
export function collectDescendants(
	pageId: string,
	pages: PageMap,
	childIndex: Map<string, string[]> = buildChildIndex(pages)
): string[] {
	const descendants: string[] = []
	const seen = new Set<string>([pageId])
	const queue = [pageId]
	while (queue.length) {
		for (const childId of childIndex.get(queue.shift()!) ?? []) {
			if (seen.has(childId)) continue // cycle guard
			seen.add(childId)
			descendants.push(childId)
			queue.push(childId)
		}
	}
	return descendants
}

export interface MovePlan {
	parentPageId: string
	order: number
}

/**
 * Where `pageId` would land, or null when the move is not allowed. Null rather
 * than a throw so the sidebar can use the same call to decide whether to paint a
 * drop indicator at all.
 *
 * The rejections keep the tree a tree: `before`/`after` inherit the target's
 * parent, so dropping a page next to its own child would make the page its own
 * ancestor — a loop that takes the page and its whole subtree out of the sidebar,
 * since a looped page is neither a root nor anyone's child.
 */
export function planMove(
	pageId: string,
	targetId: string,
	position: 'before' | 'after' | 'inside',
	pages: PageMap
): MovePlan | null {
	if (targetId === pageId) return null
	const target = pages.get(targetId)
	if (!target) return null

	// `null` as well as `undefined`: an unfiled drop target carries `pp: null`, and
	// the `?? ROOT_PARENT` below is what turns either of them into a landing spot.
	let newParentPageId: string | null | undefined
	let newOrder: number

	if (position === 'inside') {
		// Reparent: becomes child of target
		newParentPageId = targetId
		// Place at end of target's children
		let maxOrder = 0
		for (const p of pages.values()) {
			if (p.parentPageId === targetId && p.order > maxOrder) {
				maxOrder = p.order
			}
		}
		newOrder = maxOrder + 1
	} else {
		// Reorder: same parent as target
		newParentPageId = target.parentPageId

		// Get siblings sorted by order
		const siblings = Array.from(pages.values())
			.filter((p) => p.parentPageId === newParentPageId && p.id !== pageId)
			.sort((a, b) => a.order - b.order)

		const targetIdx = siblings.findIndex((p) => p.id === targetId)

		if (position === 'before') {
			const prevOrder = targetIdx > 0 ? siblings[targetIdx - 1].order : undefined
			const targetOrder = target.order
			if (prevOrder !== undefined) {
				newOrder = (prevOrder + targetOrder) / 2
			} else {
				newOrder = targetOrder - 1
			}
		} else {
			// 'after'
			const targetOrder = target.order
			const nextOrder =
				targetIdx < siblings.length - 1 ? siblings[targetIdx + 1].order : undefined
			if (nextOrder !== undefined) {
				newOrder = (targetOrder + nextOrder) / 2
			} else {
				newOrder = targetOrder + 1
			}
		}
	}

	// The drop target may itself be unfiled, in which case root level is the only
	// sensible landing spot: `pp: null` would mean *unfiled*, silently dropping the
	// page out of the sidebar. Clearing `pp` is `removeFromSidebar`'s job.
	const parentPageId = newParentPageId ?? ROOT_PARENT

	if (parentPageId === pageId) return null
	if (parentPageId !== ROOT_PARENT && isAncestor(parentPageId, pageId, pages)) return null

	return { parentPageId, order: newOrder }
}

export async function movePage(
	client: RtdbClient,
	pageId: string,
	targetId: string,
	position: 'before' | 'after' | 'inside',
	pages: PageMap
): Promise<void> {
	const plan = planMove(pageId, targetId, position, pages)
	if (!plan) return

	await client.ref(`p/${pageId}`).update({
		pp: plan.parentPageId,
		o: plan.order,
		ua: new Date().toISOString()
	})
}

// A deep subtree is an expected case, so nothing here may grow with it: blocks are
// looked up one page at a time with only a few lookups in flight ahead of the
// commit cursor, and deletes go out in fixed-size batches. Memory is
// O(prefetch × blocks-per-page), not O(subtree). The per-page lookup is `p == id`,
// which the `('b', 'p')` index answers directly.
const DELETE_BATCH_SIZE = 200
const DELETE_PREFETCH = 4

export interface DeletePageOptions {
	childIndex?: Map<string, string[]>
	/** Called after each page's documents are committed. */
	onProgress?: (done: number, total: number) => void
	signal?: AbortSignal
}

/**
 * Delete a page together with its whole subtree. Without the cascade the children
 * keep pointing at a `pp` that no longer resolves, leaving them invisible in the
 * sidebar but still present in the collection.
 *
 * Work is committed page by page, deepest first, each page's blocks immediately
 * before the page document itself. An interrupted run therefore leaves every page
 * it has not reached fully intact and re-running finishes the job, rather than a
 * whole subtree emptied of its content but still standing.
 */
export async function deletePage(
	client: RtdbClient,
	pageId: string,
	pages: PageMap,
	options: DeletePageOptions = {}
): Promise<void> {
	const childIndex = options.childIndex ?? buildChildIndex(pages)
	// `collectDescendants` is breadth-first, so reversing it puts the deepest pages
	// first and `pageId` — the only one still reachable from the sidebar — last.
	const pageIds = [...collectDescendants(pageId, pages, childIndex).reverse(), pageId]

	// Lookups run ahead of the commit cursor so round trips overlap with commits,
	// never holding more than DELETE_PREFETCH pages' worth.
	const queries: Array<Promise<QuerySnapshot> | undefined> = new Array(pageIds.length)
	function startQuery(index: number) {
		if (index >= pageIds.length || queries[index]) return
		const query = client.collection('b').where('p', '==', pageIds[index]).get()
		// A prefetched lookup is never awaited once the run aborts or a commit
		// fails, so keep its rejection from surfacing as an unhandled one.
		query.catch(() => {})
		queries[index] = query
	}
	for (let i = 0; i < DELETE_PREFETCH; i++) startQuery(i)

	for (let index = 0; index < pageIds.length; index++) {
		options.signal?.throwIfAborted()

		const id = pageIds[index]
		startQuery(index)
		const snapshot = await queries[index]!
		queries[index] = undefined
		startQuery(index + DELETE_PREFETCH)

		// Re-check the block's own `p`: a backend that dropped the filter and
		// handed back the whole collection would otherwise turn a subtree delete
		// into a delete of every block in the document.
		const refs: string[] = []
		snapshot.forEach((doc) => {
			// Only `p` is decoded: this is a filter check, and a block whose *other*
			// fields this build cannot read still belongs to the page being deleted.
			const owner = T.decode(tBlockOwner, doc.data(), { unknownFields: 'drop' })
			if (!T.isOk(owner) || owner.ok.p !== id) return
			refs.push(`b/${doc.id}`)
		})
		// The page document goes last, so the only place a batch boundary can fall
		// inside a page is a page with more than DELETE_BATCH_SIZE blocks — which
		// the next delete on the same page simply finishes.
		refs.push(`p/${id}`)

		for (let i = 0; i < refs.length; i += DELETE_BATCH_SIZE) {
			options.signal?.throwIfAborted()
			const batch = client.batch()
			for (const path of refs.slice(i, i + DELETE_BATCH_SIZE)) {
				batch.delete(client.ref(path))
			}
			await batch.commit()
		}

		options.onProgress?.(index + 1, pageIds.length)
	}
}

/** Pages per reparenting batch, matching `deletePage`'s bound. */
const REPARENT_BATCH_SIZE = 200

/**
 * Make one page the document's home page.
 *
 * Reparents the page's direct children to the root first: the home page is the
 * parent of the top-level pages, so its children and they are the same set, and
 * leaving them at `pp: <homeId>` would put two storage locations behind one URL
 * namespace. Batched like `deletePage` — a page with hundreds of children must not
 * become one unbounded commit.
 *
 * Clearing home does not put them back, and does not come through here: the page
 * becomes an ordinary top-level page and its former children stay top-level.
 *
 * Only the reparenting happens here. Which page is home is a document-level fact
 * stored at `d/site` (`useDocSettings`), so the caller writes that.
 */
export async function setHomePage(
	client: RtdbClient,
	pages: PageMap,
	pageId: string
): Promise<void> {
	const childIds = buildChildIndex(pages).get(pageId) ?? []
	if (childIds.length === 0) return

	const now = new Date().toISOString()
	for (let i = 0; i < childIds.length; i += REPARENT_BATCH_SIZE) {
		const batch = client.batch()
		for (const childId of childIds.slice(i, i + REPARENT_BATCH_SIZE)) {
			batch.update(client.ref(`p/${childId}`), { pp: ROOT_PARENT, ua: now })
		}
		await batch.commit()
	}
}

/** Give an unfiled page a place in the sidebar, at root level. */
export async function pinToSidebar(client: RtdbClient, pageId: string): Promise<void> {
	await client.ref(`p/${pageId}`).update({
		pp: ROOT_PARENT,
		o: Date.now(),
		ua: new Date().toISOString()
	})
}

/** Make a page unfiled again — it stays reachable through links and search. */
export async function removeFromSidebar(client: RtdbClient, pageId: string): Promise<void> {
	await client.ref(`p/${pageId}`).update({
		pp: null,
		ua: new Date().toISOString()
	})
}

// vim: ts=4

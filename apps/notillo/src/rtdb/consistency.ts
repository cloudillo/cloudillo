// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { RtdbClient } from '@cloudillo/rtdb'

import type { StoredPageRecord } from './types.js'
import { decodeStoredPage, ROOT_PARENT } from './types.js'

export interface ConsistencyResult {
	totalPages: number
	rootPages: number
	/** Pages with no `pp` — deliberately unfiled, reported but never "repaired". */
	unfiledPages: string[]
	/** Pages whose `pp` points at a page that no longer exists — real corruption. */
	danglingPages: string[]
	/**
	 * Pages whose `pp` chain loops back on itself — unreachable from the sidebar.
	 * Includes pages that merely hang off such a loop: they are just as invisible.
	 */
	cyclicPages: string[]
	/**
	 * One page per distinct loop — the member `fixConsistency` re-roots to break it.
	 * Re-rooting every member would flatten a subtree that is otherwise intact.
	 */
	cycleBreakPages: string[]
	needsFix: boolean
}

/** Classify every page in one pass. Pure, so the cycle cases are testable offline. */
export function analyzePages(allPages: Map<string, StoredPageRecord>): ConsistencyResult {
	const unfiledPages: string[] = []
	const danglingPages: string[] = []
	let rootPages = 0

	for (const [id, page] of allPages) {
		if (page.pp === ROOT_PARENT) {
			rootPages++
		} else if (!page.pp) {
			// Unfiled is created on purpose (@-mention pages): informational, not
			// an error to be fixed.
			unfiledPages.push(id)
		} else if (!allPages.has(page.pp)) {
			danglingPages.push(id)
		}
	}

	// Cycle detection: each parent chain is walked once, and ids already proven to
	// terminate (or to feed into a loop) short-circuit the walk, keeping the whole
	// pass O(n) however deep the tree is.
	const verdict = new Map<string, 'terminates' | 'cyclic'>()
	const cyclicPages: string[] = []
	const cycleBreakPages: string[] = []

	for (const startId of allPages.keys()) {
		if (verdict.has(startId)) continue

		const path: string[] = []
		const onPath = new Set<string>()
		let current: string | undefined = startId

		while (current !== undefined) {
			if (onPath.has(current)) {
				// The loop itself runs from `current` to the end of the path;
				// anything before it hangs off the loop and is equally unreachable.
				cycleBreakPages.push(current)
				for (const id of path) {
					verdict.set(id, 'cyclic')
					cyclicPages.push(id)
				}
				break
			}

			const known = verdict.get(current)
			if (known) {
				for (const id of path) {
					verdict.set(id, known)
					if (known === 'cyclic') cyclicPages.push(id)
				}
				break
			}

			const page = allPages.get(current)
			// The chain ends: at the root marker, at an unfiled page, or at a `pp`
			// that no longer resolves. All three are reported elsewhere; none loops.
			if (!page?.pp || page.pp === ROOT_PARENT || !allPages.has(page.pp)) {
				if (page) verdict.set(current, 'terminates')
				for (const id of path) verdict.set(id, 'terminates')
				break
			}

			path.push(current)
			onPath.add(current)
			current = page.pp
		}
	}

	return {
		totalPages: allPages.size,
		rootPages,
		unfiledPages,
		danglingPages,
		cyclicPages,
		cycleBreakPages,
		needsFix: danglingPages.length > 0 || cyclicPages.length > 0
	}
}

export async function checkConsistency(client: RtdbClient): Promise<ConsistencyResult> {
	const snapshot = await client.collection('p').get()

	const allPages = new Map<string, StoredPageRecord>()
	snapshot.forEach((doc) => {
		// A page this build cannot read is left out of the analysis rather than
		// reported as a dangling parent it may well not be.
		const stored = decodeStoredPage(doc.data(), doc.id)
		if (stored) allPages.set(doc.id, stored)
	})

	return analyzePages(allPages)
}

// Nothing here may grow with the damage: this repair exists for mass-corrupted
// parent links (an interrupted subtree delete leaving hundreds of dangling
// children), which is exactly when one unbounded commit is most likely to be
// refused. Sibling constant: DELETE_BATCH_SIZE in page-ops.ts.
const FIX_BATCH_SIZE = 200

/**
 * Reattach pages orphaned by a missing parent, and break each parent loop by
 * re-rooting one of its members. Unfiled pages are left alone.
 *
 * A run interrupted between batches is safe: every repair is the same idempotent
 * `pp = '__root__'` update, so re-running the check finishes the job.
 */
export async function fixConsistency(client: RtdbClient, result: ConsistencyResult): Promise<void> {
	const repairs = [...result.danglingPages, ...result.cycleBreakPages]
	if (!repairs.length) return

	// One timestamp for the whole run: the repairs are a single operation.
	const now = new Date().toISOString()
	for (let i = 0; i < repairs.length; i += FIX_BATCH_SIZE) {
		const batch = client.batch()
		for (const id of repairs.slice(i, i + FIX_BATCH_SIZE)) {
			batch.update(client.ref(`p/${id}`), { pp: ROOT_PARENT, ua: now })
		}
		await batch.commit()
	}
}

// vim: ts=4

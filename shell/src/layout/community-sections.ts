// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Community list models (finder sections, strip drop index) — pure, so they are testable without the component graph. */

import type { CommunityRef } from '../context/types.js'

export interface CommunitySection {
	key: 'recent' | 'all' | 'results'
	rows: CommunityRef[]
}

function matches(community: CommunityRef, q: string): boolean {
	return community.name.toLowerCase().includes(q) || community.idTag.toLowerCase().includes(q)
}

/**
 * Empty query: Recent, then All (everything not in Recent). A query: one flat Results
 * list over every community. Empty sections are dropped.
 */
export function buildCommunitySections(
	communities: CommunityRef[],
	recent: CommunityRef[],
	query: string
): CommunitySection[] {
	const q = query.trim().toLowerCase()
	const sections: CommunitySection[] = q
		? [{ key: 'results', rows: communities.filter((c) => matches(c, q)) }]
		: [
				{ key: 'recent', rows: recent },
				{
					key: 'all',
					rows: communities.filter((c) => !recent.some((r) => r.idTag === c.idTag))
				}
			]
	return sections.filter((s) => s.rows.length)
}

/**
 * Index for `pinCommunityAt` (remove-then-insert) that places `idTag` before `favorites[index]`
 * (or at the end when `index >= favorites.length`). Drop indices count `favorites` (loaded
 * communities only); `pinned` is the raw id list, which can hold ones not loaded yet.
 */
export function pinDropIndex(
	pinned: string[],
	favorites: { idTag: string }[],
	idTag: string,
	index: number
): number {
	let raw = index < favorites.length ? pinned.indexOf(favorites[index].idTag) : pinned.length
	const from = pinned.indexOf(idTag)
	// The dragged chip is removed first, so every slot after it shifts left by one.
	if (from !== -1 && from < raw) raw--
	return raw
}

// vim: ts=4

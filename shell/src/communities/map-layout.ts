// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Radial layout of the community map: me in the centre, my memberships on ring 1, their
 * partner communities on ring 2. Pure — no React, no DOM — so it is unit-tested directly.
 *
 * Coordinates are centred on (0, 0); the SVG picks a viewBox around them.
 */

import type { PartnerMap, PartnerProfile } from '@cloudillo/core'

export const RING1_RADIUS = 140
export const RING2_RADIUS = 280
export const DEFAULT_MAX_RING2 = 60
/** Widest angular gap between neighbouring ring-2 nodes (radians). */
const MAX_RING2_SEP = 0.3

export interface MapNode {
	/** Unique render/focus key: the idTag on ring 1, `parent>idTag` on ring 2 (one copy per path). */
	key: string
	idTag: string
	profile: PartnerProfile
	ring: 1 | 2
	/** Radians, 0 = right, clockwise in SVG coordinates. */
	angle: number
	x: number
	y: number
	/**
	 * Memberships this node can be entered through ("Enter via"): on ring 2 exactly the parent
	 * this copy hangs off; on ring 1 the other memberships it is a partner of.
	 */
	parents: string[]
}

/** A line between two node idTags. */
export interface MapLine {
	from: string
	to: string
}

export interface MapLayout {
	center: { x: number; y: number }
	ring1: MapNode[]
	ring2: MapNode[]
	/** Ring 1 → ring 2 (`from` is the membership idTag, `to` the ring-2 node key). */
	edges: MapLine[]
	/** Between two ring-1 memberships that are partners of each other. */
	chords: MapLine[]
	/** Partner communities with no ring-2 copy shown because of `maxRing2`. */
	more: number
}

export function displayName(p: PartnerProfile): string {
	return p.name || p.idTag
}

function byName(a: PartnerProfile, b: PartnerProfile): number {
	return displayName(a).localeCompare(displayName(b)) || a.idTag.localeCompare(b.idTag)
}

function place(
	key: string,
	profile: PartnerProfile,
	ring: 1 | 2,
	angle: number,
	parents: string[]
): MapNode {
	const r = ring === 1 ? RING1_RADIUS : RING2_RADIUS
	return {
		key,
		idTag: profile.idTag,
		profile,
		ring,
		angle,
		x: r * Math.cos(angle),
		y: r * Math.sin(angle),
		parents
	}
}

/**
 * Spread sorted `base` angles so neighbours are at least `sep` apart, keeping each run of
 * colliding nodes centred on the mean of its base angles.
 */
// ponytail: no wrap-around merge across ±π, so a cluster straddling the left side can crowd; fine for ≤60 nodes
function spread(base: number[], sep: number): number[] {
	const clusters: { start: number; count: number; sum: number }[] = []
	for (let i = 0; i < base.length; i++) {
		clusters.push({ start: i, count: 1, sum: base[i] })
		for (;;) {
			const n = clusters.length
			if (n < 2) break
			const a = clusters[n - 2]
			const b = clusters[n - 1]
			const aEnd = a.sum / a.count + ((a.count - 1) * sep) / 2
			const bStart = b.sum / b.count - ((b.count - 1) * sep) / 2
			if (bStart - aEnd >= sep) break
			clusters.splice(n - 2, 2, {
				start: a.start,
				count: a.count + b.count,
				sum: a.sum + b.sum
			})
		}
	}
	const out: number[] = []
	for (const c of clusters) {
		const first = c.sum / c.count - ((c.count - 1) * sep) / 2
		for (let k = 0; k < c.count; k++) out.push(first + k * sep)
	}
	return out
}

export function layoutPartnerMap(map: PartnerMap, opts?: { maxRing2?: number }): MapLayout {
	const maxRing2 = opts?.maxRing2 ?? DEFAULT_MAX_RING2

	const members = [...map.communities].sort(byName)
	const ring1 = members.map((p, i) =>
		place(p.idTag, p, 1, -Math.PI / 2 + (2 * Math.PI * i) / members.length, [])
	)
	const ring1ByTag = new Map(ring1.map((n) => [n.idTag, n]))

	const profiles = new Map(map.partners.map((p) => [p.idTag, p]))
	const parentsOf = new Map<string, string[]>()
	const chords: MapLine[] = []
	const chordKeys = new Set<string>()

	for (const { community, partner } of map.edges) {
		if (!ring1ByTag.has(community) || community === partner) continue
		if (ring1ByTag.has(partner)) {
			// Both ends are my memberships: a chord, never a ring-2 duplicate.
			const via = ring1ByTag.get(partner)!.parents
			if (!via.includes(community)) via.push(community)
			const key =
				community < partner ? `${community}\n${partner}` : `${partner}\n${community}`
			if (!chordKeys.has(key)) {
				chordKeys.add(key)
				chords.push({ from: community, to: partner })
			}
			continue
		}
		const parents = parentsOf.get(partner) ?? []
		if (!parents.includes(community)) parents.push(community)
		parentsOf.set(partner, parents)
	}

	// One entry per (parent, partner) path, each next to its own parent.
	const all = [...parentsOf.entries()].flatMap(([idTag, parents]) => {
		const profile = profiles.get(idTag) ?? { idTag, name: idTag, type: 'community' as const }
		return parents.map((parent) => ({
			profile,
			parent,
			pathCount: parents.length,
			base: ring1ByTag.get(parent)!.angle
		}))
	})
	// Well-connected first, and all copies of one community together so the cap keeps them whole.
	all.sort(
		(a, b) =>
			b.pathCount - a.pathCount ||
			byName(a.profile, b.profile) ||
			byName(ring1ByTag.get(a.parent)!.profile, ring1ByTag.get(b.parent)!.profile)
	)
	// Cut on a community boundary; a first group larger than the cap still shows, capped.
	let n = Math.min(maxRing2, all.length)
	const cut = all[n]?.profile.idTag
	while (cut && n > 0 && all[n - 1].profile.idTag === cut) n--
	const shown = all.slice(0, n || maxRing2)
	shown.sort((a, b) => a.base - b.base || byName(a.profile, b.profile))

	const sep = shown.length ? Math.min(MAX_RING2_SEP, (2 * Math.PI) / shown.length) : 0
	const angles = spread(
		shown.map((s) => s.base),
		sep
	)
	const ring2 = shown.map((s, i) =>
		place(`${s.parent}>${s.profile.idTag}`, s.profile, 2, angles[i], [s.parent])
	)

	const edges = ring2.map((n) => ({ from: n.parents[0], to: n.key }))
	const shownTags = new Set(ring2.map((n) => n.idTag))
	const more = [...parentsOf.keys()].filter((t) => !shownTags.has(t)).length

	return { center: { x: 0, y: 0 }, ring1, ring2, edges, chords, more }
}

/**
 * All partners of each membership, uncapped — the List view. Partners that are themselves
 * memberships are included (the row then offers "Open" besides "Enter via").
 */
export function partnersByCommunity(map: PartnerMap): Map<string, PartnerProfile[]> {
	const profiles = new Map([...map.communities, ...map.partners].map((p) => [p.idTag, p]))
	const out = new Map<string, PartnerProfile[]>(map.communities.map((c) => [c.idTag, []]))
	for (const { community, partner } of map.edges) {
		const list = out.get(community)
		if (!list || partner === community || list.some((p) => p.idTag === partner)) continue
		list.push(profiles.get(partner) ?? { idTag: partner, name: partner, type: 'community' })
	}
	for (const list of out.values()) list.sort(byName)
	return out
}

// vim: ts=4

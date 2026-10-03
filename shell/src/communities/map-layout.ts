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
	idTag: string
	profile: PartnerProfile
	ring: 1 | 2
	/** Radians, 0 = right, clockwise in SVG coordinates. */
	angle: number
	x: number
	y: number
	/** Ring 2 only: the ring-1 memberships this partner is connected to (empty on ring 1). */
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
	/** Ring 1 → ring 2 (`from` is the membership). */
	edges: MapLine[]
	/** Between two ring-1 memberships that are partners of each other. */
	chords: MapLine[]
	/** Ring-2 nodes left out by `maxRing2`. */
	more: number
}

export function displayName(p: PartnerProfile): string {
	return p.name || p.idTag
}

function byName(a: PartnerProfile, b: PartnerProfile): number {
	return displayName(a).localeCompare(displayName(b)) || a.idTag.localeCompare(b.idTag)
}

function circularMean(angles: number[]): number {
	let sx = 0
	let sy = 0
	for (const a of angles) {
		sx += Math.cos(a)
		sy += Math.sin(a)
	}
	return Math.atan2(sy, sx)
}

function place(profile: PartnerProfile, ring: 1 | 2, angle: number, parents: string[]): MapNode {
	const r = ring === 1 ? RING1_RADIUS : RING2_RADIUS
	return {
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
		place(p, 1, -Math.PI / 2 + (2 * Math.PI * i) / members.length, [])
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

	const all = [...parentsOf.entries()].map(([idTag, parents]) => ({
		profile: profiles.get(idTag) ?? { idTag, name: idTag, type: 'community' as const },
		parents,
		base: circularMean(parents.map((t) => ring1ByTag.get(t)!.angle))
	}))
	all.sort((a, b) => b.parents.length - a.parents.length || byName(a.profile, b.profile))
	const shown = all.slice(0, maxRing2)
	shown.sort((a, b) => a.base - b.base || byName(a.profile, b.profile))

	const sep = shown.length ? Math.min(MAX_RING2_SEP, (2 * Math.PI) / shown.length) : 0
	const angles = spread(
		shown.map((s) => s.base),
		sep
	)
	const ring2 = shown.map((s, i) => place(s.profile, 2, angles[i], s.parents))

	const edges: MapLine[] = []
	for (const n of ring2) {
		for (const parent of n.parents) edges.push({ from: parent, to: n.idTag })
	}

	return { center: { x: 0, y: 0 }, ring1, ring2, edges, chords, more: all.length - shown.length }
}

/**
 * All partners of each membership, uncapped — the List view. Partners that are themselves
 * memberships are included (the row then offers "Open" instead of "Enter via").
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

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PartnerMap, PartnerProfile } from '@cloudillo/core'

import { layoutPartnerMap, partnersByCommunity } from '../communities/map-layout.js'

function c(idTag: string): PartnerProfile {
	return { idTag, name: idTag, type: 'community' }
}

function map(communities: string[], edges: [string, string][]): PartnerMap {
	const partners = [...new Set(edges.map(([, p]) => p))].filter((p) => !communities.includes(p))
	return {
		communities: communities.map(c),
		partners: partners.map(c),
		edges: edges.map(([community, partner]) => ({ community, partner })),
		syncedAt: 1,
		syncing: false
	}
}

describe('layoutPartnerMap', () => {
	it('spaces ring 1 evenly, starting at the top', () => {
		const l = layoutPartnerMap(map(['a', 'b', 'c', 'd'], []))
		expect(l.ring1.map((n) => n.idTag)).toEqual(['a', 'b', 'c', 'd'])
		expect(l.ring1[0].angle).toBeCloseTo(-Math.PI / 2)
		expect(l.ring1[1].angle - l.ring1[0].angle).toBeCloseTo(Math.PI / 2)
		expect(l.ring2).toEqual([])
	})

	it('draws a partner that is also a membership as one chord', () => {
		const l = layoutPartnerMap(
			map(
				['a', 'b'],
				[
					['a', 'b'],
					['b', 'a']
				]
			)
		)
		expect(l.chords).toEqual([{ from: 'a', to: 'b' }])
		expect(l.ring2).toEqual([])
		expect(l.edges).toEqual([])
		expect(l.ring1.find((n) => n.idTag === 'b')!.parents).toEqual(['a'])
		expect(l.ring1.find((n) => n.idTag === 'a')!.parents).toEqual(['b'])
	})

	it('places a copy of a shared partner next to each parent', () => {
		const l = layoutPartnerMap(
			map(
				['a', 'b', 'c', 'd'],
				[
					['a', 'x'],
					['b', 'x']
				]
			)
		)
		expect(l.ring2).toHaveLength(2)
		expect(new Set(l.ring2.map((n) => n.key)).size).toBe(2)
		const angleOf = { a: -Math.PI / 2, b: 0 } as Record<string, number>
		for (const n of l.ring2) {
			expect(n.idTag).toBe('x')
			expect(n.parents).toHaveLength(1)
			expect(n.angle).toBeCloseTo(angleOf[n.parents[0]])
		}
		expect(l.edges.map((e) => e.to).sort()).toEqual(l.ring2.map((n) => n.key).sort())
	})

	it('keeps siblings apart', () => {
		const l = layoutPartnerMap(
			map(
				['a'],
				[
					['a', 'x'],
					['a', 'y'],
					['a', 'z']
				]
			)
		)
		const angles = l.ring2.map((n) => n.angle).sort((p, q) => p - q)
		expect(angles[1] - angles[0]).toBeGreaterThan(0.1)
		expect(angles[2] - angles[1]).toBeGreaterThan(0.1)
		// centred on the parent
		expect(angles[1]).toBeCloseTo(-Math.PI / 2)
	})

	it('caps ring 2 by path count, keeping copies together, and reports the rest', () => {
		const edges: [string, string][] = [
			['a', 'shared'],
			['b', 'shared'],
			['a', 'p1'],
			['a', 'p2']
		]
		const l = layoutPartnerMap(map(['a', 'b'], edges), { maxRing2: 2 })
		expect(l.ring2).toHaveLength(2)
		expect(l.ring2.map((n) => n.idTag)).toEqual(['shared', 'shared'])
		expect(l.more).toBe(2)
		expect(l.edges.every((e) => l.ring2.some((n) => n.key === e.to))).toBe(true)
	})

	it('cuts the cap on a community boundary, never partway through its copies', () => {
		const edges: [string, string][] = [
			['a', 'x'],
			['b', 'x'],
			['a', 'y'],
			['c', 'y']
		]
		const l = layoutPartnerMap(map(['a', 'b', 'c'], edges), { maxRing2: 3 })
		expect(l.ring2.map((n) => n.idTag)).toEqual(['x', 'x'])
		expect(l.more).toBe(1)
	})

	it('still shows a single group larger than the cap', () => {
		const edges: [string, string][] = [
			['a', 'x'],
			['b', 'x'],
			['c', 'x']
		]
		const l = layoutPartnerMap(map(['a', 'b', 'c'], edges), { maxRing2: 2 })
		expect(l.ring2.map((n) => n.idTag)).toEqual(['x', 'x'])
		expect(l.more).toBe(0)
	})

	it('ignores edges from non-memberships', () => {
		const l = layoutPartnerMap(map(['a'], [['z', 'x']]))
		expect(l.ring2).toEqual([])
	})
})

describe('partnersByCommunity', () => {
	it('lists every partner under each membership, uncapped', () => {
		const m = map(
			['a', 'b'],
			[
				['a', 'b'],
				['a', 'x'],
				['b', 'x']
			]
		)
		const byC = partnersByCommunity(m)
		expect(byC.get('a')!.map((p) => p.idTag)).toEqual(['b', 'x'])
		expect(byC.get('b')!.map((p) => p.idTag)).toEqual(['x'])
	})
})

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { CommunityRef } from '../context/types.js'
import { buildCommunitySections, pinDropIndex } from '../layout/community-sections.js'

function community(idTag: string, name: string): CommunityRef {
	return {
		idTag,
		name,
		isFavorite: false,
		showInHome: true,
		unreadCount: 0,
		lastActivityAt: null
	}
}

const a = community('alpha.tld', 'Alpha Club')
const b = community('beta.tld', 'Beta Group')
const c = community('gamma.tld', 'Gamma')
const all = [a, b, c]

const tags = (rows: CommunityRef[]) => rows.map((r) => r.idTag)

describe('buildCommunitySections', () => {
	it('lists Recent, then All without the recent ones', () => {
		const sections = buildCommunitySections(all, [c, a], '')
		expect(sections.map((s) => s.key)).toEqual(['recent', 'all'])
		expect(tags(sections[0].rows)).toEqual(['gamma.tld', 'alpha.tld'])
		expect(tags(sections[1].rows)).toEqual(['beta.tld'])
	})

	it('drops empty sections', () => {
		expect(buildCommunitySections(all, [], '').map((s) => s.key)).toEqual(['all'])
		expect(buildCommunitySections(all, all, '').map((s) => s.key)).toEqual(['recent'])
		expect(buildCommunitySections([], [], '')).toEqual([])
	})

	it('matches a query on name or idTag, case-insensitively, as one Results list', () => {
		const byName = buildCommunitySections(all, [c], 'CLUB')
		expect(byName.map((s) => s.key)).toEqual(['results'])
		expect(tags(byName[0].rows)).toEqual(['alpha.tld'])

		expect(tags(buildCommunitySections(all, [], 'Beta.TLD')[0].rows)).toEqual(['beta.tld'])
		expect(buildCommunitySections(all, [], 'nope')).toEqual([])
	})
})

describe('pinDropIndex', () => {
	const pinned = ['a', 'b', 'c', 'd']
	const favs = (ids: string[]) => ids.map((idTag) => ({ idTag }))

	/** Mirrors `pinCommunityAt` in `context/hooks.ts`: remove, then insert at the index. */
	function apply(list: string[], idTag: string, at: number): string[] {
		const without = list.filter((id) => id !== idTag)
		const i = Math.max(0, Math.min(at, without.length))
		return [...without.slice(0, i), idTag, ...without.slice(i)]
	}
	const drop = (idTag: string, index: number, f = favs(pinned)) =>
		apply(pinned, idTag, pinDropIndex(pinned, f, idTag, index))

	it('drops rightward before the target', () => {
		expect(drop('a', 2)).toEqual(['b', 'a', 'c', 'd'])
	})

	it('drops leftward before the target', () => {
		expect(drop('d', 1)).toEqual(['a', 'd', 'b', 'c'])
	})

	it('leaves the order alone when dropped on its right neighbour', () => {
		expect(drop('a', 1)).toEqual(pinned)
	})

	it('moves to the end on the trailing drop zone', () => {
		expect(drop('b', 4)).toEqual(['a', 'c', 'd', 'b'])
	})

	it('inserts a not-yet-pinned community before the target', () => {
		expect(drop('x', 2)).toEqual(['a', 'b', 'x', 'c', 'd'])
	})

	it('maps through the raw list when some pins are not loaded', () => {
		// 'b' is pinned but not loaded, so favorites index 1 is 'c'.
		expect(drop('d', 1, favs(['a', 'c', 'd']))).toEqual(['a', 'b', 'd', 'c'])
		expect(drop('a', 1, favs(['a', 'c', 'd']))).toEqual(['b', 'a', 'c', 'd'])
	})
})

// vim: ts=4

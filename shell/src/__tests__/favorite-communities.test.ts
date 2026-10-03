// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A pinned non-member (a partner entered under a hat) keeps its chip after switching away:
 * it resolves from `partnerCommunitiesAtom` when it is neither a membership nor active.
 */

import { createStore } from 'jotai'

import {
	activeContextAtom,
	communitiesAtom,
	favoriteCommunitiesAtom,
	favoritesAtom,
	partnerCommunitiesAtom
} from '../context/atoms.js'
import type { CommunityRef } from '../context/types.js'

const ref = (idTag: string): CommunityRef => ({
	idTag,
	name: idTag,
	isFavorite: false,
	showInHome: true,
	unreadCount: 0,
	lastActivityAt: null
})

describe('favoriteCommunitiesAtom', () => {
	it('resolves a pinned partner from its partner row while another context is active', () => {
		const s = createStore()
		s.set(favoritesAtom, ['b.tld'])
		s.set(communitiesAtom, [])
		s.set(partnerCommunitiesAtom, [ref('b.tld')])
		s.set(activeContextAtom, {
			idTag: 'other.tld',
			type: 'community',
			name: 'other.tld',
			roles: [],
			permissions: [],
			metadata: {}
		})
		expect(s.get(favoriteCommunitiesAtom).map((c) => c.idTag)).toEqual(['b.tld'])
	})

	it('drops a pinned non-member with no row once it is not active', () => {
		const s = createStore()
		s.set(favoritesAtom, ['b.tld'])
		expect(s.get(favoriteCommunitiesAtom)).toEqual([])
	})
})

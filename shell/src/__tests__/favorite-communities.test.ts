// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * A pinned non-member (a partner entered under a hat) keeps its chip after switching away:
 * it resolves from `partnerCommunitiesAtom` when it is neither a membership nor active.
 */

import { createStore } from 'jotai'

import {
	activeContextAtom,
	activePinKey,
	communitiesAtom,
	favoriteCommunitiesAtom,
	favoritesAtom,
	isActivePin,
	partnerCommunitiesAtom,
	previewCommunityAtom,
	withoutPins
} from '../context/atoms.js'
import type { ActiveContext, CommunityRef } from '../context/types.js'

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

const activeB = (hat?: string): ActiveContext => ({
	idTag: 'b.tld',
	type: 'community',
	name: 'b.tld',
	roles: [],
	permissions: [],
	metadata: {},
	hat: hat ? { idTag: hat, role: 'member' } : undefined
})

describe('hatted pins', () => {
	it('keeps a bare and a hatted pin of one community as two entries', () => {
		const s = createStore()
		s.set(communitiesAtom, [ref('b.tld'), { ...ref('a.tld'), name: 'A' }])
		s.set(favoritesAtom, ['b.tld', 'b.tld|a.tld'])
		const favs = s.get(favoriteCommunitiesAtom)
		expect(favs.map((c) => c.pinKey)).toEqual(['b.tld', 'b.tld|a.tld'])
		expect(favs[0].hat).toBeUndefined()
		expect(favs[1].hat).toEqual({ idTag: 'a.tld', name: 'A', profilePic: undefined })
	})

	it('previews the hatted context until its own key is pinned', () => {
		const s = createStore()
		s.set(communitiesAtom, [ref('b.tld'), ref('a.tld')])
		s.set(favoritesAtom, ['b.tld'])
		s.set(activeContextAtom, activeB('a.tld'))
		expect(s.get(previewCommunityAtom)?.pinKey).toBe('b.tld|a.tld')
		s.set(favoritesAtom, ['b.tld', 'b.tld|a.tld'])
		expect(s.get(previewCommunityAtom)).toBeNull()
	})
})

describe('isActivePin', () => {
	const partners = [ref('c.tld')]

	it('matches a hatted key only under that hat', () => {
		expect(isActivePin('b.tld|a.tld', activeB('a.tld'), partners)).toBe(true)
		expect(isActivePin('b.tld|a.tld', activeB('c.tld'), partners)).toBe(false)
		expect(isActivePin('b.tld|a.tld', activeB(), partners)).toBe(false)
	})

	it('does not light a bare pin under a hat when b is not a partner', () => {
		// Cold load: nothing known about b yet
		expect(isActivePin('b.tld', activeB('a.tld'), [])).toBe(false)
		expect(isActivePin('b.tld', activeB(), [])).toBe(true)
	})

	it('lights a legacy bare pin of a partner under any hat', () => {
		expect(isActivePin('b.tld', activeB('a.tld'), [ref('b.tld')])).toBe(true)
	})
})

describe('activePinKey', () => {
	it('prefers the exact hatted key over a legacy bare pin', () => {
		const keys = ['b.tld', 'b.tld|a.tld']
		expect(activePinKey(keys, activeB('a.tld'), [ref('b.tld')])).toBe('b.tld|a.tld')
	})

	it('falls back to a legacy bare partner pin', () => {
		expect(activePinKey(['b.tld'], activeB('a.tld'), [ref('b.tld')])).toBe('b.tld')
	})
})

describe('withoutPins', () => {
	const keys = ['a.tld', 'b.tld', 'b.tld|a.tld', 'x.tld|a.tld']

	it('drops every pin of a community', () => {
		expect(withoutPins(keys, 'b.tld')).toEqual(['a.tld', 'x.tld|a.tld'])
	})

	it('also drops pins worn under it as a hat', () => {
		expect(withoutPins(keys, 'a.tld', true)).toEqual(['b.tld'])
	})
})

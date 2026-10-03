// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The passive-read trust gate.
 *
 * The load-bearing case is the last one: an explicit action seeds a proxy token
 * in the registry, and every *later* passive read must still go out anonymous.
 * Without the gate on the cached-token path, one follow permanently identifies
 * the user to that node on every thumbnail and title prefetch that follows.
 */

import { contextKey, resetApiRegistry, setApiToken } from '@cloudillo/core'
import { createStore } from 'jotai'

import {
	activeContextAtom,
	communitiesAtom,
	partnerCommunitiesAtom,
	sessionTrustAtom,
	storedTrustAtom
} from '../context/atoms.js'
import {
	activeKeyFor,
	effectiveTrust,
	hattedConsent,
	isKnownContext,
	mayUseContextToken
} from '../context/trust-gate.js'
import type { CommunityRef } from '../context/types.js'

const HOME = 'alice.cloudillo.net'
const FOREIGN = 'bob.cloudillo.net'
const HAT = 'partner.tld'

/** The active context `idTag`, optionally worn under `hat`. */
function wearing(idTag: string, hat?: string) {
	return {
		idTag,
		type: 'community' as const,
		name: idTag,
		hat: hat ? { idTag: hat, role: 'follower' } : undefined,
		roles: [],
		permissions: [],
		metadata: {}
	}
}

function store() {
	return createStore()
}

afterEach(() => {
	resetApiRegistry()
})

describe('effectiveTrust', () => {
	it('is none without any decision', () => {
		expect(effectiveTrust(store(), FOREIGN)).toBe('none')
	})

	it('is consent for a session allow', () => {
		const s = store()
		s.set(sessionTrustAtom, new Map([[FOREIGN, 'S' as const]]))
		expect(effectiveTrust(s, FOREIGN)).toBe('consent')
	})

	it('is consent for stored always', () => {
		const s = store()
		s.set(storedTrustAtom, new Map([[FOREIGN, 'always' as const]]))
		expect(effectiveTrust(s, FOREIGN)).toBe('consent')
	})

	it('lets a session deny override stored always', () => {
		const s = store()
		s.set(sessionTrustAtom, new Map([[FOREIGN, 'X' as const]]))
		s.set(storedTrustAtom, new Map([[FOREIGN, 'always' as const]]))
		expect(effectiveTrust(s, FOREIGN)).toBe('none')
	})

	it('is consent for the active context', () => {
		// Entered by an explicit switch/join; every view inside it depends on
		// staying authenticated, so it outranks even a session deny.
		const s = store()
		s.set(sessionTrustAtom, new Map([[FOREIGN, 'X' as const]]))
		s.set(activeContextAtom, {
			idTag: FOREIGN,
			type: 'community',
			name: FOREIGN,
			roles: [],
			permissions: [],
			metadata: {}
		})
		expect(effectiveTrust(s, FOREIGN)).toBe('consent')
	})
})

describe('mayUseContextToken', () => {
	it('never gates the home idTag', () => {
		setApiToken(HOME, 'tok')
		expect(mayUseContextToken(store(), HOME, { ownIdTag: HOME })).toBe(true)
	})

	it('never gates the home idTag on a registered token either', () => {
		// No setApiToken: the home entry can lapse at `exp` while a renewal is in
		// flight. The SW injects the session bearer for own-tenant requests, so
		// returning false here would turn getClientFor into a silent null instead
		// of a 401 that reaches the recovery path.
		expect(mayUseContextToken(store(), HOME, { ownIdTag: HOME })).toBe(true)
	})

	it('refuses when no token is registered', () => {
		const s = store()
		s.set(sessionTrustAtom, new Map([[FOREIGN, 'S' as const]]))
		expect(mayUseContextToken(s, FOREIGN, { ownIdTag: HOME })).toBe(false)
	})

	it('keeps a passive read anonymous after an explicit action seeded a token', () => {
		// The explicit action (follow, comment) is allowed to identify the user…
		const s = store()
		expect(mayUseContextToken(s, FOREIGN, { ownIdTag: HOME, explicit: true })).toBe(false)
		setApiToken(FOREIGN, 'proxy-token')
		expect(mayUseContextToken(s, FOREIGN, { ownIdTag: HOME, explicit: true })).toBe(true)

		// …but the passive reads that follow must not ride in on its token.
		expect(mayUseContextToken(s, FOREIGN, { ownIdTag: HOME })).toBe(false)

		// Until the user actually consents.
		s.set(sessionTrustAtom, new Map([[FOREIGN, 'S' as const]]))
		expect(mayUseContextToken(s, FOREIGN, { ownIdTag: HOME })).toBe(true)
	})

	it('looks up the hatted token while the active context wears a hat', () => {
		// Only the hatted `B|A` key holds a token inside a hatted context.
		const s = store()
		s.set(activeContextAtom, wearing(FOREIGN, HAT))
		setApiToken(contextKey(FOREIGN, HAT), 'hatted')
		expect(mayUseContextToken(s, FOREIGN, { ownIdTag: HOME })).toBe(true)
		setApiToken(contextKey(FOREIGN, HAT), undefined)
		setApiToken(FOREIGN, 'bare')
		expect(mayUseContextToken(s, FOREIGN, { ownIdTag: HOME })).toBe(false)
	})
})

describe('activeKeyFor / hattedConsent', () => {
	it('keys the active context by its hat, everything else bare', () => {
		const s = store()
		expect(activeKeyFor(s, FOREIGN)).toBe(FOREIGN)
		s.set(activeContextAtom, wearing(FOREIGN, HAT))
		expect(activeKeyFor(s, FOREIGN)).toBe(contextKey(FOREIGN, HAT))
		expect(activeKeyFor(s, HOME)).toBe(HOME)
	})

	it('consents to a hatted token only while that exact hat is worn', () => {
		const s = store()
		expect(hattedConsent(s, FOREIGN, HAT)).toBe(false)
		s.set(activeContextAtom, wearing(FOREIGN, HAT))
		expect(hattedConsent(s, FOREIGN, HAT)).toBe(true)
		expect(hattedConsent(s, FOREIGN, 'other.tld')).toBe(false)
		s.set(activeContextAtom, wearing(FOREIGN))
		expect(hattedConsent(s, FOREIGN, HAT)).toBe(false)
	})
})

// Whether a context the *URL* named may be entered without asking. A pathname is not
// a user action, and `setActiveContext` mints an identified proxy token — so
// `https://alice.example/@attacker.tld` must not be enough to announce the user there.
describe('isKnownContext', () => {
	function community(idTag: string): CommunityRef {
		return {
			idTag,
			name: idTag,
			isFavorite: false,
			showInHome: true,
			unreadCount: 0,
			lastActivityAt: null
		}
	}

	it('knows the home idTag', () => {
		expect(isKnownContext(store(), HOME, HOME)).toBe(true)
	})

	it('knows a community the user is already in', () => {
		const s = store()
		s.set(communitiesAtom, [community(FOREIGN)])
		expect(isKnownContext(s, FOREIGN, HOME)).toBe(true)
	})

	it('knows an idTag the user has consented to this session', () => {
		const s = store()
		s.set(sessionTrustAtom, new Map([[FOREIGN, 'S' as const]]))
		expect(isKnownContext(s, FOREIGN, HOME)).toBe(true)
	})

	it('knows a partner community entered under a hat', () => {
		const s = store()
		s.set(partnerCommunitiesAtom, [{ ...community(FOREIGN), hat: { idTag: HOME } }])
		expect(isKnownContext(s, FOREIGN, HOME)).toBe(true)
	})

	it('does not know a partner row without a hat', () => {
		const s = store()
		s.set(partnerCommunitiesAtom, [community(FOREIGN)])
		expect(isKnownContext(s, FOREIGN, HOME)).toBe(false)
	})

	it('does not know a stranger a link named', () => {
		expect(isKnownContext(store(), FOREIGN, HOME)).toBe(false)
	})
})

// vim: ts=4

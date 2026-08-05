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

import { resetApiRegistry, setApiToken } from '@cloudillo/core'
import { createStore } from 'jotai'

import { activeContextAtom, sessionTrustAtom, storedTrustAtom } from '../context/atoms.js'
import { effectiveTrust, mayUseContextToken } from '../context/trust-gate.js'

const HOME = 'alice.cloudillo.net'
const FOREIGN = 'bob.cloudillo.net'

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
})

// vim: ts=4

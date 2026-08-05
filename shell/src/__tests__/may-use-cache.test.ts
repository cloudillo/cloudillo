// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The offline-cache gate. The cache is keyed by content *owner*, not by viewer,
 * so saying "yes" to the wrong failure hands a dead or foreign session the
 * owner's private data — a leak, not a degraded experience.
 */

import { FetchError, resetApiRegistry, setApiToken } from '@cloudillo/core'

import { jwtExpiryDate } from '@cloudillo/core/jwt'
import { mayUseCache } from '../cache/hooks.js'

const OWNER = 'alice.cloudillo.net'

/** A FetchError carrying `httpStatus`, as the api client throws it. */
function fetchError(httpStatus: number): FetchError {
	return new FetchError('E-TEST', 'test error', httpStatus)
}

/** A JWT (unsigned — payloads are decoded, never verified) expiring at `exp`. */
function makeToken(exp: number): string {
	const b64url = (obj: unknown) =>
		btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj))))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '')
	return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ exp })}.sig`
}

describe('mayUseCache', () => {
	beforeEach(() => {
		resetApiRegistry()
		setApiToken(OWNER, 'token')
	})

	afterEach(() => {
		resetApiRegistry()
	})

	it('refuses without a context idTag', () => {
		expect(mayUseCache(new Error('offline'), undefined)).toBe(false)
		expect(mayUseCache(new Error('offline'), '')).toBe(false)
	})

	it('refuses when no token is registered for the context', () => {
		// Guest mode, an untrusted foreign profile, or a revoked membership: the
		// viewer's *home* session may be perfectly alive, but nothing authorises
		// them to read this owner's rows.
		expect(mayUseCache(new Error('offline'), 'bob.cloudillo.net')).toBe(false)
	})

	it('refuses once the context token has expired', () => {
		setApiToken(OWNER, 'token', new Date(Date.now() - 1000))
		expect(mayUseCache(new Error('offline'), OWNER)).toBe(false)
	})

	it('refuses an auth failure', () => {
		expect(mayUseCache(fetchError(401), OWNER)).toBe(false)
		expect(mayUseCache(fetchError(403), OWNER)).toBe(false)
	})

	it('allows a server-side failure', () => {
		expect(mayUseCache(fetchError(500), OWNER)).toBe(true)
		expect(mayUseCache(fetchError(503), OWNER)).toBe(true)
	})

	it('allows a plain transport failure', () => {
		expect(mayUseCache(new Error('Failed to fetch'), OWNER)).toBe(true)
		expect(mayUseCache(undefined, OWNER)).toBe(true)
	})

	it('refuses an expired HOME token registered the way the shell registers it', () => {
		// The home identity is the commonest context and the one whose cache holds
		// the most private rows. Every writer of the home entry (layout's
		// syncApiToken, auth.tsx's two login paths, boot.ts) must pass the token's
		// own `exp` — without it the entry never reaps and a dead session keeps
		// reading the owner's cached data.
		const expiredHomeToken = makeToken(Math.floor(Date.now() / 1000) - 60)
		setApiToken(OWNER, expiredHomeToken, jwtExpiryDate(expiredHomeToken))
		expect(mayUseCache(new Error('offline'), OWNER)).toBe(false)

		const liveHomeToken = makeToken(Math.floor(Date.now() / 1000) + 600)
		setApiToken(OWNER, liveHomeToken, jwtExpiryDate(liveHomeToken))
		expect(mayUseCache(new Error('offline'), OWNER)).toBe(true)
	})
})

// vim: ts=4

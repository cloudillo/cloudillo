// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getApiClient, hasApiToken, resetApiRegistry, setApiToken } from '../api-registry'

beforeEach(() => {
	resetApiRegistry()
})

/** A token whose payload carries `exp` at `expSeconds`. Signature is never checked. */
function tokenWithExp(expSeconds: number): string {
	const payload = btoa(JSON.stringify({ exp: expSeconds }))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')
	return `header.${payload}.sig`
}

describe('getApiClient', () => {
	it('returns the same instance for the same idTag', () => {
		// Referential stability is the whole point: the shell's effect/memo deps
		// key off the api object, so a new client per call would refetch
		// everything on every token rotation.
		expect(getApiClient('alice.example')).toBe(getApiClient('alice.example'))
	})

	it('returns distinct instances for distinct idTags', () => {
		const alice = getApiClient('alice.example')
		const bob = getApiClient('bob.example')
		expect(alice).not.toBe(bob)
		expect(alice.idTag).toBe('alice.example')
		expect(bob.idTag).toBe('bob.example')
	})

	it('starts fresh after resetApiRegistry', () => {
		const before = getApiClient('alice.example')
		resetApiRegistry()
		expect(getApiClient('alice.example')).not.toBe(before)
	})
})

describe('setApiToken / hasApiToken', () => {
	it('reports no token for an unknown idTag', () => {
		expect(hasApiToken('alice.example')).toBe(false)
	})

	it('does not create a client for an unknown idTag', () => {
		// It runs on every render of the gates that read it; creating entries
		// would let a typo'd or transient idTag accumulate clients forever.
		hasApiToken('alice.example')
		const created = getApiClient('alice.example')
		expect(getApiClient('alice.example')).toBe(created)
	})

	it('reports no token for a client created without one', () => {
		getApiClient('alice.example')
		expect(hasApiToken('alice.example')).toBe(false)
	})

	it('registers a token, creating the client if needed', () => {
		setApiToken('alice.example', 'tok')
		expect(hasApiToken('alice.example')).toBe(true)
		expect(getApiClient('alice.example').idTag).toBe('alice.example')
	})

	it('keeps the client identity across a token rotation', () => {
		const client = getApiClient('alice.example')
		setApiToken('alice.example', 'tok-1')
		setApiToken('alice.example', 'tok-2')
		expect(getApiClient('alice.example')).toBe(client)
	})

	it('clears the token when passed undefined', () => {
		setApiToken('alice.example', 'tok')
		setApiToken('alice.example', undefined)
		expect(hasApiToken('alice.example')).toBe(false)
	})

	it('drops expiresAt along with the token', () => {
		// Otherwise the next token would inherit the previous one's expiry.
		const future = new Date(Date.now() + 60_000)
		setApiToken('alice.example', 'tok', future)
		setApiToken('alice.example', undefined, future)
		setApiToken('alice.example', 'tok-2')
		expect(hasApiToken('alice.example')).toBe(true)
	})
})

describe('expiry', () => {
	it('keeps a token whose expiry is still in the future', () => {
		setApiToken('alice.example', 'tok', new Date(Date.now() + 60_000))
		expect(hasApiToken('alice.example')).toBe(true)
	})

	it('reports an expired token as absent', () => {
		setApiToken('alice.example', 'tok', new Date(Date.now() - 1000))
		expect(hasApiToken('alice.example')).toBe(false)
	})

	it('drops the expired token from the client itself, not just from the gate', () => {
		// The client is the only store, so "the gate says no" and "the client
		// stops sending it" have to be the same fact.
		const client = getApiClient('alice.example')
		setApiToken('alice.example', 'tok', new Date(Date.now() - 1000))
		expect(client.hasValidToken()).toBe(false)
		expect(client.getAuthToken()).toBeUndefined()
	})

	it('stays cleared across repeated reads', () => {
		setApiToken('alice.example', 'tok', new Date(Date.now() - 1000))
		expect(hasApiToken('alice.example')).toBe(false)
		expect(hasApiToken('alice.example')).toBe(false)
	})

	it("derives the expiry from the token's own exp when none is passed", () => {
		setApiToken('alice.example', tokenWithExp(Math.floor(Date.now() / 1000) - 60))
		expect(hasApiToken('alice.example')).toBe(false)

		setApiToken('bob.example', tokenWithExp(Math.floor(Date.now() / 1000) + 60))
		expect(hasApiToken('bob.example')).toBe(true)
	})

	it('lets an explicit expiry win over the exp claim', () => {
		setApiToken(
			'alice.example',
			tokenWithExp(Math.floor(Date.now() / 1000) - 60),
			new Date(Date.now() + 60_000)
		)
		expect(hasApiToken('alice.example')).toBe(true)
	})

	it('never expires a token with no parseable exp', () => {
		// Opaque tokens exist; the server stays the authority on their validity.
		setApiToken('alice.example', 'not-a-jwt')
		expect(hasApiToken('alice.example')).toBe(true)
	})
})

// vim: ts=4

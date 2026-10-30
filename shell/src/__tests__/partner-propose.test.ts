// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ActionView } from '@cloudillo/types'

import { connIdsKey, fromCommunity, fromPerson } from '../context/hooks.js'
import { defaultFrom, type PartnershipState, proposeBlocked } from '../communities/partners.js'

describe('proposeBlocked', () => {
	it('blocks while the state is not loaded', () => {
		expect(proposeBlocked({}, 'a.tld', 'b.tld')).toBe(true)
	})

	it('does not block without a target', () => {
		expect(proposeBlocked({}, 'a.tld', undefined)).toBe(false)
	})

	it('blocks any existing relation', () => {
		for (const s of ['partner', 'sent', 'incoming'] as PartnershipState[]) {
			expect(proposeBlocked({ 'a.tld': s }, 'a.tld', 'b.tld')).toBe(true)
		}
	})

	it('leaves no relation open', () => {
		expect(proposeBlocked({ 'a.tld': null }, 'a.tld', 'b.tld')).toBe(false)
	})
})

describe('defaultFrom', () => {
	const options = [{ idTag: 'a.tld' }, { idTag: 'b.tld' }, { idTag: 'c.tld' }]
	const blockedOf = (tags: string[]) => (idTag: string) => tags.includes(idTag)

	it('keeps an open preferred option', () => {
		expect(defaultFrom(options, 'b.tld', blockedOf([]))).toBe('b.tld')
	})

	it('falls past a blocked preferred option to the first open one', () => {
		expect(defaultFrom(options, 'b.tld', blockedOf(['a.tld', 'b.tld']))).toBe('c.tld')
	})

	it('returns the preferred option when everything is blocked', () => {
		expect(defaultFrom(options, 'b.tld', blockedOf(['a.tld', 'b.tld', 'c.tld']))).toBe('b.tld')
	})

	it('ignores a preferred option not among the options', () => {
		expect(defaultFrom(options, 'x.tld', blockedOf([]))).toBe('a.tld')
	})

	it('is undefined without options', () => {
		expect(defaultFrom([], 'a.tld', blockedOf([]))).toBeUndefined()
	})
})

describe('fromCommunity / fromPerson', () => {
	const community = { issuer: { type: 'community' } } as unknown as ActionView
	const person = { issuer: { type: 'person' } } as unknown as ActionView

	it('splits requests by issuer type', () => {
		expect(fromCommunity(community)).toBe(true)
		expect(fromPerson(community)).toBe(false)
		expect(fromCommunity(person)).toBe(false)
		expect(fromPerson(person)).toBe(true)
	})
})

describe('connIdsKey', () => {
	const of = (...ids: string[]) => ids.map((actionId) => ({ actionId }) as ActionView)

	it('ignores server order', () => {
		expect(connIdsKey(of('b', 'a'))).toBe(connIdsKey(of('a', 'b')))
	})

	it('tells different ids apart', () => {
		expect(connIdsKey(of('a', 'b'))).not.toBe(connIdsKey(of('a', 'c')))
	})
})

// vim: ts=4

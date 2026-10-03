// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { absChannel, makeChannel, parseChannel } from '../channel.js'

describe('parseChannel', () => {
	it('a bare name has no tenant', () => {
		expect(parseChannel('general')).toEqual({ name: 'general' })
	})

	it('splits the absolute form', () => {
		expect(parseChannel('@c.tld~general')).toEqual({ tenant: 'c.tld', name: 'general' })
	})

	it('splits at the first ~, keeping the rest in the name', () => {
		expect(parseChannel('@c.tld~a~b')).toEqual({ tenant: 'c.tld', name: 'a~b' })
		expect(parseChannel('a~b')).toEqual({ name: 'a~b' })
	})
})

describe('makeChannel / absChannel', () => {
	it('builds the absolute form', () => {
		expect(makeChannel('c.tld', 'general')).toBe('@c.tld~general')
	})

	it('makes a bare name absolute on the tenant', () => {
		expect(absChannel('general', 'c.tld')).toBe('@c.tld~general')
		expect(absChannel('a~b', 'c.tld')).toBe('@c.tld~a~b')
	})

	it('keeps an absolute channel, whatever the tenant', () => {
		expect(absChannel('@other.tld~general', 'c.tld')).toBe('@other.tld~general')
	})

	it('round-trips through parseChannel', () => {
		expect(parseChannel(makeChannel('c.tld', 'a~b'))).toEqual({ tenant: 'c.tld', name: 'a~b' })
	})
})

// vim: ts=4

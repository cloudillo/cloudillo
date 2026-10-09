// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { docRef, parseDocRef } from '../urls'

describe('parseDocRef', () => {
	it('should invert docRef, with and without nav', () => {
		expect(parseDocRef(docRef('quillo', 'bob.org:abc'))).toEqual({
			appId: 'quillo',
			resId: 'bob.org:abc'
		})
		const nav = 'p=3&z=1.5 #x'
		expect(parseDocRef(docRef('prezillo', 'bob.org:abc', nav))).toEqual({
			appId: 'prezillo',
			resId: 'bob.org:abc',
			nav
		})
	})

	it('should tolerate surrounding whitespace', () => {
		expect(parseDocRef('  cl:quillo/bob.org:abc\n')).toEqual({
			appId: 'quillo',
			resId: 'bob.org:abc'
		})
	})

	it.each([
		'',
		'quillo/bob.org:abc',
		'cl:/quillo/bob.org:abc',
		'cl:quillo/abc',
		'cl:quillo/bob.org:abc/extra',
		'cl:quillo/bob.org:abc trailing words',
		'https://example.com/cl:quillo/bob.org:abc'
	])('should reject %p', (input) => {
		expect(parseDocRef(input)).toBeNull()
	})
})

// vim: ts=4

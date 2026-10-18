// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { resolveContextColor } from '../context/context-colors.js'

describe('resolveContextColor', () => {
	const colors = { 'me.org': 'teal', 'comm.tld|me.org': 'amber', 'old.tld': 'mauve' }

	it('returns a known swatch', () => {
		expect(resolveContextColor(colors, 'me.org', true)).toBe('teal')
		expect(resolveContextColor(colors, 'comm.tld|me.org', false)).toBe('amber')
	})

	it('falls back to the default for an unknown swatch', () => {
		expect(resolveContextColor(colors, 'old.tld', true)).toBe('neutral')
		expect(resolveContextColor(colors, 'old.tld', false)).toBeUndefined()
	})

	it('defaults home to neutral when it has no entry', () => {
		expect(resolveContextColor({}, 'me.org', true)).toBe('neutral')
	})

	it('leaves an unpinned community on the default tint', () => {
		expect(resolveContextColor(colors, undefined, false)).toBeUndefined()
	})
})

// vim: ts=4

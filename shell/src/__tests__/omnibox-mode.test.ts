// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Omnibox mode derivation. The `profiles` flag keeps a guest off the profile surface:
 * `GET /api/profiles` is authenticated-only, so profile search would 403, and a guest
 * must never be handed a way to enumerate the tenant's contacts.
 */

import { deriveMode } from '../omnibox-mode.js'

describe('deriveMode', () => {
	it('routes the sigils and shapes for an authenticated caller', () => {
		expect(deriveMode('/fil', true)).toBe('command')
		expect(deriveMode('@bob.example', true)).toBe('profile-search')
		expect(deriveMode('cl:quillo/alice.example:f1', true)).toBe('reference')
		expect(deriveMode('some words', true)).toBe('full-text')
		expect(deriveMode('a', true)).toBe('none')
	})

	// `@` is the explicit profile prefix, so a bare dotted token stays plain text: it
	// is just as often a filename, and a profile still surfaces as a hit row.
	it('searches bare dotted text instead of jumping to a profile', () => {
		expect(deriveMode('report.pdf', true)).toBe('full-text')
		expect(deriveMode('notes.md', true)).toBe('full-text')
		expect(deriveMode('alice.example.com', true)).toBe('full-text')
	})

	// The profile branch is the only one `profiles` gates.
	it('falls profile search through to plain search for a guest', () => {
		expect(deriveMode('@bob.example', false)).toBe('full-text')
		expect(deriveMode('report.pdf', false)).toBe('full-text')
	})
})

// vim: ts=4

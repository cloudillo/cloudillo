// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getDocWsUrl } from '../urls'

describe('getDocWsUrl', () => {
	it('should use the owner tag when the document is remote', () => {
		expect(getDocWsUrl('alice.example', 'bob.example')).toBe('wss://cl-o.alice.example')
	})

	// Regression: an ownerless document must resolve to the viewer's own
	// instance, NOT to `window.location.host` (the app domain, which does not
	// serve /ws/*).
	it('should use our own identity when the document has no owner tag', () => {
		expect(getDocWsUrl(undefined, 'bob.example')).toBe('wss://cl-o.bob.example')
	})

	it('should return undefined when no identity is known yet', () => {
		expect(getDocWsUrl(undefined, undefined)).toBeUndefined()
	})

	it('should treat an empty owner tag as absent', () => {
		expect(getDocWsUrl('', 'bob.example')).toBe('wss://cl-o.bob.example')
	})
})

// vim: ts=4

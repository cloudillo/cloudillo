// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Guest routing. A path wrongly classed as non-guest bounces a share-link
 * visitor to /login; one wrongly classed as guest renders the shell for someone
 * who has no session.
 */

import { HOME_CONTEXT } from '../context/constants.js'
import { getGuestRedirect, isGuestPath } from '../layout/paths.js'

const GUEST_PATHS = [
	'/',
	'/app/~/feed',
	'/profile/alice.cloudillo.net',
	'/s/abc123',
	'/login',
	'/register/xyz',
	'/onboarding/step1',
	'/reset-password/token',
	'/idp/activate/token'
]

describe('isGuestPath', () => {
	it('accepts every guest-reachable prefix', () => {
		for (const path of GUEST_PATHS) {
			expect(isGuestPath(path)).toBe(true)
		}
	})

	it('rejects everything else', () => {
		expect(isGuestPath('/settings')).toBe(false)
		expect(isGuestPath('/files')).toBe(false)
		expect(isGuestPath('/app')).toBe(false) // the prefix is '/app/'
		expect(isGuestPath('/profile')).toBe(false)
		expect(isGuestPath('')).toBe(false)
	})
})

describe('getGuestRedirect', () => {
	it('sends the root to the home context feed', () => {
		expect(getGuestRedirect('/')).toBe(`/app/${HOME_CONTEXT}/feed`)
	})

	it('lets a guest stay on any other guest path', () => {
		for (const path of GUEST_PATHS.filter((p) => p !== '/')) {
			expect(getGuestRedirect(path)).toBeUndefined()
		}
	})

	it('sends everything else to login', () => {
		expect(getGuestRedirect('/settings')).toBe('/login')
		expect(getGuestRedirect('/files/123')).toBe('/login')
	})
})

// vim: ts=4

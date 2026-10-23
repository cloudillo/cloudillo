// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { readGrant } from '../message-bus/handlers/settings.js'

describe('readGrant', () => {
	it('grants a public key the bundled manifest asks for', () => {
		expect(readGrant('mapillo', 'map.tile_sources')).toBe('map.tile_sources')
	})

	it('refuses a key that is not public', () => {
		expect(readGrant('mapillo', 'federation.peers')).toBeUndefined()
	})

	it('refuses an app that is not bundled', () => {
		expect(readGrant('evil', 'map.tile_sources')).toBeUndefined()
	})
})

// vim: ts=4

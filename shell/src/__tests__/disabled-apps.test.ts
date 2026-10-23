// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { applyTileSourcesSetting, disabledApps, withoutDisabledApps } from '../disabled-apps.js'
import type { AppConfigState } from '../utils.js'

const config: AppConfigState = {
	apps: [
		{ id: 'mapillo', url: 'm' },
		{ id: 'quillo', url: 'q' }
	],
	mime: { 'cloudillo/mapillo': 'mapillo' },
	menu: [
		{ id: 'mapillo', label: 'Maps', path: 'app/mapillo' },
		{ id: 'quillo', label: 'Quillo', path: 'app/quillo' }
	],
	defaultMenu: 'mapillo'
}

afterEach(() => {
	disabledApps.clear()
})

describe('withoutDisabledApps', () => {
	it('returns the config unchanged when nothing is disabled', () => {
		expect(withoutDisabledApps(config)).toBe(config)
	})

	it('drops a disabled app and moves the default menu to the first remaining item', () => {
		disabledApps.add('mapillo')
		const out = withoutDisabledApps(config)
		expect(out.apps.map((a) => a.id)).toEqual(['quillo'])
		expect(out.menu.map((m) => m.id)).toEqual(['quillo'])
		expect(out.defaultMenu).toBe('quillo')
		// The MIME map keeps it, so opening such a file can explain why
		expect(out.mime).toEqual(config.mime)
	})
})

describe('applyTileSourcesSetting', () => {
	it('disables Mapillo for an explicit empty list', () => {
		applyTileSourcesSetting([])
		expect(disabledApps.has('mapillo')).toBe(true)
	})

	it.each([[[{ name: 'A', url: 'https://a', attribution: '' }]], [undefined], [null]])(
		'leaves Mapillo enabled for %p',
		(value) => {
			applyTileSourcesSetting(value)
			expect(disabledApps.has('mapillo')).toBe(false)
		}
	)

	it('re-enables Mapillo after a disable', () => {
		applyTileSourcesSetting([])
		applyTileSourcesSetting(undefined)
		expect(disabledApps.has('mapillo')).toBe(false)
	})
})

// vim: ts=4

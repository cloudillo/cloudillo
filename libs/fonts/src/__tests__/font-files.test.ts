// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { existsSync } from 'node:fs'
import { getFontFileUrl } from '../font-files'
import { FONTS } from '../metadata'

describe('getFontFileUrl', () => {
	it('falls back to the faces a family ships', () => {
		expect(getFontFileUrl('Bebas Neue', 'bold', 'italic')).toBe(
			'/fonts/bebas-neue/BebasNeue-Regular.ttf'
		)
		expect(getFontFileUrl('Oswald', 'bold', 'italic')).toBe('/fonts/oswald/Oswald-Bold.ttf')
		expect(getFontFileUrl('Lato', 'bold', 'italic')).toBe('/fonts/lato/Lato-BoldItalic.ttf')
	})

	it('never points at a missing file', () => {
		for (const { family } of FONTS) {
			for (const w of ['normal', 'bold'] as const) {
				for (const s of ['normal', 'italic'] as const) {
					const url = getFontFileUrl(family, w, s) as string
					expect([family, existsSync(`fonts${url.slice('/fonts'.length)}`)]).toEqual([
						family,
						true
					])
				}
			}
		}
	})
})

// vim: ts=4

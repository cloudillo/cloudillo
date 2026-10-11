// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { sanitizeFilename } from '../file-utils.js'

describe('sanitizeFilename', () => {
	it('keeps accents and spaces, replaces filesystem-reserved characters', () => {
		expect(sanitizeFilename('Előadás: Q3')).toBe('Előadás_ Q3')
		expect(sanitizeFilename(' a/b\\c*?"<>|\x01 ')).toBe('a_b_c_______')
	})

	it('never returns an empty, hidden or dot-only name', () => {
		expect(sanitizeFilename('')).toBe('_')
		expect(sanitizeFilename('   ')).toBe('_')
		expect(sanitizeFilename('..')).toBe('_')
		expect(sanitizeFilename(' .hidden')).toBe('hidden')
		expect(sanitizeFilename('a.b')).toBe('a.b')
		expect(sanitizeFilename('a. . ')).toBe('a')
	})

	it('strips bidi controls and prefixes Windows device names', () => {
		expect(sanitizeFilename('ann\u202Etxt.exe')).toBe('anntxt.exe')
		expect(sanitizeFilename('CON')).toBe('_CON')
		expect(sanitizeFilename('lpt1.pdf')).toBe('_lpt1.pdf')
		expect(sanitizeFilename('console')).toBe('console')
	})
})

// vim: ts=4

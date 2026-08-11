// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { colord, extend } from 'colord'
import lchPlugin from 'colord/plugins/lch'

import { idAccent, idHue } from '../utils'

extend([lchPlugin])

describe('idHue', () => {
	it('is deterministic', () => {
		expect(idHue('@alice.example.com')).toBe(idHue('@alice.example.com'))
	})

	it('stays within [0, 360)', () => {
		for (const seed of ['', 'a', '@bob.example.com', '12345', 'ünïcödé', '🎈']) {
			const hue = idHue(seed)
			expect(hue).toBeGreaterThanOrEqual(0)
			expect(hue).toBeLessThan(360)
			expect(Number.isInteger(hue)).toBe(true)
		}
	})

	it('separates similar seeds', () => {
		// Presence seeds are often adjacent clientIds, so near-inputs must not collide
		const hues = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((n) => idHue(`user${n}`)))
		expect(hues.size).toBe(8)
	})
})

describe('idAccent', () => {
	it('is stable for a seed and theme', () => {
		expect(idAccent('@alice.example.com')).toBe(idAccent('@alice.example.com'))
		expect(idAccent('@alice.example.com', true)).toBe(idAccent('@alice.example.com', true))
	})

	it('separates seeds the way idHue does', () => {
		expect(idAccent('@alice.example.com')).not.toBe(idAccent('@bob.example.com'))
	})

	// Carets and ghost strokes are painted on the app's own background, so the
	// dark-mode accent has to be the lighter of the two.
	it('lightens for a dark background', () => {
		const light = colord(idAccent('@alice.example.com', false))
		const dark = colord(idAccent('@alice.example.com', true))
		expect(dark.brightness()).toBeGreaterThan(light.brightness())
	})
})

// vim: ts=4

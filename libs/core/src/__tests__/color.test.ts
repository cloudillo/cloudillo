// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getContrastColor, hexToRgb, isLightColor, luma, rgbToHex } from '../color'

describe('hexToRgb', () => {
	it('expands the 3-digit form', () => {
		expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 })
		expect(hexToRgb('#08f')).toEqual({ r: 0, g: 136, b: 255 })
	})

	it('accepts a missing leading #', () => {
		expect(hexToRgb('fff')).toEqual({ r: 255, g: 255, b: 255 })
		expect(hexToRgb('ff8800')).toEqual({ r: 255, g: 136, b: 0 })
	})

	it('parses the 6-digit form', () => {
		expect(hexToRgb('#ff8800')).toEqual({ r: 255, g: 136, b: 0 })
		expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
	})

	it('ignores the alpha channel of the 4- and 8-digit forms', () => {
		expect(hexToRgb('#abcd')).toEqual(hexToRgb('#aabbcc'))
		expect(hexToRgb('#aabbccdd')).toEqual(hexToRgb('#aabbcc'))
		expect(hexToRgb('#ff880080')).toEqual({ r: 255, g: 136, b: 0 })
	})

	it('returns null for anything else', () => {
		for (const bad of ['', '#', '#ff', '#fffff', '#fffffff', '#gggggg', 'rgb(1,2,3)']) {
			expect(hexToRgb(bad)).toBeNull()
		}
	})
})

describe('rgbToHex', () => {
	it('round-trips through hexToRgb', () => {
		expect(rgbToHex(255, 136, 0)).toBe('#ff8800')
		expect(hexToRgb(rgbToHex(1, 2, 3))).toEqual({ r: 1, g: 2, b: 3 })
	})

	it('clamps out-of-range components', () => {
		expect(rgbToHex(-20, 300, 128)).toBe('#00ff80')
	})

	it('rounds fractional components', () => {
		expect(rgbToHex(0.4, 0.6, 254.5)).toBe('#0001ff')
	})
})

describe('luma', () => {
	it('spans 0..1 for black and white', () => {
		expect(luma('#000000')).toBe(0)
		expect(luma('#ffffff')).toBe(1)
	})

	it('weights green heaviest (BT.601, not WCAG)', () => {
		const [r, g, b] = ['#ff0000', '#00ff00', '#0000ff'].map((c) => luma(c) as number)
		expect(g).toBeGreaterThan(r)
		expect(r).toBeGreaterThan(b)
		expect(g).toBeCloseTo(0.587, 3)
	})

	it('returns null for an unparseable colour', () => {
		expect(luma('nope')).toBeNull()
	})
})

describe('isLightColor / getContrastColor', () => {
	it('classifies the extremes', () => {
		expect(isLightColor('#ffffff')).toBe(true)
		expect(isLightColor('#000000')).toBe(false)
	})

	it('treats an unparseable colour as dark', () => {
		expect(isLightColor('nope')).toBe(false)
	})

	it('picks the contrasting ink', () => {
		expect(getContrastColor('#ffffff')).toBe('#000000')
		expect(getContrastColor('#000000')).toBe('#ffffff')
	})
})

// vim: ts=4

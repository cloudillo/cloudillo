// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from '@jest/globals'

import { FX, fxToPt, ptToFx, unitsToFx } from '../fixed.js'

describe('fixed point', () => {
	it('uses 1/1024 pt', () => {
		expect(FX).toBe(1024)
		expect(ptToFx(1)).toBe(1024)
		expect(ptToFx(0.5)).toBe(512)
		expect(ptToFx(11)).toBe(11264)
	})

	it('rounds points to an integer', () => {
		expect(ptToFx(0.0004)).toBe(0)
		expect(ptToFx(0.001)).toBe(1)
		expect(Number.isInteger(ptToFx(12.3456))).toBe(true)
	})

	it('converts back to points', () => {
		expect(fxToPt(1536)).toBe(1.5)
		expect(fxToPt(ptToFx(72))).toBe(72)
	})

	it('scales font units with one rounding at the end', () => {
		expect(unitsToFx(1000, ptToFx(10), 1000)).toBe(10240)
		expect(unitsToFx(1, 1024, 3)).toBe(341)
		expect(unitsToFx(2, 1024, 3)).toBe(683)
		expect(unitsToFx(-500, ptToFx(12), 2048)).toBe(-3000)
		expect(unitsToFx(0, ptToFx(12), 2048)).toBe(0)
	})

	it('always yields integers', () => {
		for (let u = -2000; u <= 2000; u += 37)
			for (const size of [1, 999, ptToFx(9.5), ptToFx(72)])
				for (const upem of [1000, 1024, 2048])
					expect(Number.isInteger(unitsToFx(u, size, upem))).toBe(true)
	})
})

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PolygonPreset } from '../tools/shape-presets.js'
import {
	POLYGON_PRESETS,
	polygonPresetPoints,
	polygonPresetVertices
} from '../tools/shape-presets.js'

const PRESETS = Object.keys(POLYGON_PRESETS) as PolygonPreset[]

describe('polygon presets', () => {
	it('keeps every preset vertex inside the unit square', () => {
		for (const preset of PRESETS) {
			for (const [nx, ny] of POLYGON_PRESETS[preset]) {
				expect(nx).toBeGreaterThanOrEqual(0)
				expect(nx).toBeLessThanOrEqual(1)
				expect(ny).toBeGreaterThanOrEqual(0)
				expect(ny).toBeLessThanOrEqual(1)
			}
		}
	})

	it('touches all four sides of the box, so the drag reads as the outline', () => {
		for (const preset of PRESETS) {
			const xs = POLYGON_PRESETS[preset].map(([x]) => x)
			const ys = POLYGON_PRESETS[preset].map(([, y]) => y)
			expect(Math.min(...xs)).toBe(0)
			expect(Math.max(...xs)).toBe(1)
			expect(Math.min(...ys)).toBe(0)
			expect(Math.max(...ys)).toBe(1)
		}
	})

	it('scales into a box exactly', () => {
		expect(polygonPresetVertices('diamond', { x: 100, y: 200, width: 40, height: 60 })).toEqual(
			[
				[120, 200],
				[140, 230],
				[120, 260],
				[100, 230]
			]
		)
		expect(polygonPresetVertices('triangle', { x: 0, y: 0, width: 10, height: 20 })).toEqual([
			[5, 0],
			[10, 20],
			[0, 20]
		])
	})

	// A click rather than a drag still reaches here; it must degenerate to a point, not to NaN
	it('degenerates a zero-sized box without producing NaN', () => {
		for (const preset of PRESETS) {
			const vertices = polygonPresetVertices(preset, { x: 5, y: 7, width: 0, height: 0 })
			for (const [x, y] of vertices) {
				expect(x).toBe(5)
				expect(y).toBe(7)
			}
		}
	})

	it('emits SVG points for a preset and nothing for another preview type', () => {
		expect(polygonPresetPoints('triangle', { x: 0, y: 0, width: 2, height: 2 })).toBe(
			'1,0 2,2 0,2'
		)
		expect(polygonPresetPoints('rect', { x: 0, y: 0, width: 2, height: 2 })).toBeNull()
		expect(polygonPresetPoints('connector', { x: 0, y: 0, width: 2, height: 2 })).toBeNull()
	})
})

// vim: ts=4

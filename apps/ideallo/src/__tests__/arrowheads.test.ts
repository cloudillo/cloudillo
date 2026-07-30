// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	arrowheadBaseLength,
	arrowheadExtent,
	arrowheadGeometry,
	dirToVector
} from '../connectors/arrowheads.js'
import type { ArrowheadType, ArrowStyle, Dir } from '../crdt/runtime-types.js'

type Pt = [number, number]

const SHAPES: ArrowheadType[] = ['arrow', 'triangle', 'circle', 'diamond', 'bar']
const DIRS: Dir[] = ['e', 's', 'w', 'n']
const AT: Pt = [100, 100]

/** Every coordinate the path mentions, so we can assert it stays near the tip */
function pathNumbers(d: string): number[] {
	return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
}

describe('arrowheadGeometry', () => {
	it('returns null for none', () => {
		expect(arrowheadGeometry({ type: 'none' }, AT, [1, 0], 2)).toBeNull()
		expect(arrowheadGeometry(undefined, AT, [1, 0], 2)).toBeNull()
	})

	it('returns null for a zero-length direction', () => {
		expect(arrowheadGeometry({ type: 'arrow' }, AT, [0, 0], 2)).toBeNull()
	})

	it.each(SHAPES)('produces valid path data for %s at every cardinal angle', (type) => {
		for (const dir of DIRS) {
			const geo = arrowheadGeometry({ type }, AT, dirToVector(dir), 2)
			expect(geo).not.toBeNull()
			expect(geo?.d).toMatch(/^M /)
			const nums = pathNumbers(geo!.d)
			expect(nums.length).toBeGreaterThan(1)
			expect(nums.every((n) => Number.isFinite(n))).toBe(true)
		}
	})

	it.each(SHAPES)('keeps %s within its base length of the tip', (type) => {
		const style: ArrowStyle = { type }
		const base = arrowheadBaseLength(style, 2)
		const geo = arrowheadGeometry(style, AT, [1, 0], 2)!
		// Coordinates come in x,y pairs for every command in these paths except the arc radii,
		// so just assert nothing strays further than the base length from the tip on either axis
		for (const n of pathNumbers(geo.d)) {
			if (n === 0 || n === 1) continue // arc flags
			expect(Math.abs(n)).toBeLessThanOrEqual(100 + base + 1)
		}
	})

	it('scales with the size multiplier', () => {
		const small = arrowheadGeometry({ type: 'triangle' }, AT, [1, 0], 2)!
		const large = arrowheadGeometry({ type: 'triangle', size: 3 }, AT, [1, 0], 2)!
		const spread = (d: string) => {
			const n = pathNumbers(d)
			return Math.max(...n) - Math.min(...n)
		}
		expect(spread(large.d)).toBeGreaterThan(spread(small.d) * 2)
	})

	it('scales with stroke width', () => {
		expect(arrowheadBaseLength({ type: 'arrow' }, 2)).toBe(12) // floor
		expect(arrowheadBaseLength({ type: 'arrow' }, 10)).toBe(40)
		expect(arrowheadBaseLength({ type: 'arrow', size: 2 }, 10)).toBe(80)
	})

	it('leaves the open V unfilled with no inset', () => {
		const geo = arrowheadGeometry({ type: 'arrow' }, AT, [1, 0], 2)!
		expect(geo.filled).toBe(false)
		expect(geo.insetLength).toBe(0)
	})

	it.each(['triangle', 'diamond', 'circle'] as ArrowheadType[])(
		'insets the line for a filled %s',
		(type) => {
			const geo = arrowheadGeometry({ type }, AT, [1, 0], 2)!
			expect(geo.filled).toBe(true)
			expect(geo.insetLength).toBeGreaterThan(0)
		}
	)

	it.each(['triangle', 'diamond', 'circle'] as ArrowheadType[])(
		'drops the inset for a hollow %s',
		(type) => {
			const geo = arrowheadGeometry({ type, filled: false }, AT, [1, 0], 2)!
			expect(geo.filled).toBe(false)
			expect(geo.insetLength).toBe(0)
		}
	)

	it('leaves the bar unfilled with no inset', () => {
		const geo = arrowheadGeometry({ type: 'bar' }, AT, [1, 0], 2)!
		expect(geo.filled).toBe(false)
		expect(geo.insetLength).toBe(0)
	})

	it('orients with the direction rather than the position', () => {
		const east = arrowheadGeometry({ type: 'triangle' }, AT, [1, 0], 2)!
		const west = arrowheadGeometry({ type: 'triangle' }, AT, [-1, 0], 2)!
		expect(east.d).not.toBe(west.d)
		// Pointing east, the tail sits to the left of the tip; pointing west, to the right
		expect(Math.min(...pathNumbers(east.d))).toBeLessThan(100)
		expect(Math.max(...pathNumbers(west.d))).toBeGreaterThan(100)
	})

	it('accepts an unnormalized direction', () => {
		const unit = arrowheadGeometry({ type: 'triangle' }, AT, [1, 0], 2)!
		const long = arrowheadGeometry({ type: 'triangle' }, AT, [57, 0], 2)!
		expect(long.d).toBe(unit.d)
	})
})

describe('arrowheadExtent', () => {
	it('is zero for none', () => {
		expect(arrowheadExtent({ type: 'none' }, 2)).toBe(0)
		expect(arrowheadExtent(undefined, 2)).toBe(0)
	})

	it('covers the head so route bounds do not clip it', () => {
		expect(arrowheadExtent({ type: 'triangle', size: 2 }, 4)).toBe(32)
	})
})

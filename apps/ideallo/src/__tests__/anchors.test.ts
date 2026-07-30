// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	ANCHOR_CODES,
	anchorHandlePoints,
	anchorSideDir,
	anchorToLocal,
	anchorWorldPoint,
	freeAnchorFromPoint,
	nearestAnchorCode
} from '../connectors/anchors.js'
import type { ShapeGeometry } from '../connectors/types.js'
import { toObjectId } from '../crdt/ids.js'
import type { AnchorPointType, ObjectType } from '../crdt/runtime-types.js'

type Pt = [number, number]

function shape(over: Partial<ShapeGeometry> = {}): ShapeGeometry {
	return {
		id: toObjectId('s1'),
		type: 'rect' as ObjectType,
		bounds: { x: 100, y: 100, width: 100, height: 100 },
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		...over
	}
}

function closeTo(actual: Pt, expected: Pt, precision = 6) {
	expect(actual[0]).toBeCloseTo(expected[0], precision)
	expect(actual[1]).toBeCloseTo(expected[1], precision)
}

describe('anchorToLocal', () => {
	it('returns null for auto - it has no fixed position by definition', () => {
		expect(anchorToLocal('auto')).toBeNull()
		expect(anchorToLocal(undefined)).toBeNull()
	})

	it('maps every named code', () => {
		for (const code of ANCHOR_CODES) {
			const local = anchorToLocal(code)
			expect(local).not.toBeNull()
			expect(local?.[0]).toBeGreaterThanOrEqual(0)
			expect(local?.[0]).toBeLessThanOrEqual(1)
		}
	})

	it('clamps a free point into 0..1', () => {
		expect(anchorToLocal({ x: -3, y: 7 })).toEqual([0, 1])
	})
})

describe('anchorWorldPoint at rotation 0', () => {
	it.each<[AnchorPointType, Pt]>([
		['top-left', [100, 100]],
		['top', [150, 100]],
		['top-right', [200, 100]],
		['right', [200, 150]],
		['bottom-right', [200, 200]],
		['bottom', [150, 200]],
		['bottom-left', [100, 200]],
		['left', [100, 150]],
		['center', [150, 150]]
	])('places %s correctly', (code, expected) => {
		closeTo(anchorWorldPoint(shape(), code), expected)
	})

	it('resolves auto to the shape centre', () => {
		closeTo(anchorWorldPoint(shape(), 'auto'), [150, 150])
	})

	it('places a free point', () => {
		closeTo(anchorWorldPoint(shape(), { x: 0.25, y: 0.75 }), [125, 175])
	})
})

describe('anchorWorldPoint under rotation', () => {
	it('rotates 90 degrees about the centre', () => {
		// Clockwise in screen space: the top-left corner lands where top-right was
		closeTo(anchorWorldPoint(shape({ rotation: 90 }), 'top-left'), [200, 100])
		closeTo(anchorWorldPoint(shape({ rotation: 90 }), 'left'), [150, 100])
	})

	it('keeps the centre fixed at any angle', () => {
		for (const rotation of [0, 37, 90, 180, 270]) {
			closeTo(anchorWorldPoint(shape({ rotation }), 'center'), [150, 150])
		}
	})

	it('preserves distance from the centre at 37 degrees', () => {
		const p = anchorWorldPoint(shape({ rotation: 37 }), 'top-left')
		expect(Math.hypot(p[0] - 150, p[1] - 150)).toBeCloseTo(Math.hypot(50, 50), 6)
	})

	it('rotates about an off-centre pivot', () => {
		// Pivot at the top-left corner: rotating 180 degrees puts the centre opposite it
		const s = shape({ rotation: 180, pivotX: 0, pivotY: 0 })
		closeTo(anchorWorldPoint(s, 'top-left'), [100, 100])
		closeTo(anchorWorldPoint(s, 'center'), [50, 50])
	})
})

describe('anchorSideDir', () => {
	it.each<[AnchorPointType, string | null]>([
		['top', 'n'],
		['top-left', 'n'],
		['right', 'e'],
		['bottom', 's'],
		['left', 'w'],
		['center', null],
		['auto', null]
	])('gives %s the side %s', (code, expected) => {
		expect(anchorSideDir(shape(), code)).toBe(expected)
	})

	it('rotates the side with the shape', () => {
		expect(anchorSideDir(shape({ rotation: 90 }), 'right')).toBe('s')
		expect(anchorSideDir(shape({ rotation: 180 }), 'right')).toBe('w')
		// 270 degrees clockwise turns "up" into "left"
		expect(anchorSideDir(shape({ rotation: 270 }), 'top')).toBe('w')
		expect(anchorSideDir(shape({ rotation: 90 }), 'top')).toBe('e')
	})

	it('gives an edge-hugging free point the nearest side', () => {
		expect(anchorSideDir(shape(), { x: 0.02, y: 0.5 })).toBe('w')
		expect(anchorSideDir(shape(), { x: 0.5, y: 0.98 })).toBe('s')
	})

	it('gives a free point floating in the middle no side', () => {
		expect(anchorSideDir(shape(), { x: 0.5, y: 0.5 })).toBeNull()
	})

	// A corner point is exactly as close to its two edges, so the tie-break alone decides the dock
	// direction. Every peer derives routes independently, so the order is pinned here: a plain
	// code-unit compare of 'e' < 'n' < 's' < 'w', NOT localeCompare, which is locale-sensitive by
	// contract and could reorder these under another collation.
	it.each<[number, number, string]>([
		[0.1, 0.1, 'n'],
		[0.9, 0.1, 'e'],
		[0.9, 0.9, 'e'],
		[0.1, 0.9, 's']
	])('breaks the tie at the corner (%s, %s) toward %s', (x, y, expected) => {
		expect(anchorSideDir(shape(), { x, y })).toBe(expected)
	})
})

describe('nearestAnchorCode', () => {
	it('snaps to the anchor under the pointer', () => {
		expect(nearestAnchorCode(shape(), [198, 152], 15)).toBe('right')
		expect(nearestAnchorCode(shape(), [103, 103], 15)).toBe('top-left')
	})

	it('returns null outside the threshold, so the caller falls through to auto', () => {
		expect(nearestAnchorCode(shape(), [140, 140], 5)).toBeNull()
	})

	it('honours the threshold exactly', () => {
		expect(nearestAnchorCode(shape(), [150, 110], 10)).toBe('top')
		// One pixel further and nothing is in range - the caller falls through to auto
		expect(nearestAnchorCode(shape(), [150, 111], 10)).toBeNull()
	})

	it('works on a rotated shape', () => {
		const s = shape({ rotation: 90 })
		expect(nearestAnchorCode(s, anchorWorldPoint(s, 'bottom-left'), 2)).toBe('bottom-left')
	})
})

describe('freeAnchorFromPoint', () => {
	it('normalizes a point inside the shape', () => {
		expect(freeAnchorFromPoint(shape(), [125, 175])).toEqual({ x: 0.25, y: 0.75 })
	})

	it('clamps a point outside the shape', () => {
		expect(freeAnchorFromPoint(shape(), [0, 500])).toEqual({ x: 0, y: 1 })
	})

	it('round-trips through anchorWorldPoint on a rotated shape', () => {
		const s = shape({ rotation: 37 })
		const world = anchorWorldPoint(s, { x: 0.3, y: 0.8 })
		const back = freeAnchorFromPoint(s, world)
		expect(back.x).toBeCloseTo(0.3, 6)
		expect(back.y).toBeCloseTo(0.8, 6)
	})

	it('survives zero-size bounds', () => {
		const s = shape({ bounds: { x: 10, y: 10, width: 0, height: 0 } })
		expect(freeAnchorFromPoint(s, [10, 10])).toEqual({ x: 0.5, y: 0.5 })
	})
})

describe('anchorHandlePoints', () => {
	it('returns all 9 named anchors', () => {
		const points = anchorHandlePoints(shape())
		expect(points).toHaveLength(9)
		expect(new Set(points.map((p) => p.anchor)).size).toBe(9)
	})
})

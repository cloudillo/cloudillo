// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	exitSegmentRect,
	intersectRayEllipse,
	intersectRayPolygon,
	intersectSegmentRect,
	intersectSegmentSegment,
	pointInRect,
	segmentPenetratesRect,
	shapeExitPoint,
	shapePadded
} from '../connectors/shape-outline.js'
import type { ShapeGeometry } from '../connectors/types.js'
import { toObjectId } from '../crdt/ids.js'
import type { Bounds, ObjectType } from '../crdt/runtime-types.js'
import { rotatePoint } from '../utils/geometry.js'

type Pt = [number, number]

const BOX: Bounds = { x: 100, y: 100, width: 100, height: 100 } // 100,100 .. 200,200

function shape(over: Partial<ShapeGeometry> = {}): ShapeGeometry {
	return {
		id: toObjectId('s1'),
		type: 'rect' as ObjectType,
		bounds: BOX,
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		...over
	}
}

/** A triangle filling the unit-ish box 0,0 .. 100,100, apex up */
const TRIANGLE_BOX: Bounds = { x: 0, y: 0, width: 100, height: 100 }
const TRIANGLE_VERTS: Pt[] = [
	[50, 0],
	[100, 100],
	[0, 100]
]

function triangle(over: Partial<ShapeGeometry> = {}): ShapeGeometry {
	return shape({
		type: 'polygon' as ObjectType,
		bounds: TRIANGLE_BOX,
		vertices: TRIANGLE_VERTS,
		...over
	})
}

const TRIANGLE_CENTRE: Pt = [50, 50]

function closeTo(actual: Pt, expected: Pt, precision = 6) {
	expect(actual[0]).toBeCloseTo(expected[0], precision)
	expect(actual[1]).toBeCloseTo(expected[1], precision)
}

describe('intersectSegmentSegment', () => {
	it('finds a crossing', () => {
		closeTo(intersectSegmentSegment([0, 0], [10, 10], [0, 10], [10, 0]) as Pt, [5, 5])
	})

	it('returns null for parallel segments', () => {
		expect(intersectSegmentSegment([0, 0], [10, 0], [0, 5], [10, 5])).toBeNull()
	})

	it('returns null when the segments do not overlap', () => {
		expect(intersectSegmentSegment([0, 0], [1, 1], [5, 10], [10, 5])).toBeNull()
	})

	it('finds a touching endpoint', () => {
		closeTo(intersectSegmentSegment([0, 0], [10, 0], [10, 0], [10, 10]) as Pt, [10, 0])
	})
})

describe('intersectSegmentRect', () => {
	it.each([
		['left', [0, 150] as Pt, [150, 150] as Pt, [100, 150] as Pt],
		['right', [300, 150] as Pt, [150, 150] as Pt, [200, 150] as Pt],
		['top', [150, 0] as Pt, [150, 150] as Pt, [150, 100] as Pt],
		['bottom', [150, 300] as Pt, [150, 150] as Pt, [150, 200] as Pt]
	])('hits the %s side', (_name, from, to, expected) => {
		closeTo(intersectSegmentRect(from, to, BOX) as Pt, expected)
	})

	it('returns the nearest crossing when the segment passes right through', () => {
		closeTo(intersectSegmentRect([0, 150], [300, 150], BOX) as Pt, [100, 150])
	})

	it('hits a corner exactly', () => {
		closeTo(intersectSegmentRect([0, 0], [150, 150], BOX) as Pt, [100, 100])
	})

	it('returns null when the segment misses', () => {
		expect(intersectSegmentRect([0, 0], [50, 50], BOX)).toBeNull()
	})

	it('returns null for a segment wholly inside', () => {
		expect(intersectSegmentRect([120, 120], [180, 180], BOX)).toBeNull()
	})

	it('handles a zero-size box', () => {
		const degenerate: Bounds = { x: 50, y: 50, width: 0, height: 0 }
		expect(intersectSegmentRect([0, 0], [100, 100], degenerate)).not.toBeUndefined()
	})
})

describe('exitSegmentRect', () => {
	it('returns the far crossing where intersectSegmentRect returns the near one', () => {
		closeTo(intersectSegmentRect([0, 150], [300, 150], BOX) as Pt, [100, 150])
		closeTo(exitSegmentRect([0, 150], [300, 150], BOX) as Pt, [200, 150])
	})

	it('agrees with the near crossing when there is only one', () => {
		closeTo(exitSegmentRect([0, 150], [150, 150], BOX) as Pt, [100, 150])
	})

	// The case the whole convention exists for: an anchor already sitting on the outline is a
	// zero-distance crossing, and a near-crossing exit would hand it straight back
	it('skips past a zero-distance crossing at the origin', () => {
		closeTo(exitSegmentRect([150, 100], [150, 500], BOX) as Pt, [150, 200])
	})

	it('returns null when the segment misses', () => {
		expect(exitSegmentRect([0, 0], [50, 50], BOX)).toBeNull()
	})
})

describe('pointInRect / segmentPenetratesRect', () => {
	it('treats edges as outside', () => {
		expect(pointInRect([150, 150], BOX)).toBe(true)
		expect(pointInRect([100, 150], BOX)).toBe(false)
		expect(pointInRect([50, 50], BOX)).toBe(false)
	})

	it('detects a segment crossing the interior', () => {
		expect(segmentPenetratesRect([0, 150], [300, 150], BOX)).toBe(true)
	})

	it('ignores a segment that only grazes an edge', () => {
		expect(segmentPenetratesRect([0, 100], [300, 100], BOX)).toBe(false)
	})

	it('ignores a segment that misses entirely', () => {
		expect(segmentPenetratesRect([0, 0], [50, 50], BOX)).toBe(false)
	})

	it('detects a segment starting inside', () => {
		expect(segmentPenetratesRect([150, 150], [400, 150], BOX)).toBe(true)
	})
})

describe('intersectRayEllipse', () => {
	it('exits a circle along an axis', () => {
		closeTo(intersectRayEllipse([0, 0], 10, 10, [0, 0], [1, 0]) as Pt, [10, 0])
		closeTo(intersectRayEllipse([0, 0], 10, 10, [0, 0], [0, -1]) as Pt, [0, -10])
	})

	it('respects unequal radii', () => {
		closeTo(intersectRayEllipse([0, 0], 20, 10, [0, 0], [0, 1]) as Pt, [0, 10])
	})

	it('returns null for a degenerate ellipse', () => {
		expect(intersectRayEllipse([0, 0], 0, 10, [0, 0], [1, 0])).toBeNull()
	})

	it('returns null for a zero direction', () => {
		expect(intersectRayEllipse([0, 0], 10, 10, [0, 0], [0, 0])).toBeNull()
	})

	it('takes the opposite root when asked for the far hit', () => {
		// Starting ON the outline: near is where it started, far is the other side
		closeTo(intersectRayEllipse([0, 0], 10, 10, [-10, 0], [1, 0]) as Pt, [-10, 0])
		closeTo(intersectRayEllipse([0, 0], 10, 10, [-10, 0], [1, 0], 'far') as Pt, [10, 0])
	})

	it('gives the same answer either way for a ray cast from the centre', () => {
		closeTo(intersectRayEllipse([0, 0], 10, 10, [0, 0], [1, 0], 'far') as Pt, [10, 0])
	})
})

describe('intersectRayPolygon', () => {
	const triangle: Pt[] = [
		[0, -10],
		[10, 10],
		[-10, 10]
	]

	it('exits through an edge', () => {
		const hit = intersectRayPolygon(triangle, [0, 0], [0, 1]) as Pt
		closeTo(hit, [0, 10])
	})

	it('returns null when the ray misses', () => {
		expect(intersectRayPolygon(triangle, [100, 100], [1, 0])).toBeNull()
	})

	it('returns null for a degenerate polygon', () => {
		expect(intersectRayPolygon([[0, 0]], [0, 0], [1, 0])).toBeNull()
	})
})

describe('shapeExitPoint', () => {
	it('leaves a rect through the facing side', () => {
		closeTo(shapeExitPoint(shape(), [150, 150], [400, 150]), [200, 150])
	})

	it('leaves an ellipse on its outline, not its box', () => {
		const hit = shapeExitPoint(shape({ type: 'ellipse' }), [150, 150], [400, 150])
		closeTo(hit, [200, 150])
		const diagonal = shapeExitPoint(shape({ type: 'ellipse' }), [150, 150], [400, 400])
		// On the ellipse the diagonal exit is at radius/sqrt(2), inside the box corner
		expect(diagonal[0]).toBeLessThan(200)
		expect(diagonal[0]).toBeCloseTo(150 + 50 / Math.SQRT2, 6)
	})

	it('follows a rotated rect', () => {
		// 90 degrees about the centre maps the box onto itself, so the exit is unchanged
		closeTo(shapeExitPoint(shape({ rotation: 90 }), [150, 150], [400, 150]), [200, 150])
	})

	it('exits a 45-degree rotated square through a corner when aimed at one', () => {
		const hit = shapeExitPoint(shape({ rotation: 45 }), [150, 150], [400, 150])
		// The rotated square's rightmost point is the corner, at half-diagonal from centre
		expect(hit[0]).toBeCloseTo(150 + (100 * Math.SQRT2) / 2, 4)
		expect(hit[1]).toBeCloseTo(150, 4)
	})

	it('falls back to the interior point when the direction is degenerate', () => {
		closeTo(shapeExitPoint(shape(), [150, 150], [150, 150]), [150, 150])
	})

	// An anchor on the outline facing the target is the only crossing, so it is honoured exactly
	it('honours an on-outline anchor that faces the target', () => {
		closeTo(shapeExitPoint(shape(), [200, 150], [400, 150]), [200, 150])
	})

	// Facing away, honouring it would draw the connector straight across the shape's own body
	it('slides an on-outline anchor that faces away to the far face', () => {
		closeTo(shapeExitPoint(shape(), [100, 150], [400, 150]), [200, 150])
		closeTo(shapeExitPoint(shape({ type: 'ellipse' }), [100, 150], [400, 150]), [200, 150])
	})

	it('slides a corner anchor past both of its zero-distance crossings', () => {
		closeTo(shapeExitPoint(shape(), [100, 100], [400, 400]), [200, 200])
	})
})

/**
 * An anchor is a position in the shape's BOUNDING BOX, so on a triangle the four corner codes and
 * both side codes sit in empty space outside the outline. Those used to be handed straight back -
 * the connector then ended at an empty bbox corner instead of on the shape.
 */
describe('shapeExitPoint on a shape that does not fill its box', () => {
	it("attaches a triangle's left anchor to the slanted left edge", () => {
		// The left edge runs (50,0) -> (0,100), so it is at x = 25 when y = 50
		closeTo(shapeExitPoint(triangle(), [0, 50], [-200, 50]), [25, 50])
	})

	it("attaches a triangle's top-left anchor, whose ray misses the outline entirely", () => {
		const hit = shapeExitPoint(triangle(), [0, 0], [-100, -100])
		// Radially outwards from the box centre, the corner projects onto the left edge
		closeTo(hit, [100 / 3, 100 / 3], 6)
	})

	it('leaves an anchor that already sits on the outline exactly where it is', () => {
		closeTo(shapeExitPoint(triangle(), [25, 50], [-200, 50]), [25, 50])
		// The apex is a vertex of the outline, so it is its own attachment too
		closeTo(shapeExitPoint(triangle(), [50, 0], [50, -200]), [50, 0])
	})

	it('still crosses the body when the anchor faces away from the target', () => {
		// From the left edge heading right: the far crossing is the right edge, not the anchor
		const hit = shapeExitPoint(triangle(), [0, 50], [400, 50])
		closeTo(hit, [75, 50])
	})

	it('follows a rotated triangle, attaching on the rotated outline', () => {
		const rotation = 45
		const turn = (p: Pt): Pt => rotatePoint(p, TRIANGLE_CENTRE, rotation)
		const hit = shapeExitPoint(triangle({ rotation }), turn([0, 50]), turn([-200, 50]))
		closeTo(hit, turn([25, 50]))
	})

	it("attaches an ellipse's top-left anchor to the ellipse, not the box corner", () => {
		const hit = shapeExitPoint(shape({ type: 'ellipse' as ObjectType }), [100, 100], [0, 0])
		const offset = 50 / Math.SQRT2
		closeTo(hit, [150 - offset, 150 - offset])
		// On the outline: (dx/rx)^2 + (dy/ry)^2 === 1
		const nx = (hit[0] - 150) / 50
		const ny = (hit[1] - 150) / 50
		expect(nx * nx + ny * ny).toBeCloseTo(1, 6)
	})
})

describe('shapePadded', () => {
	it('grows an unrotated box evenly', () => {
		expect(shapePadded(shape(), 10)).toEqual({ x: 90, y: 90, width: 120, height: 120 })
	})

	it('uses the world AABB of a rotated box', () => {
		const padded = shapePadded(shape({ rotation: 45 }), 0)
		const half = (100 * Math.SQRT2) / 2
		expect(padded.x).toBeCloseTo(150 - half, 6)
		expect(padded.width).toBeCloseTo(half * 2, 6)
	})

	it('measures an unrotated polygon by its box, which is its vertex box', () => {
		expect(shapePadded(triangle(), 0)).toEqual(TRIANGLE_BOX)
	})

	// The box's corners sweep out over space the triangle never occupied, so measuring the
	// vertices keeps elbow routes from detouring around nothing
	it('measures a rotated polygon by its own vertices, not its box corners', () => {
		const padded = shapePadded(triangle({ rotation: 45 }), 0)
		const boxPadded = shapePadded(
			shape({ bounds: TRIANGLE_BOX, rotation: 45, type: 'rect' as ObjectType }),
			0
		)
		expect(padded.width).toBeLessThan(boxPadded.width)
		for (const v of TRIANGLE_VERTS) {
			const [x, y] = rotatePoint(v, TRIANGLE_CENTRE, 45)
			expect(x).toBeGreaterThanOrEqual(padded.x - 1e-9)
			expect(x).toBeLessThanOrEqual(padded.x + padded.width + 1e-9)
			expect(y).toBeGreaterThanOrEqual(padded.y - 1e-9)
			expect(y).toBeLessThanOrEqual(padded.y + padded.height + 1e-9)
		}
	})
})

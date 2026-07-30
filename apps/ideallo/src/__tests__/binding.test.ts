// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	anchorForPoint,
	anchorSnapRadiusWorld,
	findBindTargetShape,
	pointInShape,
	resolveBindTarget,
	SNAP_SCREEN_PIXELS,
	shouldShowAllAnchors
} from '../connectors/binding.js'
import { toShapeGeometry } from '../connectors/resolve.js'
import { toObjectId } from '../crdt/ids.js'
import type {
	EllipseObject,
	IdealloObject,
	PolygonObject,
	RectObject
} from '../crdt/runtime-types.js'
import { DEFAULT_STYLE } from '../crdt/runtime-types.js'

function rect(id: string, x: number, y: number, w = 100, h = 100, over: Partial<RectObject> = {}) {
	return {
		id: toObjectId(id),
		type: 'rect',
		x,
		y,
		width: w,
		height: h,
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		locked: false,
		style: { ...DEFAULT_STYLE },
		...over
	} as RectObject
}

const A = rect('a', 0, 0) // 0,0 .. 100,100
const B = rect('b', 50, 50) // overlaps A, drawn on top

/** Apex up at (50,0), base along y=100 - so both top corners of its box are empty */
function triangle(id: string, over: Partial<PolygonObject> = {}) {
	return {
		id: toObjectId(id),
		type: 'polygon',
		x: 0,
		y: 0,
		vertices: [
			[50, 0],
			[100, 100],
			[0, 100]
		],
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		locked: false,
		style: { ...DEFAULT_STYLE },
		...over
	} as PolygonObject
}

describe('pointInShape', () => {
	it('accepts the interior of a rect and rejects the outside', () => {
		const shape = toShapeGeometry(A)
		expect(pointInShape(shape, [50, 50])).toBe(true)
		expect(pointInShape(shape, [150, 50])).toBe(false)
	})

	it('respects an ellipse outline rather than its box', () => {
		const ellipse = { ...A, type: 'ellipse' } as unknown as EllipseObject
		const shape = toShapeGeometry(ellipse)
		expect(pointInShape(shape, [50, 50])).toBe(true)
		// Inside the box corner but outside the ellipse
		expect(pointInShape(shape, [3, 3])).toBe(false)
	})

	it('follows a rotated shape', () => {
		const shape = toShapeGeometry(rect('r', 0, 0, 200, 20, { rotation: 90 }))
		// The long axis is now vertical
		expect(pointInShape(shape, [100, 50])).toBe(true)
		expect(pointInShape(shape, [10, 10])).toBe(false)
	})

	it('respects a polygon outline rather than its box', () => {
		const shape = toShapeGeometry(triangle('t'))
		expect(pointInShape(shape, [50, 50])).toBe(true)
		// Inside the box, well outside the triangle
		expect(pointInShape(shape, [5, 5])).toBe(false)
	})

	it('follows a rotated polygon', () => {
		// 90 degrees about the box centre swings the apex from the top to the right
		const shape = toShapeGeometry(triangle('t', { rotation: 90 }))
		expect(pointInShape(shape, [50, 50])).toBe(true)
		expect(pointInShape(shape, [95, 50])).toBe(true)
		expect(pointInShape(shape, [50, 5])).toBe(false)
	})

	it('accepts a near miss only once a tolerance is given', () => {
		const shape = toShapeGeometry(triangle('t'))
		// A few units above the apex: outside the outline, but where the user is aiming
		expect(pointInShape(shape, [50, -4])).toBe(false)
		expect(pointInShape(shape, [50, -4], 8)).toBe(true)
		expect(pointInShape(shape, [50, -40], 8)).toBe(false)
	})
})

describe('findBindTargetShape', () => {
	const objects: IdealloObject[] = [A, B]

	it('returns the topmost shape under the point', () => {
		expect(findBindTargetShape(objects, [75, 75], { scale: 1 })?.id).toBe(B.id)
		expect(findBindTargetShape(objects, [10, 10], { scale: 1 })?.id).toBe(A.id)
	})

	it('returns null over empty canvas', () => {
		expect(findBindTargetShape(objects, [500, 500], { scale: 1 })).toBeNull()
	})

	// Self-loops need waypoints and are out of scope, so the invitation is never offered
	it('honours excludeId, which suppresses the source shape mid-draw', () => {
		expect(findBindTargetShape(objects, [75, 75], { scale: 1, excludeId: B.id })?.id).toBe(A.id)
		expect(findBindTargetShape([A], [10, 10], { scale: 1, excludeId: A.id })).toBeNull()
	})

	// Locking prevents moving, not being pointed at
	it('treats a locked shape as a valid target', () => {
		const locked = rect('locked', 200, 0, 100, 100, { locked: true })
		expect(findBindTargetShape([locked], [250, 50], { scale: 1 })?.id).toBe(locked.id)
	})

	// Almost the whole neighbourhood of a triangle's apex is outside the outline, so a strict
	// lookup refuses to bind exactly where the user is aiming
	it('binds to a point just outside a corner', () => {
		const t = triangle('t')
		expect(findBindTargetShape([t], [50, -3], { scale: 1 })?.id).toBe(t.id)
		expect(findBindTargetShape([t], [-3, 103], { scale: 1 })?.id).toBe(t.id)
		// The tolerance is in SCREEN pixels, so zoomed in it covers less world space
		expect(findBindTargetShape([t], [50, -3], { scale: 8 })).toBeNull()
	})

	// Widening in a single pass would let a shape higher in the z-order claim a point that
	// actually lies over a lower one
	it('prefers a strict hit on a lower shape to a near miss on a higher one', () => {
		const t = triangle('t')
		const under = rect('under', 0, 0, 100, 100)
		// (42,10) is inside the rect, and ~3 units off the triangle's slanted left edge
		expect(findBindTargetShape([under, t], [42, 10], { scale: 1 })?.id).toBe(under.id)
		// With nothing underneath, the same point is a near miss the triangle may claim
		expect(findBindTargetShape([t], [42, 10], { scale: 1 })?.id).toBe(t.id)
	})

	it('never binds to another connector', () => {
		const arrow = {
			id: toObjectId('arr'),
			type: 'connector',
			x: 0,
			y: 0,
			startX: 0,
			startY: 0,
			endX: 100,
			endY: 100,
			rotation: 0,
			pivotX: 0.5,
			pivotY: 0.5,
			locked: false,
			routing: 'straight',
			startArrow: { type: 'none' },
			endArrow: { type: 'arrow' },
			style: { ...DEFAULT_STYLE }
		} as IdealloObject
		expect(findBindTargetShape([arrow], [50, 50], { scale: 1 })).toBeNull()
	})
})

describe('the anchor rule', () => {
	const shape = toShapeGeometry(A)

	it('pins a code when the pointer is within snap range of a dot', () => {
		expect(anchorForPoint(shape, [100, 52], { scale: 1 })).toBe('right')
		expect(anchorForPoint(shape, [2, 2], { scale: 1 })).toBe('top-left')
	})

	// Alt is swallowed by the window manager on most Linux desktops, so a fall-through to 'auto'
	// would leave the 9 dots as the only anchors that exist in practice
	it('falls through to a free point when no dot is close enough', () => {
		expect(anchorForPoint(shape, [30, 70], { scale: 1 })).toEqual({ x: 0.3, y: 0.7 })
	})

	it('still snaps a drop inside a dot capture radius', () => {
		// 12 world units from the centre dot, inside the 15-unit radius this shape gets at 1:1
		expect(anchorForPoint(shape, [50, 62], { scale: 1 })).toBe('center')
		// Just outside it, so the drop keeps the position it was aimed at
		expect(anchorForPoint(shape, [50, 70], { scale: 1 })).toEqual({ x: 0.5, y: 0.7 })
	})

	it('normalizes a free anchor in the shape local frame, so rotation cannot move it', () => {
		const turned = toShapeGeometry(rect('t', 0, 0, 100, 100, { rotation: 90 }))
		// 90 degrees about the centre: the world point that was top-left is now bottom-left
		expect(anchorForPoint(turned, [0, 70], { scale: 1 })).toEqual({ x: 0.7, y: 1 })
	})

	it('places a free anchor only when precise mode is asked for, suppressing snapping', () => {
		expect(anchorForPoint(shape, [30, 70], { scale: 1, precise: true })).toEqual({
			x: 0.3,
			y: 0.7
		})
		// Right on top of an anchor dot, but precise mode wins
		expect(anchorForPoint(shape, [100, 50], { scale: 1, precise: true })).toEqual({
			x: 1,
			y: 0.5
		})
	})

	// ConnectorAnchorDots draws only the centre dot below ALL_ANCHORS_MIN_SCREEN (72 screen px), so
	// pinning a corner there would be an affordance the user was never shown
	it('offers only the anchors the dots are drawing at that scale', () => {
		// 100 world units at 0.5 is 50 on screen, under the threshold
		const small = anchorForPoint(shape, [2, 2], { scale: 0.5 })
		expect(small).not.toBe('top-left')
		expect(small).toEqual({ x: 0.02, y: 0.02 })

		// Same corner at 1:1, where all nine dots are drawn, still pins
		expect(anchorForPoint(shape, [2, 2], { scale: 1 })).toBe('top-left')
	})

	it('resolves a target and its anchor together', () => {
		expect(resolveBindTarget([A], [100, 50], { scale: 1 })).toEqual({
			objectId: A.id,
			anchor: 'right'
		})
		expect(resolveBindTarget([A], [30, 70], { scale: 1 })).toEqual({
			objectId: A.id,
			anchor: { x: 0.3, y: 0.7 }
		})
		// Off the shape entirely is still no binding at all - the fall-through is inside-only
		expect(resolveBindTarget([A], [900, 900], { scale: 1 })).toBeNull()
	})

	/**
	 * useConnectorEndpointDrag's resolveAt returns BOTH the bind and the target geometry, and gets
	 * them from one findBindTargetShape call rather than re-looking the shape up by id: the third
	 * O(n) pass was pure waste on an unthrottled pointermove, and nothing made the lookup agree
	 * with the hit test. This pins that the composition it replaced was equivalent.
	 */
	it('findBindTargetShape + anchorForPoint compose to exactly resolveBindTarget', () => {
		const objects = [A, B]
		for (const world of [
			[100, 50],
			[30, 70],
			[210, 10],
			[900, 900]
		] as [number, number][]) {
			const options = { scale: 1 }
			const shape = findBindTargetShape(objects, world, options)
			const bind = resolveBindTarget(objects, world, options)
			if (!shape) {
				expect(bind).toBeNull()
				continue
			}
			// The geometry belongs to the very object the bind names, by construction
			expect(bind?.objectId).toBe(shape.id)
			expect(bind?.anchor).toEqual(anchorForPoint(shape, world, options))
			// ...and is the SAME geometry toShapeGeometry would derive for it
			const named = objects.find((o) => o.id === bind?.objectId)
			expect(shape).toEqual(toShapeGeometry(named as (typeof objects)[number]))
		}
	})
})

describe('snap radius and dot density degrade with available room', () => {
	it('uses the full screen radius on a large shape at 1:1', () => {
		const big = toShapeGeometry(rect('big', 0, 0, 400, 400))
		expect(anchorSnapRadiusWorld(big, 1)).toBe(SNAP_SCREEN_PIXELS)
	})

	// Overlapping capture zones turn picking an anchor into a coin flip
	it('shrinks the radius so adjacent capture zones cannot overlap', () => {
		const small = toShapeGeometry(rect('small', 0, 0, 40, 40))
		const radius = anchorSnapRadiusWorld(small, 1)
		expect(radius).toBeLessThan(SNAP_SCREEN_PIXELS)
		// Spacing between adjacent dots is 20; two radii must fit inside it
		expect(radius * 2).toBeLessThan(20)
	})

	it('shrinks the radius when zoomed out, on any device', () => {
		const big = toShapeGeometry(rect('big', 0, 0, 400, 400))
		expect(anchorSnapRadiusWorld(big, 0.05) * 0.05).toBeLessThan(SNAP_SCREEN_PIXELS)
	})

	it('offers all 9 dots only when there is room on screen', () => {
		const big = toShapeGeometry(rect('big', 0, 0, 200, 200))
		expect(shouldShowAllAnchors(big, 1)).toBe(true)
		// Same shape zoomed out to 30% - the desktop case, not just mobile
		expect(shouldShowAllAnchors(big, 0.3)).toBe(false)
		const thin = toShapeGeometry(rect('thin', 0, 0, 400, 20))
		expect(shouldShowAllAnchors(thin, 1)).toBe(false)
	})
})

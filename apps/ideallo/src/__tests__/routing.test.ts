// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { ANCHOR_CODES, anchorWorldPoint } from '../connectors/anchors.js'
import { arrowheadExtent } from '../connectors/arrowheads.js'
import { pointInShape } from '../connectors/binding.js'
import { routeArc } from '../connectors/routing/arc.js'
import type { RouteRequest } from '../connectors/routing/common.js'
import {
	analyticElbow,
	DOCK,
	dockDistance,
	dockTerminal,
	obstaclePad,
	roundedPolylinePath,
	routeElbow,
	shapeObstacle
} from '../connectors/routing/elbow.js'
import { routeStraight, standoffGap } from '../connectors/routing/straight.js'
import { pointInRect, segmentPenetratesRect } from '../connectors/shape-outline.js'
import type { ShapeGeometry } from '../connectors/types.js'
import { toObjectId } from '../crdt/ids.js'
import type { AnchorPoint, ArrowStyle, Bounds, ObjectType } from '../crdt/runtime-types.js'

type Pt = [number, number]

function shape(id: string, bounds: Bounds, over: Partial<ShapeGeometry> = {}): ShapeGeometry {
	return {
		id: toObjectId(id),
		type: 'rect' as ObjectType,
		bounds,
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		...over
	}
}

const BOX_A = shape('a', { x: 0, y: 0, width: 100, height: 100 }) // centre 50,50
const BOX_B = shape('b', { x: 300, y: 0, width: 100, height: 100 }) // centre 350,50

function request(over: Partial<RouteRequest> = {}): RouteRequest {
	return {
		start: [50, 50],
		end: [350, 50],
		startShape: BOX_A,
		endShape: BOX_B,
		startArrow: { type: 'none' },
		endArrow: { type: 'arrow' },
		strokeWidth: 2,
		routing: 'straight',
		...over
	}
}

describe('routeStraight', () => {
	it('clips both terminals to the outlines with a standoff', () => {
		const route = routeStraight(request())
		const gap = standoffGap(2)
		expect(route.kind).toBe('straight')
		expect(route.points).toHaveLength(2)
		expect(route.points[0][0]).toBeCloseTo(100 + gap, 4)
		expect(route.points[1][0]).toBeCloseTo(300 - gap, 4)
		expect(route.points[0][1]).toBeCloseTo(50, 4)
	})

	it('leaves an unbound terminal exactly where it is', () => {
		const route = routeStraight(request({ endShape: undefined, end: [500, 500] }))
		expect(route.points[1]).toEqual([500, 500])
	})

	it('leaves the heads to be oriented from the segment', () => {
		const route = routeStraight(request())
		expect(route.startDir).toBeNull()
		expect(route.endDir).toBeNull()
	})

	it('grows bounds to cover a large filled head', () => {
		const plain = routeStraight(request())
		const big = routeStraight(request({ endArrow: { type: 'triangle', size: 4 } }))
		expect(big.bounds.width).toBeGreaterThan(plain.bounds.width)
	})

	it('emits a path that starts at the first point', () => {
		const route = routeStraight(request())
		expect(route.d.startsWith(`M ${route.points[0][0]} ${route.points[0][1]}`)).toBe(true)
	})
})

describe('routeArc', () => {
	it('emits a quadratic and a flattened polyline', () => {
		const route = routeArc(request({ routing: 'curved' }))
		expect(route.kind).toBe('curved')
		expect(route.d).toMatch(/^M .* Q /)
		expect(route.points.length).toBeGreaterThan(2)
	})

	it('keeps the exact terminals as the polyline endpoints', () => {
		const route = routeArc(request({ routing: 'curved' }))
		const straight = routeStraight(request())
		expect(route.points[0]).toEqual(straight.points[0])
		expect(route.points[route.points.length - 1]).toEqual(straight.points[1])
	})

	it('bows off the chord', () => {
		const route = routeArc(request({ routing: 'curved' }))
		const mid = route.points[Math.floor(route.points.length / 2)]
		// The chord is horizontal at y = 50, so a bowed curve must leave it
		expect(Math.abs(mid[1] - 50)).toBeGreaterThan(1)
	})

	// sign(dx * dy) rather than sign(dx) or sign(dy): both flip together when the shapes swap
	// sides, so the bend direction is stable instead of snapping as a shape crosses an axis.
	it('keeps the bend sign stable across all four quadrants', () => {
		const signs = [
			[1, 1],
			[-1, 1],
			[1, -1],
			[-1, -1]
		].map(([sx, sy]) => {
			const end: Pt = [50 + 300 * sx, 50 + 300 * sy]
			const route = routeArc(
				request({
					routing: 'curved',
					endShape: undefined,
					end
				})
			)
			const mid = route.points[Math.floor(route.points.length / 2)]
			// Which side of the chord the midpoint falls on
			const chord: Pt = [end[0] - route.points[0][0], end[1] - route.points[0][1]]
			const off: Pt = [mid[0] - route.points[0][0], mid[1] - route.points[0][1]]
			return Math.sign(chord[0] * off[1] - chord[1] * off[0])
		})
		// Diagonally opposite quadrants must bow the same way
		expect(signs[0]).toBe(signs[3])
		expect(signs[1]).toBe(signs[2])
	})

	it('degrades to a segment for a zero-length chord', () => {
		const route = routeArc(
			request({
				routing: 'curved',
				startShape: undefined,
				endShape: undefined,
				end: [50, 50]
			})
		)
		expect(route.points).toHaveLength(2)
	})
})

/**
 * Every anchor other than the centre already sits ON the outline, so a near-crossing exit convention
 * would hand it straight back and the standoff would then be applied INTO the shape.
 */
describe('a bound terminal never lands inside its own shape', () => {
	const AROUND: Pt[] = [
		[400, 0],
		[400, 400],
		[0, 400],
		[-400, 400],
		[-400, 0],
		[-400, -400],
		[0, -400],
		[400, -400]
	]
	// The 9 codes plus free anchors on an edge, at a corner and in the middle
	const ANCHORS: AnchorPoint[] = [
		...ANCHOR_CODES,
		{ x: 0.2, y: 0 },
		{ x: 1, y: 0.8 },
		{ x: 0, y: 1 },
		{ x: 0.5, y: 0.5 }
	]

	it.each(['straight', 'curved'] as const)('%s clips every anchor to the outline', (routing) => {
		for (const anchor of ANCHORS) {
			for (const [dx, dy] of AROUND) {
				const req = request({
					routing,
					startAnchor: anchor,
					start: anchorWorldPoint(BOX_A, anchor),
					endShape: undefined,
					end: [50 + dx, 50 + dy]
				})
				const route = routing === 'curved' ? routeArc(req) : routeStraight(req)
				expect(pointInShape(BOX_A, route.points[0])).toBe(false)
			}
		}
	})

	// The other half of the rule: an anchor that DOES face the target keeps its exact position
	it('attaches at the anchor itself when the target is on that side', () => {
		const route = routeStraight(
			request({
				startAnchor: 'right',
				start: anchorWorldPoint(BOX_A, 'right'),
				endShape: undefined,
				end: [400, 50]
			})
		)
		expect(route.points[0][0]).toBeCloseTo(100 + standoffGap(2), 4)
		expect(route.points[0][1]).toBeCloseTo(50, 4)
	})
})

describe('analyticElbow', () => {
	const dock = (point: Pt, d: Pt, dir: 'n' | 's' | 'e' | 'w' | null) => ({
		point,
		dock: d,
		dir
	})

	it('runs straight when the docks are aligned on one axis', () => {
		const pts = analyticElbow(
			dock([100, 50], [120, 50], 'e'),
			dock([300, 50], [280, 50], 'w'),
			[]
		)
		expect(pts.every((p) => p[1] === 50)).toBe(true)
	})

	it('makes a Z through the gap for facing horizontal sides', () => {
		const pts = analyticElbow(
			dock([100, 20], [120, 20], 'e'),
			dock([300, 200], [280, 200], 'w'),
			[]
		)
		expect(pts).toHaveLength(4)
		expect(pts[1][0]).toBeCloseTo(pts[2][0], 6) // the vertical run
	})

	it('turns once for perpendicular sides', () => {
		const pts = analyticElbow(
			dock([50, 100], [50, 120], 's'),
			dock([300, 200], [280, 200], 'w'),
			[]
		)
		expect(pts).toHaveLength(3)
	})

	it('is always axis-aligned', () => {
		const pts = analyticElbow(
			dock([100, 20], [120, 20], 'e'),
			dock([300, 200], [280, 200], 'w'),
			[]
		)
		for (let i = 0; i < pts.length - 1; i++) {
			const dx = Math.abs(pts[i][0] - pts[i + 1][0])
			const dy = Math.abs(pts[i][1] - pts[i + 1][1])
			expect(dx < 1e-6 || dy < 1e-6).toBe(true)
		}
	})

	it('detours around an obstacle a direct route would cut through', () => {
		const union: Bounds = { x: 60, y: 60, width: 200, height: 200 }
		const pts = analyticElbow(
			dock([50, 20], [50, 40], 'n'),
			dock([300, 300], [300, 320], 's'),
			[union]
		)
		for (let i = 0; i < pts.length - 1; i++) {
			const midX = (pts[i][0] + pts[i + 1][0]) / 2
			const midY = (pts[i][1] + pts[i + 1][1]) / 2
			const inside =
				midX > union.x &&
				midX < union.x + union.width &&
				midY > union.y &&
				midY < union.y + union.height
			expect(inside).toBe(false)
		}
	})
})

describe('dockTerminal', () => {
	it('pushes a pinned anchor out along its own side', () => {
		const d = dockTerminal(BOX_A, [100, 50], 'right', [350, 50], 2)
		expect(d.dir).toBe('e')
		expect(d.dock[0]).toBeGreaterThan(d.point[0])
		expect(d.point[1]).toBeCloseTo(50, 4)
	})

	it('picks the facing side for an auto anchor', () => {
		expect(dockTerminal(BOX_A, [50, 50], 'auto', [350, 50], 2).dir).toBe('e')
		expect(dockTerminal(BOX_A, [50, 50], 'auto', [50, 400], 2).dir).toBe('s')
		expect(dockTerminal(BOX_A, [50, 50], 'auto', [-400, 50], 2).dir).toBe('w')
	})

	it('breaks an exact diagonal tie toward the horizontal axis', () => {
		// There is no hysteresis to remember a previous axis - see autoSide's comment
		expect(dockTerminal(BOX_A, [50, 50], 'auto', [350, 350], 2).dir).toBe('e')
		expect(dockTerminal(BOX_A, [50, 50], 'auto', [350, 351], 2).dir).toBe('s')
	})

	it('leaves an unbound terminal undocked', () => {
		const d = dockTerminal(undefined, [10, 10], 'auto', [100, 100], 2)
		expect(d.dir).toBeNull()
		expect(d.dock).toEqual([10, 10])
	})
})

describe('routeElbow', () => {
	it('produces an axis-aligned polyline between two boxes', () => {
		const route = routeElbow(request({ routing: 'orthogonal' }))
		expect(route.kind).toBe('elbow')
		expect(route.points.length).toBeGreaterThanOrEqual(2)
		for (let i = 0; i < route.points.length - 1; i++) {
			const dx = Math.abs(route.points[i][0] - route.points[i + 1][0])
			const dy = Math.abs(route.points[i][1] - route.points[i + 1][1])
			expect(dx < 0.02 || dy < 0.02).toBe(true)
		}
	})

	it('reports the dock directions for arrowhead orientation', () => {
		const route = routeElbow(request({ routing: 'orthogonal' }))
		expect(route.startDir).toBe('e')
		expect(route.endDir).toBe('w')
	})

	it('never routes through either bound shape', () => {
		const route = routeElbow(
			request({
				routing: 'orthogonal',
				endShape: shape('b', { x: 0, y: 300, width: 100, height: 100 }),
				end: [50, 350]
			})
		)
		for (let i = 0; i < route.points.length - 1; i++) {
			const midX = (route.points[i][0] + route.points[i + 1][0]) / 2
			const midY = (route.points[i][1] + route.points[i + 1][1]) / 2
			expect(midX > 0 && midX < 100 && midY > 0 && midY < 100).toBe(false)
		}
	})

	it('handles overlapping shapes without throwing', () => {
		const overlapping = shape('b', { x: 50, y: 50, width: 100, height: 100 })
		const route = routeElbow(
			request({ routing: 'orthogonal', endShape: overlapping, end: [100, 100] })
		)
		expect(route.points.length).toBeGreaterThanOrEqual(2)
		expect(route.d).toMatch(/^M /)
	})

	it('handles a half-bound elbow', () => {
		const route = routeElbow(
			request({ routing: 'orthogonal', endShape: undefined, end: [400, 400] })
		)
		expect(route.points[route.points.length - 1]).toEqual([400, 400])
	})
})

/**
 * A* is an optimisation, never a dependency - it returns null on an exhausted budget, an enclosed
 * dock, or a grid too coarse to express the route. Taking the analytic route unchecked whenever
 * that happens draws an anchor pair that sends both docks the wrong way straight through a box, so
 * clearance decides first and cost only between two clear candidates.
 */
describe('routeElbow keeps the route out of the bound shapes', () => {
	const AWAY_FACING: [AnchorPoint, AnchorPoint][] = [
		['left', 'right'],
		['top', 'bottom'],
		['bottom', 'top'],
		['left', 'bottom'],
		['top', 'right']
	]

	it.each(AWAY_FACING)('clears both boxes for anchors %s / %s', (startAnchor, endAnchor) => {
		const route = routeElbow(
			request({
				routing: 'orthogonal',
				startAnchor,
				endAnchor,
				start: anchorWorldPoint(BOX_A, startAnchor),
				end: anchorWorldPoint(BOX_B, endAnchor)
			})
		)
		for (let i = 0; i < route.points.length - 1; i++) {
			const a = route.points[i]
			const b = route.points[i + 1]
			expect(segmentPenetratesRect(a, b, BOX_A.bounds)).toBe(false)
			expect(segmentPenetratesRect(a, b, BOX_B.bounds)).toBe(false)
		}
	})
})

/**
 * A size-3 filled triangle on a 12px stroke is ~144px long and trims the drawn path by ~130px, so a
 * fixed 20px + standoff first segment would let the head swallow its own corner.
 */
describe('elbow clearance scales with stroke width and arrowhead', () => {
	const BIG_HEAD: ArrowStyle = { type: 'triangle', size: 3, filled: true }

	it('keeps the no-head case byte-identical to the fixed constants', () => {
		expect(dockDistance(0)).toBe(DOCK)
		expect(obstaclePad(2)).toBe(obstaclePad(2, 0))
	})

	it('grows both clearances monotonically with the head', () => {
		expect(dockDistance(200)).toBeGreaterThan(dockDistance(100))
		expect(dockDistance(100)).toBeGreaterThan(dockDistance(0))
		expect(obstaclePad(2, 200)).toBeGreaterThan(obstaclePad(2, 100))
		expect(obstaclePad(2, 100)).toBeGreaterThan(obstaclePad(2, 0))
	})

	// The invariant that matters: the head always fits inside the run it points along
	it('never docks closer to the attachment than the head is long', () => {
		for (const strokeWidth of [1, 2, 6, 12, 20]) {
			for (const size of [1, 2, 3]) {
				const head = arrowheadExtent({ ...BIG_HEAD, size }, strokeWidth)
				expect(dockDistance(head)).toBeGreaterThanOrEqual(head)
			}
		}
	})

	it('pushes the dock past a large head end to end', () => {
		const req = request({ routing: 'orthogonal', strokeWidth: 12, endArrow: BIG_HEAD })
		const head = arrowheadExtent(BIG_HEAD, 12)
		const d = dockTerminal(
			BOX_B,
			anchorWorldPoint(BOX_B, 'left'),
			'left',
			[50, 50],
			12,
			head,
			shapeObstacle(BOX_B, req)
		)
		expect(Math.hypot(d.dock[0] - d.point[0], d.dock[1] - d.point[1])).toBeGreaterThanOrEqual(
			head
		)
	})

	it('rounds corners in proportion to the stroke', () => {
		const bent = request({
			routing: 'orthogonal',
			endShape: shape('c', { x: 600, y: 600, width: 100, height: 100 }),
			end: [650, 650]
		})
		// An open V head insets nothing, so `d` is exactly the path built from `points`
		const thin = routeElbow({ ...bent, strokeWidth: 2 })
		const thick = routeElbow({ ...bent, strokeWidth: 20 })
		expect(thin.d).toContain(' Q ')
		expect(thick.d).toContain(' Q ')
		// A 6px radius is invisible against a 20px stroke, so the join grows with it
		expect(thin.d).toBe(roundedPolylinePath(thin.points))
		expect(thick.d).toBe(roundedPolylinePath(thick.points, 30))
		expect(thick.d).not.toBe(roundedPolylinePath(thick.points))
	})
})

/**
 * Elbow routing keeps treating a rotated shape as its axis-aligned bounding box - the A* grid is
 * axis-aligned, as in draw.io. Only the docks are corrected, and that is enough: the exit point
 * follows the true rotated outline, and the dock is then cleared out of the padded AABB so the
 * search does not bail on an "enclosed" dock and fall back to a detour around an oversized box.
 */
describe('elbow docks on rotated shapes', () => {
	const SIDES = ANCHOR_CODES.filter((a) => a !== 'center')

	it.each([15, 30, 45, 60, 90])('keeps every dock clear at %s degrees', (rotation) => {
		const rot = shape('a', { x: 0, y: 0, width: 100, height: 100 }, { rotation })
		const req = request({ routing: 'orthogonal', startShape: rot })
		const obstacle = shapeObstacle(rot, req)
		for (const anchor of SIDES) {
			const d = dockTerminal(
				rot,
				anchorWorldPoint(rot, anchor),
				anchor,
				[350, 50],
				req.strokeWidth,
				0,
				obstacle
			)
			expect(pointInShape(rot, d.dock)).toBe(false)
			expect(pointInRect(d.dock, obstacle)).toBe(false)
			expect(pointInShape(rot, d.point)).toBe(false)
		}
	})

	it.each([15, 30, 45, 60, 90])('routes without starting inside the shape at %s degrees', (r) => {
		const rot = shape('a', { x: 0, y: 0, width: 100, height: 100 }, { rotation: r })
		for (const anchor of SIDES) {
			const route = routeElbow(
				request({
					routing: 'orthogonal',
					startShape: rot,
					startAnchor: anchor,
					start: anchorWorldPoint(rot, anchor)
				})
			)
			expect(route.points.length).toBeGreaterThanOrEqual(2)
			expect(pointInShape(rot, route.points[0])).toBe(false)
			for (let i = 0; i < route.points.length - 1; i++) {
				const dx = Math.abs(route.points[i][0] - route.points[i + 1][0])
				const dy = Math.abs(route.points[i][1] - route.points[i + 1][1])
				expect(dx < 0.02 || dy < 0.02).toBe(true)
			}
		}
	})

	// The clearance step must be a pure no-op on an upright shape
	it('leaves an unrotated dock exactly where it was before the clearance step', () => {
		const req = request({ routing: 'orthogonal' })
		const obstacle = shapeObstacle(BOX_A, req)
		const guarded = dockTerminal(BOX_A, [100, 50], 'right', [350, 50], 2, 0, obstacle)
		const plain = dockTerminal(BOX_A, [100, 50], 'right', [350, 50], 2)
		expect(guarded.dock).toEqual(plain.dock)
		expect(plain.dock).toEqual([100 + standoffGap(2) + DOCK, 50])
	})
})

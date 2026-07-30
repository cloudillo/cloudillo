// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Elbow (orthogonal) routing.
 *
 * Two layers: an analytic router that always succeeds, and an A* search over a small non-uniform
 * grid that avoids obstacles. A* runs first and falls back to the analytic route when it exhausts
 * its expansion budget or finds no path, so 'O' is never able to fail.
 */

import type { Bounds, Dir } from '../../crdt/index.js'
import { hypot } from '../../utils/geometry.js'
import { anchorSideDir, anchorWorldPoint } from '../anchors.js'
import { arrowheadExtent } from '../arrowheads.js'
import { pointInRect, shapeExitPoint, shapePadded } from '../shape-outline.js'
import type { ResolvedRoute, ShapeGeometry } from '../types.js'
import { shapeBoundsCenter } from '../types.js'
import { astarRoute } from './astar.js'
import type { RouteRequest } from './common.js'
import { collapseCollinear, finishRoute, polylinePath, roundPoint } from './common.js'
import { standoffGap } from './straight.js'

type Pt = [number, number]

/** Floor for how far a docked terminal is pushed out along its side normal */
export const DOCK = 20

/**
 * How far a docked terminal is pushed out before routing begins.
 *
 * Never less than the arrowhead: a size-3 triangle on a wide stroke is ~96px long and a filled
 * one also trims the drawn path by ~86px, so a fixed 20px dock puts the first corner somewhere
 * inside the head. The head has to fit inside its own straight run.
 */
export function dockDistance(headExtent: number): number {
	return Math.max(DOCK, headExtent * 1.25)
}

/**
 * Obstacle padding around a bound shape.
 *
 * The head term is deliberately damped - a corridor as wide as a large head would shove routes
 * absurdly far out, while the dock distance above is what actually has to clear it.
 */
export function obstaclePad(strokeWidth: number, headExtent = 0): number {
	return 6 + strokeWidth * 1.5 + headExtent * 0.25
}

/** Corner rounding floor, scaled up with the stroke so a wide line gets a proportionate corner */
const CORNER_RADIUS = 6

const DIR_VECTOR: Record<Dir, Pt> = {
	n: [0, -1],
	s: [0, 1],
	e: [1, 0],
	w: [-1, 0]
}

/** A terminal after docking: where the line attaches, and which way it leaves */
export interface Dock {
	point: Pt // on the shape outline (or the raw endpoint when unbound)
	dock: Pt // pushed out along the side normal
	dir: Dir | null
}

/**
 * Pick the side an auto anchor should use: the one whose outward normal best matches the
 * direction to the other shape.
 *
 * There is deliberately NO hysteresis, so a side can flicker while a shape is dragged past a
 * corner. Remembering last frame's axis needs a key per connector TERMINAL, and the only place to
 * hang it - GeometryOverrides - is keyed by SHAPE id, which cannot tell apart two arrows on the
 * same dragged box that want opposite axes. Add the state where it belongs before reviving this.
 */
export function autoSide(from: Pt, towards: Pt): Dir {
	const dx = towards[0] - from[0]
	const dy = towards[1] - from[1]
	const adx = Math.abs(dx)
	const ady = Math.abs(dy)
	if (adx === 0 && ady === 0) return 'e'

	if (adx >= ady) return dx >= 0 ? 'e' : 'w'
	return dy >= 0 ? 's' : 'n'
}

/**
 * Resolve one terminal into an attachment point, a dock point and a direction.
 *
 * An unbound terminal keeps its absolute point and gets no dock, so an elbow with one free end
 * still behaves like a plain polyline there.
 *
 * `obstacle` is the very padded box the router will use for this shape. Passing it lets a dock
 * on a ROTATED shape be nudged clear of it - see the clearance step below.
 */
export function dockTerminal(
	shape: ShapeGeometry | undefined,
	anchorPoint: Pt,
	anchor: RouteRequest['startAnchor'],
	towards: Pt,
	strokeWidth: number,
	headExtent = 0,
	obstacle?: Bounds
): Dock {
	if (!shape) return { point: anchorPoint, dock: anchorPoint, dir: null }

	const explicit = anchorSideDir(shape, anchor)
	const dir = explicit ?? autoSide(shapeBoundsCenter(shape), towards)
	const vec = DIR_VECTOR[dir]

	// For an auto anchor the attachment point is wherever the chosen side's normal leaves the
	// shape; for a pinned anchor it is the anchor itself, clipped to the outline.
	const center = shapeBoundsCenter(shape)
	const from = explicit ? anchorPoint : center
	const outward: Pt = [from[0] + vec[0] * 1e5, from[1] + vec[1] * 1e5]
	const exit = shapeExitPoint(shape, from, outward)

	const gap = standoffGap(strokeWidth)
	const push = gap + dockDistance(headExtent)
	const point: Pt = [exit[0] + vec[0] * gap, exit[1] + vec[1] * gap]
	const dock: Pt = [exit[0] + vec[0] * push, exit[1] + vec[1] * push]

	// A rotated shape's obstacle is the AABB of its rotated corners, which for a 45-degree box
	// reaches ~41% past the outline the exit point sits on - so a dock pushed along a snapped
	// cardinal can land inside it, and astarRoute gives up outright on an enclosed dock. Slide it
	// out to just past the face it is behind. The visible attachment `point` never moves.
	// An unrotated shape cannot reach here: the push already exceeds obstaclePad at every stroke
	// width the UI offers.
	if (obstacle && pointInRect(dock, obstacle)) {
		if (dir === 'n') dock[1] = Math.min(dock[1], obstacle.y - 1)
		else if (dir === 's') dock[1] = Math.max(dock[1], obstacle.y + obstacle.height + 1)
		else if (dir === 'w') dock[0] = Math.min(dock[0], obstacle.x - 1)
		else dock[0] = Math.max(dock[0], obstacle.x + obstacle.width + 1)
	}
	return { point, dock, dir }
}

/** Which axis a direction runs along */
function axisOf(dir: Dir | null): 'h' | 'v' | undefined {
	if (!dir) return undefined
	return dir === 'e' || dir === 'w' ? 'h' : 'v'
}

/**
 * Analytic orthogonal route between two docks. Always succeeds.
 *
 * Same-axis pairs get one straight run; facing sides get a 3-segment Z through the midpoint of
 * the gap; anything else gets a 5-segment C around the obstacle union. This doubles as the
 * reference implementation the A* router is tested against.
 *
 * `clearance` is how far the C-route steps outside the union - the same distance the docks were
 * pushed out by, so a large arrowhead does not make the detour tighter than the terminals.
 */
export function analyticElbow(start: Dock, end: Dock, obstacles: Bounds[], clearance = DOCK): Pt[] {
	const a = start.dock
	const b = end.dock
	const pts: Pt[] = []

	const aligned = Math.abs(a[0] - b[0]) < 1 || Math.abs(a[1] - b[1]) < 1
	const startAxis = axisOf(start.dir)
	const endAxis = axisOf(end.dir)

	if (aligned && (!startAxis || !endAxis || startAxis === endAxis)) {
		// One straight run - a single segment, or a small jog if the docks are not exactly aligned
		if (Math.abs(a[0] - b[0]) < 1) {
			pts.push(a, [a[0], b[1]])
		} else {
			pts.push(a, [b[0], a[1]])
		}
		pts.push(b)
	} else if (startAxis === 'h' && endAxis === 'h') {
		const midX = (a[0] + b[0]) / 2
		pts.push(a, [midX, a[1]], [midX, b[1]], b)
	} else if (startAxis === 'v' && endAxis === 'v') {
		const midY = (a[1] + b[1]) / 2
		pts.push(a, [a[0], midY], [b[0], midY], b)
	} else if (startAxis === 'h' || (!startAxis && endAxis === 'v')) {
		// Turn once: run horizontally, then vertically into the end dock
		pts.push(a, [b[0], a[1]], b)
	} else if (startAxis === 'v' || (!startAxis && endAxis === 'h')) {
		pts.push(a, [a[0], b[1]], b)
	} else {
		pts.push(a, [b[0], a[1]], b)
	}

	// Detour only when the route cuts through an ACTUAL obstacle. Testing against the union
	// instead would detour every time, since the union of two bound shapes contains the whole
	// corridor between them - which is exactly where a good route wants to run.
	if (obstacles.some((o) => segmentsCrossBox(pts, o))) {
		const union = obstacles.reduce<Bounds | null>((acc, o) => unionBounds(acc, o), null)
		if (union) return detourAround(a, b, start.dir, end.dir, union, clearance)
	}
	return pts
}

/**
 * C-route around the obstacle union: step each dock out along its own side until it clears the
 * union, then connect along a corridor that runs outside it.
 */
function detourAround(
	a: Pt,
	b: Pt,
	aDir: Dir | null,
	bDir: Dir | null,
	union: Bounds,
	clearance: number
): Pt[] {
	const left = union.x - clearance
	const right = union.x + union.width + clearance
	const top = union.y - clearance
	const bottom = union.y + union.height + clearance

	// A dock with a side leaves along it; one without takes the nearer way out
	const escapeY = (p: Pt, dir: Dir | null): number =>
		dir === 'n'
			? top
			: dir === 's'
				? bottom
				: Math.abs(p[1] - top) <= Math.abs(p[1] - bottom)
					? top
					: bottom
	const escapeX = (p: Pt, dir: Dir | null): number =>
		dir === 'w'
			? left
			: dir === 'e'
				? right
				: Math.abs(p[0] - left) <= Math.abs(p[0] - right)
					? left
					: right

	const aVertical = aDir === 'n' || aDir === 's'
	const bVertical = bDir === 'n' || bDir === 's'

	if (aVertical && bVertical) {
		const ay = escapeY(a, aDir)
		const by = escapeY(b, bDir)
		// Both escaped to the same side: one corridor is enough
		if (Math.abs(ay - by) < 1) return [a, [a[0], ay], [b[0], by], b]
		const x = escapeX(a, null)
		return [a, [a[0], ay], [x, ay], [x, by], [b[0], by], b]
	}
	if (!aVertical && !bVertical) {
		const ax = escapeX(a, aDir)
		const bx = escapeX(b, bDir)
		if (Math.abs(ax - bx) < 1) return [a, [ax, a[1]], [bx, b[1]], b]
		const y = escapeY(a, null)
		return [a, [ax, a[1]], [ax, y], [bx, y], [bx, b[1]], b]
	}
	// One of each: escape the vertical dock, then turn into the horizontal one
	if (aVertical) {
		const ay = escapeY(a, aDir)
		const bx = escapeX(b, bDir)
		return [a, [a[0], ay], [bx, ay], [bx, b[1]], b]
	}
	const ax = escapeX(a, aDir)
	const by = escapeY(b, bDir)
	return [a, [ax, a[1]], [ax, by], [b[0], by], b]
}

/**
 * Manhattan length plus a charge per turn - the same quantity A* minimises, so the two routers
 * can be compared on equal terms. Expects a collapsed polyline.
 */
export function pathCost(points: Pt[], turnPenalty = 24): number {
	let cost = 0
	for (let i = 0; i < points.length - 1; i++) {
		cost +=
			Math.abs(points[i][0] - points[i + 1][0]) + Math.abs(points[i][1] - points[i + 1][1])
	}
	return cost + Math.max(0, points.length - 2) * turnPenalty
}

function segmentsCrossBox(points: Pt[], box: Bounds): boolean {
	for (let i = 0; i < points.length - 1; i++) {
		const [x1, y1] = points[i]
		const [x2, y2] = points[i + 1]
		const minX = Math.min(x1, x2)
		const maxX = Math.max(x1, x2)
		const minY = Math.min(y1, y2)
		const maxY = Math.max(y1, y2)
		if (maxX > box.x && minX < box.x + box.width && maxY > box.y && minY < box.y + box.height) {
			return true
		}
	}
	return false
}

/** Union of two boxes, or the one that exists */
function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
	if (!a) return b
	if (!b) return a
	const x = Math.min(a.x, b.x)
	const y = Math.min(a.y, b.y)
	return {
		x,
		y,
		width: Math.max(a.x + a.width, b.x + b.width) - x,
		height: Math.max(a.y + a.height, b.y + b.height) - y
	}
}

/**
 * Obstacles a route must avoid.
 *
 * v1 is the two bound shapes only - Excalidraw's choice: deterministic, a tiny grid, and it
 * covers the overwhelming majority of real diagrams. Kept as one swappable function so a later
 * version can add nearby shapes without touching the search.
 */
export function collectObstacles(req: RouteRequest): Bounds[] {
	const out: Bounds[] = []
	if (req.startShape) out.push(shapeObstacle(req.startShape, req))
	if (req.endShape) out.push(shapeObstacle(req.endShape, req))
	return out
}

/**
 * The padded box one shape contributes as an obstacle.
 *
 * routeElbow needs each box BEFORE it docks its terminals (a dock has to be nudged clear of its
 * own obstacle), so the padding lives here rather than being computed twice.
 */
export function shapeObstacle(shape: ShapeGeometry, req: RouteRequest): Bounds {
	const head = Math.max(
		arrowheadExtent(req.startArrow, req.strokeWidth),
		arrowheadExtent(req.endArrow, req.strokeWidth)
	)
	return shapePadded(shape, obstaclePad(req.strokeWidth, head))
}

/** Rounded corners via short quadratic joins - most of the visual polish for very little code */
export function roundedPolylinePath(points: Pt[], radius = CORNER_RADIUS): string {
	if (points.length < 3) return polylinePath(points)
	let d = `M ${points[0][0]} ${points[0][1]}`
	for (let i = 1; i < points.length - 1; i++) {
		const prev = points[i - 1]
		const cur = points[i]
		const next = points[i + 1]
		const inLen = hypot(cur[0] - prev[0], cur[1] - prev[1])
		const outLen = hypot(next[0] - cur[0], next[1] - cur[1])
		const r = Math.min(radius, inLen / 2, outLen / 2)
		if (r < 0.5) {
			d += ` L ${cur[0]} ${cur[1]}`
			continue
		}
		const before = roundPoint([
			cur[0] + ((prev[0] - cur[0]) / inLen) * r,
			cur[1] + ((prev[1] - cur[1]) / inLen) * r
		])
		const after = roundPoint([
			cur[0] + ((next[0] - cur[0]) / outLen) * r,
			cur[1] + ((next[1] - cur[1]) / outLen) * r
		])
		d += ` L ${before[0]} ${before[1]} Q ${cur[0]} ${cur[1]} ${after[0]} ${after[1]}`
	}
	const last = points[points.length - 1]
	return `${d} L ${last[0]} ${last[1]}`
}

export function routeElbow(req: RouteRequest): ResolvedRoute {
	// Aim each terminal at the other shape's centre (or the other raw endpoint when unbound)
	const startTowards: Pt = req.endShape ? shapeBoundsCenter(req.endShape) : req.end
	const endTowards: Pt = req.startShape ? shapeBoundsCenter(req.startShape) : req.start

	const startAnchorPoint = req.startShape
		? anchorWorldPoint(req.startShape, req.startAnchor)
		: req.start
	const endAnchorPoint = req.endShape ? anchorWorldPoint(req.endShape, req.endAnchor) : req.end

	// Obstacles before docks: each dock has to be pushed clear of its own shape's padded box,
	// which on a rotated shape reaches well past the outline the exit point sits on.
	const startObstacle = req.startShape ? shapeObstacle(req.startShape, req) : undefined
	const endObstacle = req.endShape ? shapeObstacle(req.endShape, req) : undefined
	const obstacles: Bounds[] = []
	if (startObstacle) obstacles.push(startObstacle)
	if (endObstacle) obstacles.push(endObstacle)

	const startHead = arrowheadExtent(req.startArrow, req.strokeWidth)
	const endHead = arrowheadExtent(req.endArrow, req.strokeWidth)

	const start = dockTerminal(
		req.startShape,
		startAnchorPoint,
		req.startAnchor,
		startTowards,
		req.strokeWidth,
		startHead,
		startObstacle
	)
	const end = dockTerminal(
		req.endShape,
		endAnchorPoint,
		req.endAnchor,
		endTowards,
		req.strokeWidth,
		endHead,
		endObstacle
	)

	const clearance = Math.max(dockDistance(startHead), dockDistance(endHead))
	const analytic = analyticElbow(start, end, obstacles, clearance)
	const searched = astarRoute(start, end, obstacles)

	// A* searches a grid built from the obstacle edges, so it cannot always express the route the
	// analytic router finds. Clearance decides first, cost only between two clear routes - a
	// cheap route through a box is not a route. BOTH sides are collapsed before costing:
	// pathCost charges per interior point, and the analytic router emits three even for a
	// dead-straight run, which would bias the choice toward A*.
	//
	// When neither is clear `middle` stays analytic - already the detourAround C-route whenever
	// the direct one crossed. Degrading to a possibly-crossing route is deliberate: 'O' returning
	// nothing is not an option.
	const analyticPts = collapseCollinear(analytic)
	const analyticClear = !obstacles.some((o) => segmentsCrossBox(analyticPts, o))
	let middle = analyticPts
	if (searched) {
		const searchedPts = collapseCollinear(searched)
		const searchedClear = !obstacles.some((o) => segmentsCrossBox(searchedPts, o))
		if (searchedClear && (!analyticClear || pathCost(searchedPts) < pathCost(analyticPts))) {
			middle = searchedPts
		}
	}

	// Re-attach the forced first and last segments: attachment is always perpendicular
	const raw: Pt[] = [start.point, ...middle, end.point]
	const points = collapseCollinear(raw.map(roundPoint))
	const radius = Math.max(CORNER_RADIUS, req.strokeWidth * 1.5)

	return finishRoute(
		req,
		{
			kind: 'elbow',
			points,
			d: roundedPolylinePath(points, radius),
			startDir: start.dir,
			endDir: end.dir
		},
		// Re-emit with rounded corners after trimming, so a filled head does not cost the polish
		(trimmed) => roundedPolylinePath(trimmed, radius)
	)
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Where a connector meets a shape's outline.
 *
 * ideallo had no line/ray-versus-rect intersection anywhere before connectors, so this is the
 * primitive the whole routing layer rests on. Rotation is handled by inverse-rotating into the
 * shape's local frame, intersecting axis-aligned, then rotating the hit back out.
 */

import type { Bounds } from '../crdt/index.js'
import { expandBounds, hypot, rotatePoint } from '../utils/geometry.js'
import { pointInEllipse, pointInPolygon } from '../utils/hit-testing.js'
import type { ShapeGeometry } from './types.js'
import { shapeBoundsCenter, shapeRotationCenter } from './types.js'

type Pt = [number, number]

const EPS = 1e-9

/** Centre of a box, in whatever frame the box is expressed in */
function boxCentre(b: Bounds): Pt {
	return [b.x + b.width / 2, b.y + b.height / 2]
}

/** Intersection of two segments, or null when they are parallel or do not overlap */
export function intersectSegmentSegment(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
	const rx = a2[0] - a1[0]
	const ry = a2[1] - a1[1]
	const sx = b2[0] - b1[0]
	const sy = b2[1] - b1[1]
	const denom = rx * sy - ry * sx
	if (Math.abs(denom) < EPS) return null // parallel or collinear

	const qpx = b1[0] - a1[0]
	const qpy = b1[1] - a1[1]
	const t = (qpx * sy - qpy * sx) / denom
	const u = (qpx * ry - qpy * rx) / denom
	if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null
	return [a1[0] + t * rx, a1[1] + t * ry]
}

/** The four edges of an axis-aligned box, as segments */
function rectEdges(r: Bounds): [Pt, Pt][] {
	const { x, y, width: w, height: h } = r
	return [
		[
			[x, y],
			[x + w, y]
		],
		[
			[x + w, y],
			[x + w, y + h]
		],
		[
			[x + w, y + h],
			[x, y + h]
		],
		[
			[x, y + h],
			[x, y]
		]
	]
}

/** True when a point lies strictly inside a box (edges do not count) */
export function pointInRect(p: Pt, r: Bounds, tolerance = 0): boolean {
	return (
		p[0] > r.x + tolerance &&
		p[0] < r.x + r.width - tolerance &&
		p[1] > r.y + tolerance &&
		p[1] < r.y + r.height - tolerance
	)
}

/**
 * First point at which the segment from->to crosses the box outline, measured from `from`.
 * Returns null when the segment misses the box entirely or lies wholly inside it.
 */
export function intersectSegmentRect(from: Pt, to: Pt, r: Bounds): Pt | null {
	let best: Pt | null = null
	let bestDistSq = Infinity
	for (const [e1, e2] of rectEdges(r)) {
		const hit = intersectSegmentSegment(from, to, e1, e2)
		if (!hit) continue
		const dx = hit[0] - from[0]
		const dy = hit[1] - from[1]
		const distSq = dx * dx + dy * dy
		if (distSq < bestDistSq) {
			bestDistSq = distSq
			best = hit
		}
	}
	return best
}

/**
 * LAST point at which the segment from->to crosses the box outline, measured from `from`.
 *
 * This is the exit convention the routing layer uses: an anchor that already sits on the
 * outline and faces away from the target must yield the far side of the shape, never itself,
 * or the connector is drawn straight across the body it is attached to.
 */
export function exitSegmentRect(from: Pt, to: Pt, r: Bounds): Pt | null {
	let best: Pt | null = null
	let bestDistSq = -1
	for (const [e1, e2] of rectEdges(r)) {
		const hit = intersectSegmentSegment(from, to, e1, e2)
		if (!hit) continue
		const dx = hit[0] - from[0]
		const dy = hit[1] - from[1]
		const distSq = dx * dx + dy * dy
		if (distSq > bestDistSq) {
			bestDistSq = distSq
			best = hit
		}
	}
	return best
}

/** True when a segment passes through a box's interior (touching an edge does not count) */
export function segmentPenetratesRect(from: Pt, to: Pt, r: Bounds): boolean {
	if (pointInRect(from, r, EPS) || pointInRect(to, r, EPS)) return true
	// A segment that only grazes an edge produces a hit but no interior overlap, so also test
	// the midpoints of the pieces the crossings cut it into.
	const hits: number[] = []
	for (const [e1, e2] of rectEdges(r)) {
		const hit = intersectSegmentSegment(from, to, e1, e2)
		if (!hit) continue
		const dx = to[0] - from[0]
		const dy = to[1] - from[1]
		const lenSq = dx * dx + dy * dy
		if (lenSq < EPS) continue
		hits.push(((hit[0] - from[0]) * dx + (hit[1] - from[1]) * dy) / lenSq)
	}
	if (hits.length < 2) return false
	hits.sort((a, b) => a - b)
	const mid = (hits[0] + hits[hits.length - 1]) / 2
	return pointInRect(
		[from[0] + (to[0] - from[0]) * mid, from[1] + (to[1] - from[1]) * mid],
		r,
		EPS
	)
}

/**
 * Where a ray meets an axis-aligned ellipse. `from` is normally the centre; `dir` need not be
 * normalized. Returns null when the ellipse is degenerate or the direction is zero.
 *
 * `pick` chooses between the two roots: 'near' is the first hit in front of the origin, 'far' is
 * the point at which the ray finally leaves the outline. They coincide for a ray cast from the
 * centre; they differ for an anchor that already sits on the ellipse.
 */
export function intersectRayEllipse(
	center: Pt,
	rx: number,
	ry: number,
	from: Pt,
	dir: Pt,
	pick: 'near' | 'far' = 'near'
): Pt | null {
	if (rx <= EPS || ry <= EPS) return null
	// Squash to a unit circle, solve, unsquash
	const px = (from[0] - center[0]) / rx
	const py = (from[1] - center[1]) / ry
	const dx = dir[0] / rx
	const dy = dir[1] / ry
	const a = dx * dx + dy * dy
	if (a < EPS) return null
	const b = 2 * (px * dx + py * dy)
	const c = px * px + py * py - 1
	const disc = b * b - 4 * a * c
	if (disc < 0) return null
	const sqrtDisc = Math.sqrt(disc)
	const t1 = (-b - sqrtDisc) / (2 * a)
	const t2 = (-b + sqrtDisc) / (2 * a)
	// Both roots, ordered: t1 <= t2 because a > 0
	const near = t1 >= 0 ? t1 : t2 >= 0 ? t2 : null
	const far = t2 >= 0 ? t2 : t1 >= 0 ? t1 : null
	const t = pick === 'far' ? far : near
	if (t === null) return null
	return [from[0] + t * dir[0], from[1] + t * dir[1]]
}

/**
 * Where a ray leaves a closed polygon. `verts` are absolute world coordinates.
 * Returns the farthest crossing so a ray starting inside a concave polygon still exits it.
 */
export function intersectRayPolygon(verts: Pt[], from: Pt, dir: Pt): Pt | null {
	if (verts.length < 2) return null
	const len = hypot(dir[0], dir[1])
	if (len < EPS) return null
	// A segment long enough to leave any plausible shape
	const far: Pt = [from[0] + (dir[0] / len) * 1e6, from[1] + (dir[1] / len) * 1e6]

	let best: Pt | null = null
	let bestDistSq = -1
	for (let i = 0; i < verts.length; i++) {
		const hit = intersectSegmentSegment(from, far, verts[i], verts[(i + 1) % verts.length])
		if (!hit) continue
		const dx = hit[0] - from[0]
		const dy = hit[1] - from[1]
		const distSq = dx * dx + dy * dy
		if (distSq > bestDistSq) {
			bestDistSq = distSq
			best = hit
		}
	}
	return best
}

/**
 * The point at which a connector LAST leaves a shape, heading from `interior` towards `towards`.
 *
 * The last crossing, not the first, and that is the whole point. `interior` is usually an anchor
 * that already sits ON the outline, where a first-crossing convention hands the anchor straight
 * back at distance zero - and the caller's standoff push towards the other terminal then aims
 * into the shape's own body, drawing the connector across the thing it is attached to. With the
 * last crossing an anchor facing the target is honoured exactly (it is the only crossing), one
 * facing away slides to the far face, and the standoff is outward by construction, which is why
 * clipTerminals needs no correction of its own.
 *
 * When the ray misses the outline entirely - degenerate bounds, an anchor already outside the
 * shape - this falls back to `interior` itself so routing never fails.
 *
 * Freehand, image and document objects use their AABB in v1.
 * TODO: trace the real freehand outline via parseSvgPath for a tighter attachment. Note that
 * `obj.pathData` is expressed RELATIVE to `obj.x`/`obj.y` and must be offset by them before it can
 * be intersected against the world-space rays this module casts.
 */
export function shapeExitPoint(shape: ShapeGeometry, interior: Pt, towards: Pt): Pt {
	const rotation = shape.rotation
	const center = shapeRotationCenter(shape)
	// Work in the shape's local frame so the box is axis-aligned
	const localFrom: Pt = rotation ? rotatePoint(interior, center, -rotation) : interior
	const localTo: Pt = rotation ? rotatePoint(towards, center, -rotation) : towards
	const dir: Pt = [localTo[0] - localFrom[0], localTo[1] - localFrom[1]]
	if (Math.abs(dir[0]) < EPS && Math.abs(dir[1]) < EPS) return interior

	const hit = localExitPoint(shape, localFrom, localTo, dir)
	if (!hit) return interior
	return rotation ? rotatePoint(hit, center, rotation) : hit
}

/**
 * An anchor is a position in the shape's BOUNDING BOX, so on anything that does not fill its box -
 * a triangle, an ellipse - it can sit off the outline entirely, and a ray cast from out there
 * misses the shape. Pull such a point onto the outline radially from the box centre first: that
 * keeps the anchor on its own side of the shape and is a no-op for one already on the outline.
 */
function localExitPoint(shape: ShapeGeometry, from: Pt, to: Pt, dir: Pt): Pt | null {
	const b = shape.bounds
	switch (shape.type) {
		case 'ellipse': {
			const c = boxCentre(b)
			const rx = b.width / 2
			const ry = b.height / 2
			const start = pointInEllipse(from, c[0], c[1], rx, ry)
				? from
				: (intersectRayEllipse(c, rx, ry, c, [from[0] - c[0], from[1] - c[1]], 'far') ??
					from)
			// `?? start`, not `?? from`: a ray aimed away from a shape has no crossing at all (and
			// a projected start sits within rounding of the outline, where the two roots collapse),
			// so the attachment is the projected point itself - never the raw bounding-box anchor.
			return (
				intersectRayEllipse(
					c,
					rx,
					ry,
					start,
					[to[0] - start[0], to[1] - start[1]],
					'far'
				) ?? start
			)
		}
		case 'polygon': {
			if (!shape.vertices?.length) break
			// The vertices are ALREADY in the local frame - stored unrotated, exactly like the
			// bounds, with the rotation applied by the renderer's <g> on top. Un-rotating them
			// here (as this used to) applied the inverse rotation a second time and put a rotated
			// polygon's attachment somewhere off the shape entirely.
			const verts = shape.vertices
			const origin = boxCentre(b)
			const start = pointInPolygon(from, verts)
				? from
				: (intersectRayPolygon(verts, origin, [from[0] - origin[0], from[1] - origin[1]]) ??
					from)
			// Farthest-crossing, the convention all three branches share - and with `start` on the
			// outline the reasoning documented on shapeExitPoint holds again. The direction is
			// remeasured from `start`, since the caller's `dir` came from the unprojected point.
			return intersectRayPolygon(verts, start, [to[0] - start[0], to[1] - start[1]]) ?? start
		}
		default:
			break
	}
	// Rect-like: extend the ray far enough to leave the box, then clip
	const len = hypot(dir[0], dir[1])
	const far: Pt = [from[0] + (dir[0] / len) * 1e6, from[1] + (dir[1] / len) * 1e6]
	return exitSegmentRect(from, far, b) ?? exitSegmentRect(to, from, b)
}

/** A shape's box grown by `pad` on every side - the obstacle a route must stay clear of */
export function shapePadded(shape: ShapeGeometry, pad: number): Bounds {
	// A polygon is measured by its own vertices rather than its box. Identical while unrotated -
	// the box IS the vertex box - but under rotation the box's corners sweep out to cover empty
	// space a triangle never occupied, and elbow routes then detour around nothing.
	const outline: Pt[] | undefined =
		shape.type === 'polygon' && shape.vertices?.length ? shape.vertices : undefined
	if (!shape.rotation) return expandBounds(shape.bounds, pad)
	const center = shapeRotationCenter(shape)
	if (outline) {
		return paddedPointBounds(
			outline.map((v) => rotatePoint(v, center, shape.rotation)),
			pad
		)
	}
	// A rotated box's world-space AABB is the box of its four rotated corners
	const { x, y, width: w, height: h } = shape.bounds
	const corners: Pt[] = [
		[x, y],
		[x + w, y],
		[x + w, y + h],
		[x, y + h]
	].map((p) => rotatePoint(p as Pt, center, shape.rotation))
	return paddedPointBounds(corners, pad)
}

/** AABB of a point set, grown by `pad` on every side */
function paddedPointBounds(points: Pt[], pad: number): Bounds {
	const xs = points.map((p) => p[0])
	const ys = points.map((p) => p[1])
	const minX = Math.min(...xs)
	const minY = Math.min(...ys)
	return expandBounds(
		{ x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY },
		pad
	)
}

/** Direction from one shape towards another, used to pick an auto anchor's side */
export function directionBetween(a: ShapeGeometry, b: ShapeGeometry): Pt {
	const ca = shapeBoundsCenter(a)
	const cb = shapeBoundsCenter(b)
	return [cb[0] - ca[0], cb[1] - ca[1]]
}

// vim: ts=4

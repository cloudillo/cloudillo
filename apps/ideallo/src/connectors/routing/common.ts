// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shared shape of a routing request, and the post-processing every router ends with.
 */

import type { AnchorPoint, ArrowStyle, Bounds, Dir, Routing } from '../../crdt/index.js'
import { hypot } from '../../utils/geometry.js'
import { anchorSideDir } from '../anchors.js'
import { arrowheadExtent, arrowheadInset } from '../arrowheads.js'
import type { ResolvedRoute, ShapeGeometry } from '../types.js'

type Pt = [number, number]

/** Everything a router needs, already resolved from the arrow and its bound shapes */
export interface RouteRequest {
	/** Anchor world point for the start terminal (the shape centre for an auto anchor) */
	start: Pt
	end: Pt
	startShape?: ShapeGeometry
	endShape?: ShapeGeometry
	startAnchor?: AnchorPoint
	endAnchor?: AnchorPoint
	startArrow: ArrowStyle
	endArrow: ArrowStyle
	strokeWidth: number
	routing: Routing
}

export interface RouteTerminals {
	start: Pt
	end: Pt
}

/** Coordinates are rounded so cache signatures and cross-peer output stay stable */
export function roundPoint(p: Pt): Pt {
	return [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]
}

/**
 * The side a terminal docks to, or null when it has none.
 *
 * Only the elbow router uses this: it forces the first and last segments along the dock normal,
 * so `ResolvedRoute.startDir`/`endDir` are meaningful there. Straight and arc routes leave both
 * null, and the renderer orients their heads from the actual first/last polyline segment - exact
 * at any angle, where a cardinal would visibly disagree with the line.
 */
export function dockDir(req: RouteRequest, which: 'start' | 'end'): Dir | null {
	const shape = which === 'start' ? req.startShape : req.endShape
	if (!shape) return null
	const anchor = which === 'start' ? req.startAnchor : req.endAnchor
	return anchorSideDir(shape, anchor)
}

/** Bounding box of a polyline, grown to cover the arrowheads and the stroke */
export function routeBounds(points: Pt[], req: RouteRequest): Bounds {
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	for (const [x, y] of points) {
		if (x < minX) minX = x
		if (y < minY) minY = y
		if (x > maxX) maxX = x
		if (y > maxY) maxY = y
	}
	if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 }
	// A big filled head sticks out well past the last vertex; without this the selection box
	// and the hit-test bbox pre-check would clip it.
	const pad = Math.max(
		arrowheadExtent(req.startArrow, req.strokeWidth),
		arrowheadExtent(req.endArrow, req.strokeWidth),
		req.strokeWidth
	)
	return {
		x: minX - pad,
		y: minY - pad,
		width: maxX - minX + pad * 2,
		height: maxY - minY + pad * 2
	}
}

/**
 * Shorten a polyline by `startInset` from its head and `endInset` from its tail.
 * Used so a filled arrowhead does not have the line's own stroke poking out through its point.
 */
export function trimPolyline(points: Pt[], startInset: number, endInset: number): Pt[] {
	if (points.length < 2 || (startInset <= 0 && endInset <= 0)) return points

	let total = 0
	for (let i = 0; i < points.length - 1; i++) {
		total += hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
	}
	// Nothing sensible to draw - leave the polyline alone and let the heads cover it
	if (total <= startInset + endInset + 1) return points

	const walk = (from: Pt[], distance: number): Pt[] => {
		if (distance <= 0) return from
		let remaining = distance
		for (let i = 0; i < from.length - 1; i++) {
			const segLen = hypot(from[i + 1][0] - from[i][0], from[i + 1][1] - from[i][1])
			if (segLen >= remaining) {
				const t = segLen === 0 ? 0 : remaining / segLen
				const cut: Pt = [
					from[i][0] + (from[i + 1][0] - from[i][0]) * t,
					from[i][1] + (from[i + 1][1] - from[i][1]) * t
				]
				return [cut, ...from.slice(i + 1)]
			}
			remaining -= segLen
		}
		return from.slice(-1)
	}

	const fromStart = walk(points, startInset)
	const fromEnd = walk([...fromStart].reverse(), endInset)
	return fromEnd.reverse().map(roundPoint)
}

/**
 * Round the polyline, attach the derived bounds, and shorten the DRAWN path to make room for
 * any filled arrowheads.
 *
 * `points` stays untrimmed - bounds and hit testing want the connector's true extent - while
 * `d` is what actually gets stroked. `pathBuilder` lets each router re-emit its own kind of
 * path after trimming, so an elbow keeps its rounded corners and a straight run stays exact.
 */
export function finishRoute(
	req: RouteRequest,
	route: Omit<ResolvedRoute, 'bounds'>,
	pathBuilder: (points: Pt[]) => string = polylinePath
): ResolvedRoute {
	const points = route.points.map(roundPoint)
	const startInset = arrowheadInset(req.startArrow, req.strokeWidth)
	const endInset = arrowheadInset(req.endArrow, req.strokeWidth)
	const d =
		startInset > 0 || endInset > 0
			? pathBuilder(trimPolyline(points, startInset, endInset))
			: route.d
	return { ...route, d, points, bounds: routeBounds(points, req) }
}

/** Drop vertices that lie on the straight line between their neighbours */
export function collapseCollinear(points: Pt[], epsilon = 0.01): Pt[] {
	if (points.length < 3) return points
	const out: Pt[] = [points[0]]
	for (let i = 1; i < points.length - 1; i++) {
		const a = out[out.length - 1]
		const b = points[i]
		const c = points[i + 1]
		const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
		const sameSpot = hypot(b[0] - a[0], b[1] - a[1]) < epsilon
		if (Math.abs(cross) > epsilon && !sameSpot) out.push(b)
	}
	out.push(points[points.length - 1])
	return out
}

/** `M x y L x y ...` for a polyline */
export function polylinePath(points: Pt[]): string {
	if (!points.length) return ''
	const [first, ...rest] = points
	return `M ${first[0]} ${first[1]}${rest.map((p) => ` L ${p[0]} ${p[1]}`).join('')}`
}

// vim: ts=4

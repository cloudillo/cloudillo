// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Arc routing: a single quadratic Bezier bowed off the chord.
 *
 * The control point sits at the chord midpoint, offset perpendicular by `bend * |chord|`. The
 * bend's sign comes from sign(dx * dy) with a fallback of 1, so the curve never flips direction
 * as a bound shape crosses an axis - a sign derived from dx or dy alone would.
 */

import { hypot } from '../../utils/geometry.js'
import type { ResolvedRoute } from '../types.js'
import type { RouteRequest } from './common.js'
import { finishRoute, polylinePath, roundPoint } from './common.js'
import { clipTerminals } from './straight.js'

type Pt = [number, number]

/** How far the curve bows off the chord, as a fraction of chord length */
const BEND = 0.18

/** Samples used to flatten the curve for bounds and hit testing */
const FLATTEN_SAMPLES = 16

function quadraticAt(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
	const mt = 1 - t
	return [
		mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0],
		mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1]
	]
}

export function routeArc(req: RouteRequest): ResolvedRoute {
	const { start, end } = clipTerminals(req)
	const dx = end[0] - start[0]
	const dy = end[1] - start[1]
	const chord = hypot(dx, dy)
	// Rounded in the path strings below: finishRoute rounds `points` but only re-emits `d` when an
	// arrowhead inset applies, so an un-inset route would otherwise ship raw float coordinates.
	const a = roundPoint(start)
	const b = roundPoint(end)

	if (chord < 1e-6) {
		const points: Pt[] = [start, end]
		return finishRoute(req, {
			kind: 'curved',
			points,
			d: `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`,
			startDir: null,
			endDir: null
		})
	}

	// Stable across all four quadrants: dx and dy both flip when the shapes swap sides, so
	// their product does not, and the curve keeps bowing the same way.
	const sign = Math.sign(dx * dy) || 1
	const offset = BEND * chord * sign
	const control = roundPoint([
		(start[0] + end[0]) / 2 - (dy / chord) * offset,
		(start[1] + end[1]) / 2 + (dx / chord) * offset
	])

	const points: Pt[] = []
	for (let i = 0; i <= FLATTEN_SAMPLES; i++) {
		points.push(quadraticAt(start, control, end, i / FLATTEN_SAMPLES))
	}
	// Keep the exact terminals - sampling reproduces them, but rounding must not drift
	points[0] = start
	points[points.length - 1] = end

	return finishRoute(
		req,
		{
			kind: 'curved',
			points,
			d: `M ${a[0]} ${a[1]} Q ${control[0]} ${control[1]} ${b[0]} ${b[1]}`,
			// Heads follow the curve's tangent via the flattened first/last segment
			startDir: null,
			endDir: null
		},
		// Trimming for a filled head moves the terminals, which the quadratic's control point
		// cannot express; the 16-sample flattening is smooth enough to stroke directly.
		polylinePath
	)
}

// vim: ts=4

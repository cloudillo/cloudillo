// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Straight routing: a single segment, clipped to each bound shape's outline.
 */

import { hypot } from '../../utils/geometry.js'
import { shapeExitPoint } from '../shape-outline.js'
import type { ResolvedRoute } from '../types.js'
import type { RouteRequest, RouteTerminals } from './common.js'
import { finishRoute, roundPoint } from './common.js'

type Pt = [number, number]

/** Standoff between a shape's outline and the connector's endpoint */
export function standoffGap(strokeWidth: number): number {
	return 2 + strokeWidth
}

/**
 * Clip a terminal back to its shape's outline plus a small gap.
 * An unbound terminal is used verbatim - `pts` is authoritative there.
 */
export function clipTerminals(req: RouteRequest): RouteTerminals {
	const gap = standoffGap(req.strokeWidth)

	const clip = (point: Pt, shapeIsStart: boolean): Pt => {
		const shape = shapeIsStart ? req.startShape : req.endShape
		if (!shape) return point
		const other = shapeIsStart ? req.end : req.start
		const exit = shapeExitPoint(shape, point, other)
		const dx = other[0] - exit[0]
		const dy = other[1] - exit[1]
		const len = hypot(dx, dy)
		if (len < 1e-6) return exit
		return [exit[0] + (dx / len) * gap, exit[1] + (dy / len) * gap]
	}

	return { start: clip(req.start, true), end: clip(req.end, false) }
}

export function routeStraight(req: RouteRequest): ResolvedRoute {
	const { start, end } = clipTerminals(req)
	const points: Pt[] = [start, end]
	// Rounded in the path string too: finishRoute rounds `points` but only re-emits `d` when an
	// arrowhead inset applies, so an un-inset route would otherwise ship raw float coordinates.
	const a = roundPoint(start)
	const b = roundPoint(end)
	return finishRoute(req, {
		kind: 'straight',
		points,
		d: `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`,
		// Heads orient from the segment itself, which is exact at any angle
		startDir: null,
		endDir: null
	})
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Which way the arrowheads point at a connector's two terminals.
 *
 * Two conventions meet here and they are opposites, which is exactly why this is a named
 * function with its own tests rather than an expression inside the renderer:
 *
 *   - `ResolvedRoute.startDir` / `endDir` are the shape's OUTWARD normal at the dock - the way
 *     the connector leaves the shape. Two boxes side by side give startDir 'e', endDir 'w'.
 *   - `arrowheadGeometry`'s `dir` is the direction of travel at the tip - the way the head points.
 *
 * A head at a docked terminal always points INTO the shape it attaches to, so the dock direction
 * is negated at BOTH terminals. Reading it straight through is what made the end head of an
 * elbow route point backwards.
 *
 * With no dock the polyline itself is exact at any angle: the end head follows the last segment's
 * travel, the start head points back out of the route (i.e. into the start shape).
 */

import type { Dir } from '../crdt/index.js'
import { dirToVector } from './arrowheads.js'

type Pt = [number, number]

function negate(v: Pt): Pt {
	return [-v[0], -v[1]]
}

/** Direction of travel at a terminal, from the polyline alone */
function segmentDirection(points: Pt[], which: 'start' | 'end'): Pt {
	if (points.length < 2) return [1, 0]
	if (which === 'end') {
		const a = points[points.length - 2]
		const b = points[points.length - 1]
		return [b[0] - a[0], b[1] - a[1]]
	}
	// The start head points back out of the route
	return [points[0][0] - points[1][0], points[0][1] - points[1][1]]
}

export function terminalHeadDirections(
	points: Pt[],
	startDir: Dir | null | undefined,
	endDir: Dir | null | undefined
): { start: Pt; end: Pt } {
	return {
		start: startDir ? negate(dirToVector(startDir)) : segmentDirection(points, 'start'),
		end: endDir ? negate(dirToVector(endDir)) : segmentDirection(points, 'end')
	}
}

// vim: ts=4

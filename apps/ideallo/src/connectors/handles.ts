// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Where the terminal handles of a selected connector belong.
 *
 * The resolver rewrites startX/startY to the point the drawn line ATTACHES at - the shape outline
 * pushed out by the standoff gap - which is right for rendering and hit testing but wrong for a
 * grab handle: dragging it means "move the anchor", so it belongs at the anchor point itself.
 * A leader line covers the gap between the two.
 *
 * Selection overlay only. Nothing here feeds routing, bounds or persistence.
 */

import type { ConnectorObject } from '../crdt/index.js'
import { hypot } from '../utils/geometry.js'
import { anchorWorldPoint } from './anchors.js'
import type { ConnectorContext, ShapeGeometry } from './types.js'

type Pt = [number, number]

export interface TerminalHandlePoints {
	/** Where the draggable handle sits: the bound anchor point, or the free endpoint */
	handle: Pt
	/** Where the drawn connector attaches, when that differs from `handle`; else null */
	attach: Pt | null
}

export interface ConnectorHandlePoints {
	start: TerminalHandlePoints
	end: TerminalHandlePoints
}

/** Below this the leader would be a smudge under the handle circle, so there is nothing to draw */
const COINCIDENT_WORLD = 0.5

/** Two handles closer than this are one handle as far as the pointer is concerned */
const STACKED_WORLD = 1

function terminalPoints(
	shape: ShapeGeometry | undefined,
	anchor: ConnectorObject['startAnchor'],
	endpoint: Pt
): TerminalHandlePoints {
	// No shape means unbound, or a dangling ref the resolver has already fallen back on
	if (!shape) return { handle: endpoint, attach: null }
	const handle = anchorWorldPoint(shape, anchor)
	const gap = hypot(endpoint[0] - handle[0], endpoint[1] - handle[1])
	return { handle, attach: gap > COINCIDENT_WORLD ? endpoint : null }
}

/**
 * Handle and attachment points of both terminals, in WORLD coordinates.
 *
 * `arrow` is the RESOLVED connector, so its startX/startY are already the routed attachment.
 */
export function connectorHandlePoints(
	arrow: ConnectorObject,
	ctx: ConnectorContext
): ConnectorHandlePoints {
	const startShape = arrow.startObjectId ? ctx.get(arrow.startObjectId) : undefined
	const endShape = arrow.endObjectId ? ctx.get(arrow.endObjectId) : undefined
	const startPoint: Pt = [arrow.startX, arrow.startY]
	const endPoint: Pt = [arrow.endX, arrow.endY]

	const start = terminalPoints(startShape, arrow.startAnchor, startPoint)
	const end = terminalPoints(endShape, arrow.endAnchor, endPoint)

	/**
	 * Both ends on the same shape with a centre anchor puts both handles on the same pixel, and
	 * ConnectorEndpointHandles draws `end` last - so `start` would be ungrabbable. Fall back to the
	 * resolved endpoints, which is what every other consumer uses.
	 *
	 * That does not always separate them: a self-loop collapses at the RESOLVER, giving both
	 * terminals the same endpoint too. This only declines to make the stacking worse; a genuinely
	 * routed self-loop is a routing question, not an overlay one.
	 */
	if (startShape && endShape) {
		const apart = hypot(end.handle[0] - start.handle[0], end.handle[1] - start.handle[1])
		if (apart <= STACKED_WORLD) {
			return {
				start: { handle: startPoint, attach: null },
				end: { handle: endPoint, attach: null }
			}
		}
	}

	return { start, end }
}

// vim: ts=4

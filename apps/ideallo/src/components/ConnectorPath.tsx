// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The one place a connector's body and arrowheads are drawn.
 *
 * ShapeRenderer, ShapePreview and GhostShapes all render through this, so a preview cannot drift
 * from the committed shape.
 */

import * as React from 'react'

import { arrowheadGeometry, terminalHeadDirections } from '../connectors/index.js'
import type { ArrowStyle, ResolvedRoute } from '../crdt/index.js'

type Pt = [number, number]

export interface ConnectorPathProps {
	/** Resolved route for a bound connector. Absent for a plain absolute arrow. */
	route?: ResolvedRoute
	startX: number
	startY: number
	endX: number
	endY: number
	startArrow?: ArrowStyle
	endArrow?: ArrowStyle
	strokeWidth: number
	stroke: string
	strokeDasharray?: string
	opacity?: number
}

export function ConnectorPath({
	route,
	startX,
	startY,
	endX,
	endY,
	startArrow,
	endArrow,
	strokeWidth,
	stroke,
	strokeDasharray,
	opacity
}: ConnectorPathProps) {
	const points: Pt[] = route?.points ?? [
		[startX, startY],
		[endX, endY]
	]
	// A dock reports the shape's outward normal; the head points the other way, into the shape
	const heads = terminalHeadDirections(points, route?.startDir, route?.endDir)

	const startHead = arrowheadGeometry(startArrow, points[0], heads.start, strokeWidth)
	const endHead = arrowheadGeometry(endArrow, points[points.length - 1], heads.end, strokeWidth)

	// route.d is already trimmed for any filled head; the unbound fallback needs trimming here
	const body =
		route?.d ??
		straightBody(
			[startX, startY],
			[endX, endY],
			startHead?.insetLength ?? 0,
			endHead?.insetLength ?? 0
		)

	return (
		<g
			stroke={stroke}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			fill="none"
			opacity={opacity}
		>
			<path d={body} strokeDasharray={strokeDasharray} />
			{startHead && <path d={startHead.d} fill={startHead.filled ? stroke : 'none'} />}
			{endHead && <path d={endHead.d} fill={endHead.filled ? stroke : 'none'} />}
		</g>
	)
}

/** Straight body for an unbound arrow, shortened at each end for a filled head */
function straightBody(from: Pt, to: Pt, startInset: number, endInset: number): string {
	const dx = to[0] - from[0]
	const dy = to[1] - from[1]
	const len = Math.hypot(dx, dy)
	if (len < 1e-6 || startInset + endInset >= len - 1) {
		return `M ${from[0]} ${from[1]} L ${to[0]} ${to[1]}`
	}
	const ux = dx / len
	const uy = dy / len
	const a: Pt = [from[0] + ux * startInset, from[1] + uy * startInset]
	const b: Pt = [to[0] - ux * endInset, to[1] - uy * endInset]
	return `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`
}

// vim: ts=4

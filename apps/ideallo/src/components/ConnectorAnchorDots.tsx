// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Drop-target affordance while a connector terminal is being placed: an outline around the
 * target shape plus the anchor points it offers.
 *
 * Rendered in WORLD space (these are transient, unlike the endpoint handles which need the
 * fixed screen-space layer), so radii are divided by scale to stay a constant size on screen.
 */

import * as React from 'react'

import {
	anchorHandlePoints,
	anchorWorldPoint,
	type ShapeGeometry,
	shapeRotationCenter,
	shouldShowAllAnchors
} from '../connectors/index.js'
import type { AnchorPointType } from '../crdt/index.js'
import { rotatePoint } from '../utils/geometry.js'

export interface ConnectorAnchorDotsProps {
	shape: ShapeGeometry | null
	scale: number
	/** The anchor that would be picked if the pointer were released now */
	activeAnchor?: AnchorPointType | null
	/**
	 * World point of the free anchor a release would place, when the pointer is not near any of
	 * the 9 dots. Drawn as a tenth dot so free placement is never invisible.
	 */
	freeAnchor?: [number, number] | null
}

const DOT_SCREEN_RADIUS = 4
const HALO_SCREEN_RADIUS = 6

export function ConnectorAnchorDots({
	shape,
	scale,
	activeAnchor,
	freeAnchor
}: ConnectorAnchorDotsProps) {
	if (!shape) return null

	const box = shape.bounds
	const r = DOT_SCREEN_RADIUS / scale
	const haloR = HALO_SCREEN_RADIUS / scale

	// A rotated shape's AABB is bigger than the shape and misaligned with it, so an upright rect
	// would sit visibly wrong under dots that DO follow the rotation. Trace the rotated box.
	const corners: [number, number][] | null = shape.rotation
		? (
				[
					[box.x, box.y],
					[box.x + box.width, box.y],
					[box.x + box.width, box.y + box.height],
					[box.x, box.y + box.height]
				] as [number, number][]
			).map((p) => rotatePoint(p, shapeRotationCenter(shape), shape.rotation))
		: null

	// Below ~72px on screen the 9 capture radii start overlapping and picking an anchor becomes
	// a coin flip. That happens on desktop when zoomed out just as it does on a phone, so the
	// degradation is driven by screen size, not by device class.
	const dots = shouldShowAllAnchors(shape, scale)
		? anchorHandlePoints(shape)
		: [{ anchor: 'center' as AnchorPointType, point: anchorWorldPoint(shape, 'center') }]

	return (
		<g className="connector-target-affordance" pointerEvents="none">
			{corners ? (
				<polygon
					className="connector-target"
					points={corners.map((p) => `${p[0]},${p[1]}`).join(' ')}
					strokeWidth={2 / scale}
					fill="none"
				/>
			) : (
				<rect
					className="connector-target"
					x={box.x}
					y={box.y}
					width={box.width}
					height={box.height}
					strokeWidth={2 / scale}
					fill="none"
				/>
			)}
			{dots.map(({ anchor, point }) => (
				<g key={anchor}>
					{/* Dark halo under the dot: a white dot on a white-filled shape is invisible */}
					<circle
						className="connector-anchor-halo"
						cx={point[0]}
						cy={point[1]}
						r={haloR}
						strokeWidth={2 / scale}
					/>
					<circle
						className={
							activeAnchor === anchor
								? 'connector-anchor-dot active'
								: 'connector-anchor-dot'
						}
						cx={point[0]}
						cy={point[1]}
						r={r}
						strokeWidth={1.5 / scale}
					/>
				</g>
			))}
			{/* The tenth dot: where a release would land when it is not near any of the 9 */}
			{freeAnchor && (
				<g>
					<circle
						className="connector-anchor-halo"
						cx={freeAnchor[0]}
						cy={freeAnchor[1]}
						r={haloR}
						strokeWidth={2 / scale}
					/>
					<circle
						className="connector-anchor-dot free active"
						cx={freeAnchor[0]}
						cy={freeAnchor[1]}
						r={r}
						strokeWidth={1.5 / scale}
					/>
				</g>
			)}
		</g>
	)
}

// vim: ts=4

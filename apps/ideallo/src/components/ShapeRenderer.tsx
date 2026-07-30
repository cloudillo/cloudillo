// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
/**
 * Renders shape objects (rect, ellipse, connector, polygon)
 *
 * LOAD-BEARING: a cleared paint must stay `fill="transparent"` - what colorToCss returns - and
 * must NEVER be "optimised" to `fill="none"`. A transparent paint keeps the element hit-testable
 * under `pointer-events: visiblePainted`; `none` does not. That DOM hit area is what delivers the
 * double-click ObjectRenderer turns into "add a label inside this hollow shape", and what lets a
 * hollow shape be grabbed at all.
 */

import type { ConnectorObject, EllipseObject, PolygonObject, RectObject } from '../crdt/index.js'
import { colorToCss } from '../utils/palette.js'
import { ConnectorPath } from './ConnectorPath.js'

export interface RectRendererProps {
	object: RectObject
}

export function RectRenderer({ object }: RectRendererProps) {
	const { x, y, width, height, cornerRadius, style } = object

	// Note: Rotation is handled by ObjectRenderer wrapper
	return (
		<rect
			x={x}
			y={y}
			width={width}
			height={height}
			rx={cornerRadius}
			fill={colorToCss(style.fillColor)}
			stroke={colorToCss(style.strokeColor)}
			strokeWidth={style.strokeWidth}
			strokeDasharray={
				style.strokeStyle === 'dashed'
					? '8,4'
					: style.strokeStyle === 'dotted'
						? '2,4'
						: undefined
			}
			opacity={style.opacity}
		/>
	)
}

export interface EllipseRendererProps {
	object: EllipseObject
}

export function EllipseRenderer({ object }: EllipseRendererProps) {
	const { x, y, width, height, style } = object
	const cx = x + width / 2
	const cy = y + height / 2

	// Note: Rotation is handled by ObjectRenderer wrapper
	return (
		<ellipse
			cx={cx}
			cy={cy}
			rx={width / 2}
			ry={height / 2}
			fill={colorToCss(style.fillColor)}
			stroke={colorToCss(style.strokeColor)}
			strokeWidth={style.strokeWidth}
			strokeDasharray={
				style.strokeStyle === 'dashed'
					? '8,4'
					: style.strokeStyle === 'dotted'
						? '2,4'
						: undefined
			}
			opacity={style.opacity}
		/>
	)
}

export interface ConnectorRendererProps {
	object: ConnectorObject
}

export function ConnectorRenderer({ object }: ConnectorRendererProps) {
	const { startX, startY, endX, endY, startArrow, endArrow, route, style } = object

	return (
		<ConnectorPath
			route={route}
			startX={startX}
			startY={startY}
			endX={endX}
			endY={endY}
			startArrow={startArrow}
			endArrow={endArrow}
			strokeWidth={style.strokeWidth}
			stroke={colorToCss(style.strokeColor)}
			strokeDasharray={
				style.strokeStyle === 'dashed'
					? '8,4'
					: style.strokeStyle === 'dotted'
						? '2,4'
						: undefined
			}
			opacity={style.opacity}
		/>
	)
}

export interface PolygonRendererProps {
	object: PolygonObject
}

export function PolygonRenderer({ object }: PolygonRendererProps) {
	const { vertices, style } = object

	// Build polygon points string
	const pointsStr = vertices.map(([x, y]) => `${x},${y}`).join(' ')

	return (
		<polygon
			points={pointsStr}
			fill={colorToCss(style.fillColor)}
			stroke={colorToCss(style.strokeColor)}
			strokeWidth={style.strokeWidth}
			strokeLinejoin="round"
			strokeDasharray={
				style.strokeStyle === 'dashed'
					? '8,4'
					: style.strokeStyle === 'dotted'
						? '2,4'
						: undefined
			}
			opacity={style.opacity}
		/>
	)
}

// vim: ts=4

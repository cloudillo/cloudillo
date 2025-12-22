// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Renders shape objects (rect, ellipse, line, arrow, polygon)
 */

import * as React from 'react'
import type {
	RectObject,
	EllipseObject,
	LineObject,
	ArrowObject,
	PolygonObject
} from '../crdt/index.js'
import { colorToCss } from '../utils/palette.js'

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

export interface LineRendererProps {
	object: LineObject
}

export function LineRenderer({ object }: LineRendererProps) {
	const { startX, startY, endX, endY, style } = object

	return (
		<line
			x1={startX}
			y1={startY}
			x2={endX}
			y2={endY}
			stroke={colorToCss(style.strokeColor)}
			strokeWidth={style.strokeWidth}
			strokeLinecap="round"
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

export interface ArrowRendererProps {
	object: ArrowObject
}

export function ArrowRenderer({ object }: ArrowRendererProps) {
	const { startX, startY, endX, endY, arrowheadPosition, style } = object

	// Calculate arrowhead dimensions
	const headLength = Math.max(12, style.strokeWidth * 4)
	const headAngle = Math.PI / 6

	const renderArrowhead = (x1: number, y1: number, x2: number, y2: number) => {
		const angle = Math.atan2(y2 - y1, x2 - x1)
		const ax1 = x2 - headLength * Math.cos(angle - headAngle)
		const ay1 = y2 - headLength * Math.sin(angle - headAngle)
		const ax2 = x2 - headLength * Math.cos(angle + headAngle)
		const ay2 = y2 - headLength * Math.sin(angle + headAngle)
		return `${ax1},${ay1} ${x2},${y2} ${ax2},${ay2}`
	}

	return (
		<g
			stroke={colorToCss(style.strokeColor)}
			strokeWidth={style.strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			fill="none"
			opacity={style.opacity}
		>
			<line
				x1={startX}
				y1={startY}
				x2={endX}
				y2={endY}
				strokeDasharray={
					style.strokeStyle === 'dashed'
						? '8,4'
						: style.strokeStyle === 'dotted'
							? '2,4'
							: undefined
				}
			/>
			{(arrowheadPosition === 'end' || arrowheadPosition === 'both') && (
				<polyline points={renderArrowhead(startX, startY, endX, endY)} />
			)}
			{(arrowheadPosition === 'start' || arrowheadPosition === 'both') && (
				<polyline points={renderArrowhead(endX, endY, startX, startY)} />
			)}
		</g>
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

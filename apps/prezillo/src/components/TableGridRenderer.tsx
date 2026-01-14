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
 * Renders table grid objects on the canvas
 *
 * Features:
 * - Visual grid layout helper with snap points
 * - Configurable rows and columns
 * - Optional custom column/row proportions
 * - Border styling via ShapeStyle
 */

import * as React from 'react'
import type { TableGridObject, ResolvedShapeStyle } from '../crdt/index.js'

export interface TableGridRendererProps {
	object: TableGridObject
	style: ResolvedShapeStyle
	/** Bounds for rendering (x, y, width, height) */
	bounds?: {
		x: number
		y: number
		width: number
		height: number
	}
}

/**
 * Calculate grid line positions from count and optional proportions
 * Returns array of positions in pixels from 0 to totalSize
 */
export function calculateGridPositions(
	count: number,
	proportions: number[] | undefined,
	totalSize: number
): number[] {
	const positions: number[] = [0]

	if (proportions && proportions.length === count) {
		// Use custom proportions (normalized to sum to 1)
		const sum = proportions.reduce((a, b) => a + b, 0)
		let cumulative = 0
		for (let i = 0; i < count; i++) {
			cumulative += (proportions[i] / sum) * totalSize
			positions.push(cumulative)
		}
	} else {
		// Equal distribution
		for (let i = 1; i <= count; i++) {
			positions.push((i / count) * totalSize)
		}
	}

	return positions
}

export function TableGridRenderer({ object, style, bounds }: TableGridRendererProps) {
	// Use bounds if provided, otherwise use object properties
	const x = bounds?.x ?? object.x
	const y = bounds?.y ?? object.y
	const width = bounds?.width ?? object.width
	const height = bounds?.height ?? object.height

	const { cols, rows, columnWidths, rowHeights } = object

	// Calculate column and row positions
	const colPositions = calculateGridPositions(cols, columnWidths, width)
	const rowPositions = calculateGridPositions(rows, rowHeights, height)

	// Use stroke style for grid lines (default to light gray)
	const strokeColor = style.stroke || '#e5e7eb'
	const strokeWidth = style.strokeWidth || 1
	const strokeOpacity = style.strokeOpacity ?? 1

	// Use fill style for background (default to transparent/none)
	const fillColor = style.fill || 'none'
	const fillOpacity = style.fillOpacity ?? 1

	return (
		<g className="prezillo-tablegrid">
			{/* Outer border with optional fill */}
			<rect
				x={x}
				y={y}
				width={width}
				height={height}
				fill={fillColor}
				fillOpacity={fillOpacity}
				stroke={strokeColor}
				strokeWidth={strokeWidth}
				strokeOpacity={strokeOpacity}
			/>

			{/* Vertical lines (column dividers) - skip first and last (already in border) */}
			{colPositions.slice(1, -1).map((xPos, i) => (
				<line
					key={`v${i}`}
					x1={x + xPos}
					y1={y}
					x2={x + xPos}
					y2={y + height}
					stroke={strokeColor}
					strokeWidth={strokeWidth}
					strokeOpacity={strokeOpacity}
				/>
			))}

			{/* Horizontal lines (row dividers) - skip first and last (already in border) */}
			{rowPositions.slice(1, -1).map((yPos, i) => (
				<line
					key={`h${i}`}
					x1={x}
					y1={y + yPos}
					x2={x + width}
					y2={y + yPos}
					stroke={strokeColor}
					strokeWidth={strokeWidth}
					strokeOpacity={strokeOpacity}
				/>
			))}
		</g>
	)
}

// vim: ts=4

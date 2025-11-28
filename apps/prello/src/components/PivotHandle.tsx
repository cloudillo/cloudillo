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
 * PivotHandle - A draggable crosshair indicator for the rotation pivot point
 *
 * Renders a crosshair at the pivot point that users can drag to change
 * the rotation center. Always visible when an object is selected.
 */

import * as React from 'react'
import type { Bounds } from '../crdt'

export interface PivotHandleProps {
	bounds: Bounds
	rotation: number
	pivotX: number
	pivotY: number
	scale: number  // Current canvas zoom scale for consistent handle size
	onPivotDragStart: (e: React.MouseEvent) => void
	isDragging?: boolean  // Whether pivot is being dragged
	snapEnabled?: boolean  // Whether snap to objects is enabled
	snappedPoint?: { x: number; y: number } | null  // Currently snapped point (normalized 0-1)
	originalBounds?: Bounds  // Original bounds before position compensation (for snap points)
	initialPivot?: { x: number; y: number }  // Initial pivot for rotation transform of snap points
}

// Pivot snap points: center, corners, and edge midpoints (in normalized 0-1 coordinates)
export const PIVOT_SNAP_POINTS = [
	{ x: 0.5, y: 0.5, label: 'center' },     // Center
	{ x: 0, y: 0, label: 'top-left' },       // Top-left corner
	{ x: 1, y: 0, label: 'top-right' },      // Top-right corner
	{ x: 0, y: 1, label: 'bottom-left' },    // Bottom-left corner
	{ x: 1, y: 1, label: 'bottom-right' },   // Bottom-right corner
	{ x: 0.5, y: 0, label: 'top' },          // Top edge midpoint
	{ x: 0.5, y: 1, label: 'bottom' },       // Bottom edge midpoint
	{ x: 0, y: 0.5, label: 'left' },         // Left edge midpoint
	{ x: 1, y: 0.5, label: 'right' },        // Right edge midpoint
] as const

// Snap threshold in normalized coordinates (how close to snap)
export const PIVOT_SNAP_THRESHOLD = 0.08

export function PivotHandle({
	bounds,
	rotation,
	pivotX,
	pivotY,
	scale,
	onPivotDragStart,
	isDragging = false,
	snapEnabled = false,
	snappedPoint = null,
	originalBounds,
	initialPivot
}: PivotHandleProps) {
	// Calculate pivot point in absolute coordinates
	const cx = bounds.x + bounds.width * pivotX
	const cy = bounds.y + bounds.height * pivotY

	// Use original bounds for snap points (they should stay fixed during drag)
	const snapBounds = originalBounds || bounds
	// Use initial pivot for snap points rotation (so they stay aligned with object)
	const snapPivotX = initialPivot?.x ?? pivotX
	const snapPivotY = initialPivot?.y ?? pivotY

	// Scale-independent sizes
	const circleRadius = 6 / scale
	const crosshairSize = 10 / scale
	const strokeWidth = 2 / scale
	const hitAreaRadius = 12 / scale
	const snapPointRadius = 4 / scale
	const snapPointActiveRadius = 6 / scale

	// Calculate snap point positions in absolute coordinates (using original bounds)
	const snapPointPositions = PIVOT_SNAP_POINTS.map(point => ({
		...point,
		absX: snapBounds.x + snapBounds.width * point.x,
		absY: snapBounds.y + snapBounds.height * point.y,
		isSnapped: snappedPoint &&
			Math.abs(snappedPoint.x - point.x) < 0.001 &&
			Math.abs(snappedPoint.y - point.y) < 0.001
	}))

	return (
		<g style={{ pointerEvents: 'all' }}>
			{/* Snap point indicators - shown when dragging with snap enabled */}
			{isDragging && snapEnabled && (
				<g transform={`rotate(${rotation} ${snapBounds.x + snapBounds.width * snapPivotX} ${snapBounds.y + snapBounds.height * snapPivotY})`}>
					{snapPointPositions.map(({ x, y, label, absX, absY, isSnapped }) => (
						<g key={label}>
							{/* Snap point dot */}
							<circle
								cx={absX}
								cy={absY}
								r={isSnapped ? snapPointActiveRadius : snapPointRadius}
								fill={isSnapped ? '#ff6600' : 'rgba(255, 102, 0, 0.3)'}
								stroke={isSnapped ? '#ff6600' : 'rgba(255, 102, 0, 0.6)'}
								strokeWidth={strokeWidth / 2}
								pointerEvents="none"
							/>
							{/* Larger glow when snapped */}
							{isSnapped && (
								<circle
									cx={absX}
									cy={absY}
									r={snapPointActiveRadius * 2}
									fill="none"
									stroke="#ff6600"
									strokeWidth={strokeWidth / 2}
									strokeOpacity={0.3}
									pointerEvents="none"
								/>
							)}
						</g>
					))}
				</g>
			)}

			{/* Main pivot handle - rotates with object */}
			<g transform={`rotate(${rotation} ${cx} ${cy})`}>
				{/* Crosshair circle */}
				<circle
					cx={cx}
					cy={cy}
					r={circleRadius}
					fill="none"
					stroke="#ff6600"
					strokeWidth={strokeWidth}
					pointerEvents="none"
				/>
				{/* Horizontal crosshair line */}
				<line
					x1={cx - crosshairSize}
					y1={cy}
					x2={cx + crosshairSize}
					y2={cy}
					stroke="#ff6600"
					strokeWidth={strokeWidth / 2}
					pointerEvents="none"
				/>
				{/* Vertical crosshair line */}
				<line
					x1={cx}
					y1={cy - crosshairSize}
					x2={cx}
					y2={cy + crosshairSize}
					stroke="#ff6600"
					strokeWidth={strokeWidth / 2}
					pointerEvents="none"
				/>
				{/* Invisible larger hit area for easier dragging */}
				<circle
					cx={cx}
					cy={cy}
					r={hitAreaRadius}
					fill="transparent"
					style={{ cursor: 'move' }}
					onMouseDown={onPivotDragStart}
				/>
			</g>
		</g>
	)
}

// vim: ts=4

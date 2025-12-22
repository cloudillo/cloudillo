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
import type { Bounds, Point } from 'react-svg-canvas'
import { DEFAULT_PIVOT_SNAP_POINTS } from 'react-svg-canvas'

export interface PivotHandleProps {
	/** Bounding box of the object (in screen space) - used for crosshair position */
	bounds: Bounds
	/** Original bounds before compensation (for snap points during drag) */
	originalBounds?: Bounds
	/** Initial pivot at drag start (for snap point rotation center) */
	initialPivot?: Point
	/** Current rotation in degrees */
	rotation: number
	/** Pivot X (0-1 normalized) */
	pivotX: number
	/** Pivot Y (0-1 normalized) */
	pivotY: number
	/** Canvas zoom scale for consistent handle sizing */
	scale: number
	/** Called when pivot drag starts */
	onPivotDragStart: (e: React.PointerEvent) => void
	/** Whether pivot is being dragged */
	isDragging?: boolean
	/** Whether snap to objects is enabled */
	snapEnabled?: boolean
	/** Currently snapped point (normalized 0-1) */
	snappedPoint?: Point | null

	// Customization
	/** Snap points (normalized coordinates), default: 9 standard points */
	snapPoints?: Point[]
	/** Crosshair color, default: #ff6600 (orange) */
	crosshairColor?: string
	/** Snap indicator color, default: #ff6600 */
	snapIndicatorColor?: string
}

export function PivotHandle({
	bounds,
	originalBounds,
	initialPivot,
	rotation,
	pivotX,
	pivotY,
	scale,
	onPivotDragStart,
	isDragging = false,
	snapEnabled = false,
	snappedPoint = null,
	snapPoints = DEFAULT_PIVOT_SNAP_POINTS,
	crosshairColor = '#ff6600',
	snapIndicatorColor = '#ff6600'
}: PivotHandleProps) {
	// Simple pivot position calculation.
	// When position compensation is applied correctly to the object during pivot drag,
	// this simple formula gives the correct crosshair position that matches the mouse.
	// No rotation calculation needed for position - only the crosshair LINES are rotated.
	const cx = bounds.x + bounds.width * pivotX
	const cy = bounds.y + bounds.height * pivotY

	// Scale-independent sizes
	const circleRadius = 6 / scale
	const crosshairSize = 10 / scale
	const strokeWidth = 2 / scale
	const hitAreaRadius = 12 / scale
	const snapPointRadius = 4 / scale
	const snapPointActiveRadius = 6 / scale

	// Snap points should be at positions where the crosshair would be if it snapped there.
	// Objects rotate around their pivot (not geometric center), so snap points must also
	// rotate around the initial pivot position. When not dragging, default to center (0.5, 0.5).
	const snapBounds = originalBounds ?? bounds
	const rad = rotation * (Math.PI / 180)
	const cos = Math.cos(rad)
	const sin = Math.sin(rad)
	// Use initial pivot as rotation center (objects rotate around their pivot, not their center)
	const snapPivotX = initialPivot?.x ?? 0.5
	const snapPivotY = initialPivot?.y ?? 0.5
	const snapCenterX = snapBounds.x + snapBounds.width * snapPivotX
	const snapCenterY = snapBounds.y + snapBounds.height * snapPivotY

	const snapPointPositions = React.useMemo(
		() =>
			snapPoints.map((point, index) => {
				// Calculate position relative to pivot (not center!), then rotate
				const localX = (point.x - snapPivotX) * snapBounds.width
				const localY = (point.y - snapPivotY) * snapBounds.height
				const rotatedX = localX * cos - localY * sin
				const rotatedY = localX * sin + localY * cos
				return {
					x: point.x,
					y: point.y,
					absX: snapCenterX + rotatedX,
					absY: snapCenterY + rotatedY,
					isSnapped:
						snappedPoint != null &&
						Math.abs(snappedPoint.x - point.x) < 0.001 &&
						Math.abs(snappedPoint.y - point.y) < 0.001,
					key: `snap-${index}`
				}
			}),
		[
			snapPoints,
			snapBounds,
			snappedPoint,
			snapCenterX,
			snapCenterY,
			snapPivotX,
			snapPivotY,
			cos,
			sin
		]
	)

	return (
		<g style={{ pointerEvents: 'all' }}>
			{/* Snap point indicators - shown when dragging with snap enabled */}
			{isDragging && snapEnabled && (
				<g>
					{snapPointPositions.map(({ absX, absY, isSnapped, key }) => (
						<g key={key}>
							{/* Snap point dot */}
							<circle
								cx={absX}
								cy={absY}
								r={isSnapped ? snapPointActiveRadius : snapPointRadius}
								fill={isSnapped ? snapIndicatorColor : `${snapIndicatorColor}4d`}
								stroke={isSnapped ? snapIndicatorColor : `${snapIndicatorColor}99`}
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
									stroke={snapIndicatorColor}
									strokeWidth={strokeWidth / 2}
									strokeOpacity={0.3}
									pointerEvents="none"
								/>
							)}
						</g>
					))}
				</g>
			)}

			{/* Main pivot handle - crosshair lines rotate around the pivot point itself */}
			<g transform={`rotate(${rotation} ${cx} ${cy})`}>
				{/* Crosshair circle */}
				<circle
					cx={cx}
					cy={cy}
					r={circleRadius}
					fill="none"
					stroke={crosshairColor}
					strokeWidth={strokeWidth}
					pointerEvents="none"
				/>
				{/* Horizontal crosshair line */}
				<line
					x1={cx - crosshairSize}
					y1={cy}
					x2={cx + crosshairSize}
					y2={cy}
					stroke={crosshairColor}
					strokeWidth={strokeWidth / 2}
					pointerEvents="none"
				/>
				{/* Vertical crosshair line */}
				<line
					x1={cx}
					y1={cy - crosshairSize}
					x2={cx}
					y2={cy + crosshairSize}
					stroke={crosshairColor}
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
					onPointerDown={(e) => {
						e.stopPropagation()
						e.preventDefault()
						onPivotDragStart(e)
					}}
				/>
			</g>
		</g>
	)
}

// vim: ts=4

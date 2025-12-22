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
 * TransformGizmo - Combined selection box with rotation and pivot handles
 *
 * Combines SelectionBox (from react-svg-canvas) with RotationHandle and PivotHandle
 * for a complete object transformation UI.
 */

import * as React from 'react'
import type { Bounds, Point, ResizeHandle } from 'react-svg-canvas'
import { SelectionBox } from 'react-svg-canvas'
import { RotationHandle } from './RotationHandle'
import { PivotHandle } from './PivotHandle'

export interface TransformGizmoProps {
	/** Bounding box of the selection (screen coordinates) */
	bounds: Bounds
	/** Current rotation in degrees */
	rotation: number
	/** Canvas zoom scale */
	scale: number

	// Single object mode: normalized pivot within bounds
	/** Pivot X (0-1 normalized), default 0.5 */
	pivotX?: number
	/** Pivot Y (0-1 normalized), default 0.5 */
	pivotY?: number

	// Multi-select mode: absolute pivot position in canvas coords
	/** Whether multiple objects are selected */
	isMultiSelect?: boolean
	/** Group pivot position (canvas coordinates) - used when isMultiSelect is true */
	groupPivot?: Point

	// Visibility controls
	/** Show resize handles, default true */
	showResizeHandles?: boolean
	/** Show rotation handle, default true */
	showRotationHandle?: boolean
	/** Show pivot handle, default true */
	showPivotHandle?: boolean

	// Event handlers
	/** Called when resize starts */
	onResizeStart?: (handle: ResizeHandle, e: React.PointerEvent) => void
	/** Called when rotation starts */
	onRotateStart?: (e: React.PointerEvent) => void
	/** Called when pivot drag starts */
	onPivotDragStart?: (e: React.PointerEvent) => void
	/** Called when a snap angle is clicked */
	onSnapClick?: (angle: number) => void

	// State for visual feedback
	/** Rotation state for visual feedback */
	rotationState?: {
		isRotating: boolean
		isSnapActive: boolean
	}
	/** Pivot state for visual feedback */
	pivotState?: {
		isDragging: boolean
		snappedPoint: Point | null
	}

	// Customization
	/** Arc color for rotation handle */
	arcColor?: string
	/** Crosshair color for pivot handle */
	crosshairColor?: string
}

export function TransformGizmo({
	bounds,
	rotation,
	scale,
	pivotX = 0.5,
	pivotY = 0.5,
	isMultiSelect = false,
	groupPivot,
	showResizeHandles = true,
	showRotationHandle = true,
	showPivotHandle = true,
	onResizeStart,
	onRotateStart,
	onPivotDragStart,
	onSnapClick,
	rotationState,
	pivotState,
	arcColor,
	crosshairColor
}: TransformGizmoProps) {
	// For multi-select, calculate normalized pivot from group pivot
	const effectivePivotX =
		isMultiSelect && groupPivot ? (groupPivot.x - bounds.x) / bounds.width : pivotX
	const effectivePivotY =
		isMultiSelect && groupPivot ? (groupPivot.y - bounds.y) / bounds.height : pivotY

	return (
		<g>
			{/* Selection box with resize handles */}
			{showResizeHandles && (
				<SelectionBox
					bounds={bounds}
					rotation={rotation}
					pivotX={effectivePivotX}
					pivotY={effectivePivotY}
					onResizeStart={onResizeStart}
				/>
			)}

			{/* Rotation handle */}
			{showRotationHandle && onRotateStart && (
				<RotationHandle
					bounds={bounds}
					rotation={rotation}
					pivotX={effectivePivotX}
					pivotY={effectivePivotY}
					scale={scale}
					onRotateStart={onRotateStart}
					onSnapClick={onSnapClick}
					isRotating={rotationState?.isRotating}
					isSnapActive={rotationState?.isSnapActive}
					arcColor={arcColor}
				/>
			)}

			{/* Pivot handle */}
			{showPivotHandle && onPivotDragStart && (
				<PivotHandle
					bounds={bounds}
					rotation={rotation}
					pivotX={effectivePivotX}
					pivotY={effectivePivotY}
					scale={scale}
					onPivotDragStart={onPivotDragStart}
					isDragging={pivotState?.isDragging}
					snapEnabled={true}
					snappedPoint={pivotState?.snappedPoint}
					crosshairColor={crosshairColor}
				/>
			)}
		</g>
	)
}

// vim: ts=4

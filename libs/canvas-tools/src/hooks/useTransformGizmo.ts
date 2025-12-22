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
 * useTransformGizmo - High-level hook combining rotation and pivot handling
 *
 * Combines useRotatable, usePivotDrag, and useGroupPivot from react-svg-canvas
 * into a single convenient hook for common transform scenarios.
 */

import * as React from 'react'
import type { Bounds, Point } from 'react-svg-canvas'
import {
	useRotatable,
	usePivotDrag,
	useGroupPivot,
	type RotatableOptions,
	type PivotDragOptions,
	type GroupPivotOptions,
	type RotationState,
	type PivotState,
	type GroupPivotState,
	type RotatedObjectBounds,
	type TransformedObject
} from 'react-svg-canvas'

export interface TransformGizmoOptions {
	/** Selection bounds */
	bounds: Bounds
	/** Current rotation in degrees */
	rotation: number
	/** Pivot X (0-1 normalized) for single object mode */
	pivotX?: number
	/** Pivot Y (0-1 normalized) for single object mode */
	pivotY?: number

	// Multi-select support
	/** Whether multiple objects are selected */
	isMultiSelect?: boolean
	/** Objects for group rotation (when isMultiSelect is true) */
	objects?: RotatedObjectBounds[]

	// Callbacks
	/** Called when rotation starts */
	onRotateStart?: (angle: number) => void
	/** Called during rotation */
	onRotate?: (angle: number, isSnapped: boolean) => void
	/** Called when rotation ends */
	onRotateEnd?: (angle: number) => void
	/** Called when pivot drag starts */
	onPivotDragStart?: (pivot: Point) => void
	/** Called during pivot drag */
	onPivotDrag?: (pivot: Point, snappedPoint: Point | null, positionCompensation: Point) => void
	/** Called when pivot drag ends */
	onPivotDragEnd?: (pivot: Point, positionCompensation: Point) => void
	/** Called during group rotation with transformed objects */
	onGroupRotate?: (angle: number, transformedObjects: TransformedObject[]) => void
	/** Called when group pivot changes */
	onGroupPivotChange?: (pivot: Point) => void

	/** Disable all interactions */
	disabled?: boolean
}

export interface TransformGizmoState {
	// Rotation state
	isRotating: boolean
	isSnapActive: boolean
	rotationAngle: number

	// Pivot state (single object)
	isPivotDragging: boolean
	pivotX: number
	pivotY: number
	pivotSnappedPoint: Point | null

	// Group pivot state (multi-select)
	isGroupPivotDragging: boolean
	groupPivot: Point
	isGroupPivotCustom: boolean
}

export interface TransformGizmoHandlers {
	handleRotateStart: (e: React.PointerEvent) => void
	handlePivotDragStart: (e: React.PointerEvent) => void
	handleGroupPivotDragStart: (e: React.PointerEvent) => void
	handleSnapClick: (angle: number) => void
	resetGroupPivotToCenter: () => void
}

export interface UseTransformGizmoReturn {
	/** Combined state */
	state: TransformGizmoState
	/** Event handlers to pass to TransformGizmo */
	handlers: TransformGizmoHandlers
	/** Current transform values */
	transform: {
		rotation: number
		pivotX: number
		pivotY: number
		groupPivot: Point | null
	}
	/** Props ready to spread onto TransformGizmo component */
	gizmoProps: {
		rotationState: { isRotating: boolean; isSnapActive: boolean }
		pivotState: { isDragging: boolean; snappedPoint: Point | null }
	}
}

export function useTransformGizmo(options: TransformGizmoOptions): UseTransformGizmoReturn {
	const {
		bounds,
		rotation,
		pivotX = 0.5,
		pivotY = 0.5,
		isMultiSelect = false,
		objects = [],
		onRotateStart,
		onRotate,
		onRotateEnd,
		onPivotDragStart,
		onPivotDrag,
		onPivotDragEnd,
		onGroupRotate,
		onGroupPivotChange,
		disabled = false
	} = options

	// Use single-object rotation hook
	const rotatable = useRotatable({
		bounds,
		rotation,
		pivotX,
		pivotY,
		onRotateStart,
		onRotate,
		onRotateEnd,
		disabled: disabled || isMultiSelect
	})

	// Use single-object pivot drag hook
	const pivotDrag = usePivotDrag({
		bounds,
		rotation,
		pivotX,
		pivotY,
		onDragStart: onPivotDragStart,
		onDrag: onPivotDrag,
		onDragEnd: onPivotDragEnd,
		disabled: disabled || isMultiSelect
	})

	// Use group pivot hook for multi-select
	const groupPivot = useGroupPivot({
		objects,
		selectionBounds: bounds,
		onDragStart: onGroupPivotChange,
		onDrag: onGroupPivotChange,
		onDragEnd: onGroupPivotChange,
		onRotate: onGroupRotate,
		disabled: disabled || !isMultiSelect
	})

	// Handle snap click - set rotation directly to clicked angle
	const handleSnapClick = React.useCallback(
		(angle: number) => {
			onRotate?.(angle, true)
			onRotateEnd?.(angle)
		},
		[onRotate, onRotateEnd]
	)

	// Combined state
	const state: TransformGizmoState = {
		isRotating: rotatable.rotationState.isRotating,
		isSnapActive: rotatable.rotationState.isInSnapZone,
		rotationAngle: rotatable.rotationState.currentAngle,
		isPivotDragging: pivotDrag.pivotState.isDragging,
		pivotX: pivotDrag.pivotState.pivotX,
		pivotY: pivotDrag.pivotState.pivotY,
		pivotSnappedPoint: pivotDrag.pivotState.snappedPoint,
		isGroupPivotDragging: groupPivot.groupPivotState.isDragging,
		groupPivot: groupPivot.groupPivot,
		isGroupPivotCustom: groupPivot.groupPivotState.isPivotCustom
	}

	// Handlers
	const handlers: TransformGizmoHandlers = {
		handleRotateStart: rotatable.handleRotateStart,
		handlePivotDragStart: pivotDrag.handlePivotDragStart,
		handleGroupPivotDragStart: groupPivot.handleGroupPivotDragStart,
		handleSnapClick,
		resetGroupPivotToCenter: groupPivot.resetPivotToCenter
	}

	// Transform values
	const transform = {
		rotation,
		pivotX: isMultiSelect
			? (groupPivot.groupPivot.x - bounds.x) / bounds.width
			: pivotDrag.pivotState.pivotX,
		pivotY: isMultiSelect
			? (groupPivot.groupPivot.y - bounds.y) / bounds.height
			: pivotDrag.pivotState.pivotY,
		groupPivot: isMultiSelect ? groupPivot.groupPivot : null
	}

	// Props for TransformGizmo component
	const gizmoProps = {
		rotationState: {
			isRotating: rotatable.rotationState.isRotating,
			isSnapActive: rotatable.rotationState.isInSnapZone
		},
		pivotState: {
			isDragging: isMultiSelect
				? groupPivot.groupPivotState.isDragging
				: pivotDrag.pivotState.isDragging,
			snappedPoint: isMultiSelect ? null : pivotDrag.pivotState.snappedPoint
		}
	}

	return {
		state,
		handlers,
		transform,
		gizmoProps
	}
}

// vim: ts=4

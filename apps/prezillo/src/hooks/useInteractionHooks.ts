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
 * Hook for resize/rotate/pivot interaction configuration
 *
 * Wraps react-svg-canvas's useResizable, useRotatable, and usePivotDrag
 * with prezillo-specific CRDT commit logic, awareness broadcasting,
 * and canvas coordinate transforms.
 */

import * as React from 'react'
import {
	useResizable,
	useRotatable,
	usePivotDrag,
	DEFAULT_PIVOT_SNAP_POINTS,
	DEFAULT_PIVOT_SNAP_THRESHOLD,
	type SvgCanvasContext,
	type ResizeHandle
} from 'react-svg-canvas'
import { calculateArcRadius } from '@cloudillo/canvas-tools'

import type { ObjectId, TemplateId, Bounds, PrezilloObject } from '../crdt'
import {
	updateObjectBounds,
	updateObjectRotation,
	updateObjectPivot,
	isInstance,
	isPropertyGroupLocked,
	getResolvedWh
} from '../crdt'
import { setEditingState, clearEditingState } from '../awareness'
import type { UsePrezilloDocumentResult } from './usePrezilloDocument'
import type { UseSnapSettingsResult } from './useSnappingConfig'
import type { TempObjectState } from './useObjectDrag'
import type { TemplateLayout } from './useTemplateLayout'

/**
 * Extended canvas object type (with template metadata)
 */
type CanvasObject = PrezilloObject & {
	_templateId?: TemplateId
	_isPrototype?: boolean
}

/**
 * Stored selection with offset info for coordinate conversion
 */
export interface StoredSelection {
	id: ObjectId
	bounds: { x: number; y: number; width: number; height: number }
	rotation: number
	pivotX: number
	pivotY: number
	pageOffset?: { x: number; y: number }
	prototypeTemplateOffset?: { x: number; y: number }
}

/**
 * Ref type for capturing interaction start state
 */
export type InteractionStartRef = React.MutableRefObject<StoredSelection | null>

export interface UseInteractionHooksOptions {
	prezillo: UsePrezilloDocumentResult
	canvasObjects: CanvasObject[]
	canvasContextRef: React.MutableRefObject<SvgCanvasContext | null>
	canvasScale: number
	templateLayouts: Map<TemplateId, TemplateLayout>
	snapSettings: UseSnapSettingsResult
	snapResizeRef: React.MutableRefObject<any>
	clearSnaps: () => void
	isReadOnly: boolean
	setTempObjectState: React.Dispatch<React.SetStateAction<TempObjectState | null>>
	justFinishedInteractionRef: React.MutableRefObject<boolean>
}

export interface UseInteractionHooksResult {
	// Shared state
	storedSelection: StoredSelection | null
	interactionStartRef: InteractionStartRef

	// Resize
	isResizing: boolean
	activeHandle: any
	handleResizeStart: (handle: ResizeHandle, e: React.PointerEvent) => void

	// Rotation
	rotationState: { isRotating: boolean; isInSnapZone: boolean }
	hookRotateStart: (e: React.PointerEvent) => void

	// Pivot
	pivotState: { isDragging: boolean; snappedPoint: any }
	hookPivotDragStart: (e: React.PointerEvent) => void
}

export function useInteractionHooks({
	prezillo,
	canvasObjects,
	canvasContextRef,
	canvasScale,
	templateLayouts,
	snapSettings,
	snapResizeRef,
	clearSnaps,
	isReadOnly,
	setTempObjectState,
	justFinishedInteractionRef
}: UseInteractionHooksOptions): UseInteractionHooksResult {
	// Ref to capture initial selection state at interaction start (prevents stale closure issues)
	const interactionStartRef = React.useRef<StoredSelection | null>(null)

	// Get canvas bounds for the single selected object (used by resize/rotate/pivot hooks)
	// Uses canvasObjects which has global canvas coordinates matching the rendering
	// Also includes offset info for converting back to stored coords when saving
	const storedSelection = React.useMemo(() => {
		if (prezillo.selectedIds.size !== 1) return null
		const id = Array.from(prezillo.selectedIds)[0]

		// Look up from canvasObjects to get global canvas coordinates
		const canvasObj = canvasObjects.find((o) => o.id === id)
		if (!canvasObj) return null

		// Calculate offsets for converting canvas coords back to stored coords
		let pageOffset: { x: number; y: number } | undefined
		let prototypeTemplateOffset: { x: number; y: number } | undefined

		// Check for prototype on template frame
		if (canvasObj._isPrototype && canvasObj._templateId) {
			const layout = templateLayouts.get(canvasObj._templateId)
			if (layout) {
				prototypeTemplateOffset = { x: layout.x, y: layout.y }
			}
		}

		// Check for page-relative object
		const stored = prezillo.doc.o.get(id)
		if (stored?.vi) {
			const view = prezillo.doc.v.get(stored.vi)
			if (view) {
				pageOffset = { x: view.x, y: view.y }
			}
		}

		return {
			id: id as ObjectId,
			bounds: {
				x: canvasObj.x,
				y: canvasObj.y,
				width: canvasObj.width,
				height: canvasObj.height
			},
			rotation: canvasObj.rotation ?? 0,
			pivotX: canvasObj.pivotX ?? 0.5,
			pivotY: canvasObj.pivotY ?? 0.5,
			// Offsets for converting back to stored coords when saving
			pageOffset,
			prototypeTemplateOffset
		}
	}, [prezillo.selectedIds, canvasObjects, templateLayouts, prezillo.doc.o, prezillo.doc.v])

	// Ref to access latest storedSelection from callbacks (avoids stale closure)
	const storedSelectionRef = React.useRef(storedSelection)
	storedSelectionRef.current = storedSelection

	// Compute aspect ratio for single image/qrcode/symbol selection
	// This is used by useResizable for aspect-locked resize
	const selectionAspectRatio = React.useMemo(() => {
		if (prezillo.selectedIds.size !== 1) return undefined
		const id = Array.from(prezillo.selectedIds)[0]
		const stored = prezillo.doc.o.get(id)
		if (!stored) return undefined
		// Get dimensions using centralized prototype resolution
		const wh = getResolvedWh(prezillo.doc, stored)
		if (!wh) return undefined
		// 'I' = image type - preserve original aspect ratio
		if (stored.t === 'I') return wh[0] / wh[1]
		// 'Q' = qrcode type - always square (1:1)
		if (stored.t === 'Q') return 1
		// 'S' = symbol type - always square (1:1)
		if (stored.t === 'S') return 1
		return undefined
	}, [prezillo.selectedIds, prezillo.objects])

	// Transform functions that use canvasContextRef (since hooks are outside SvgCanvas context)
	const translateToRef = React.useCallback(
		(x: number, y: number): [number, number] => {
			const ctx = canvasContextRef.current
			if (!ctx?.translateTo) return [x, y]
			return ctx.translateTo(x, y)
		},
		[canvasContextRef]
	)

	const translateFromRef = React.useCallback(
		(x: number, y: number): [number, number] => {
			const ctx = canvasContextRef.current
			if (!ctx?.translateFrom) return [x, y]
			return ctx.translateFrom(x, y)
		},
		[canvasContextRef]
	)

	// Custom transform for useResizable (takes clientX, clientY, element)
	const resizeTransformCoordinates = React.useCallback(
		(clientX: number, clientY: number, element: Element): { x: number; y: number } => {
			const ctx = canvasContextRef.current
			if (!ctx?.translateTo) {
				// Fallback to basic rect-based transform
				const rect = element.getBoundingClientRect()
				return { x: clientX - rect.left, y: clientY - rect.top }
			}
			const rect = element.getBoundingClientRect()
			const [x, y] = ctx.translateTo(clientX - rect.left, clientY - rect.top)
			return { x, y }
		},
		[canvasContextRef]
	)

	// Resize hook - provides rotation-aware resize with snapping
	const { isResizing, activeHandle, handleResizeStart } = useResizable({
		bounds: storedSelection?.bounds ?? { x: 0, y: 0, width: 0, height: 0 },
		rotation: storedSelection?.rotation ?? 0,
		pivotX: storedSelection?.pivotX ?? 0.5,
		pivotY: storedSelection?.pivotY ?? 0.5,
		objectId: storedSelection?.id,
		snapResize: snapResizeRef.current,
		transformCoordinates: resizeTransformCoordinates,
		disabled: isReadOnly || !storedSelection,
		aspectRatio: selectionAspectRatio,
		onResizeStart: ({ handle, bounds }) => {
			// Use ref to get latest storedSelection (react-yjs keeps it updated)
			const current = storedSelectionRef.current
			if (!current) return
			// Block resize for locked template instance size
			if (
				isInstance(prezillo.doc, current.id) &&
				isPropertyGroupLocked(prezillo.doc, current.id, 'size')
			) {
				return
			}
			interactionStartRef.current = current
			setTempObjectState({
				objectId: current.id,
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: bounds.height
			})
		},
		onResize: ({ handle, bounds, originalBounds }) => {
			// Use captured initial state to prevent stale closure issues
			const initial = interactionStartRef.current
			if (!initial) return
			setTempObjectState({
				objectId: initial.id,
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: bounds.height
			})
			// Broadcast to other clients
			if (prezillo.awareness) {
				setEditingState(
					prezillo.awareness,
					initial.id,
					'resize',
					bounds.x,
					bounds.y,
					bounds.width,
					bounds.height
				)
			}
		},
		onResizeEnd: ({ handle, bounds, originalBounds }) => {
			// Use captured initial state to prevent stale closure issues
			const initial = interactionStartRef.current
			if (!initial) return

			// Convert canvas coords back to stored coords for CRDT
			let saveX = bounds.x
			let saveY = bounds.y

			// For prototypes on template frames, subtract template offset
			if (initial.prototypeTemplateOffset) {
				saveX -= initial.prototypeTemplateOffset.x
				saveY -= initial.prototypeTemplateOffset.y
			}

			// For page-relative objects, subtract page offset
			if (initial.pageOffset) {
				saveX -= initial.pageOffset.x
				saveY -= initial.pageOffset.y
			}

			// Commit to CRDT with stored coords
			updateObjectBounds(
				prezillo.yDoc,
				prezillo.doc,
				initial.id,
				saveX,
				saveY,
				bounds.width,
				bounds.height
			)
			// Clear awareness and temp state
			if (prezillo.awareness) {
				clearEditingState(prezillo.awareness)
			}
			clearSnaps()
			setTempObjectState(null)
			interactionStartRef.current = null
			justFinishedInteractionRef.current = true
		}
	})

	// Rotation hook - provides rotation with snap zone
	const {
		rotationState,
		handleRotateStart: hookRotateStart,
		arcRadius,
		pivotPosition
	} = useRotatable({
		bounds: storedSelection?.bounds ?? { x: 0, y: 0, width: 0, height: 0 },
		rotation: storedSelection?.rotation ?? 0,
		// Calculate screen-space arc radius to match the visual RotationHandle exactly
		screenArcRadius: calculateArcRadius({
			bounds: {
				x: 0,
				y: 0, // Position doesn't matter for arc radius calculation
				width: (storedSelection?.bounds.width ?? 0) * canvasScale,
				height: (storedSelection?.bounds.height ?? 0) * canvasScale
			},
			scale: 1 // Screen space, no additional scaling
		}),
		pivotX: storedSelection?.pivotX ?? 0.5,
		pivotY: storedSelection?.pivotY ?? 0.5,
		translateTo: translateToRef,
		translateFrom: translateFromRef,
		screenSpaceSnapZone: true,
		disabled: isReadOnly || !storedSelection,
		onRotateStart: (angle) => {
			// Use ref to get latest storedSelection (react-yjs keeps it updated)
			const current = storedSelectionRef.current
			if (!current) return
			// Block rotation for locked template instance rotation
			if (
				isInstance(prezillo.doc, current.id) &&
				isPropertyGroupLocked(prezillo.doc, current.id, 'rotation')
			) {
				return
			}
			interactionStartRef.current = current
			setTempObjectState({
				objectId: current.id,
				x: current.bounds.x,
				y: current.bounds.y,
				width: current.bounds.width,
				height: current.bounds.height,
				rotation: current.rotation
			})
		},
		onRotate: (newRotation, isSnapped) => {
			// Use captured initial state to prevent stale closure issues
			const initial = interactionStartRef.current
			if (!initial) return
			setTempObjectState({
				objectId: initial.id,
				x: initial.bounds.x,
				y: initial.bounds.y,
				width: initial.bounds.width,
				height: initial.bounds.height,
				rotation: newRotation
			})
			// Broadcast to other clients
			if (prezillo.awareness) {
				setEditingState(
					prezillo.awareness,
					initial.id,
					'rotate',
					initial.bounds.x,
					initial.bounds.y,
					initial.bounds.width,
					initial.bounds.height,
					newRotation
				)
			}
		},
		onRotateEnd: (finalRotation) => {
			// Use captured initial state to prevent stale closure issues
			const initial = interactionStartRef.current
			if (!initial) return
			// Commit to CRDT
			updateObjectRotation(prezillo.yDoc, prezillo.doc, initial.id, finalRotation)
			// Clear awareness and temp state
			if (prezillo.awareness) {
				clearEditingState(prezillo.awareness)
			}
			setTempObjectState(null)
			interactionStartRef.current = null
			justFinishedInteractionRef.current = true
		}
	})

	// Pivot drag hook - provides pivot positioning with snap to 9 points
	const {
		pivotState,
		handlePivotDragStart: hookPivotDragStart,
		getPositionCompensation
	} = usePivotDrag({
		bounds: storedSelection?.bounds ?? { x: 0, y: 0, width: 0, height: 0 },
		rotation: storedSelection?.rotation ?? 0,
		pivotX: storedSelection?.pivotX ?? 0.5,
		pivotY: storedSelection?.pivotY ?? 0.5,
		translateTo: translateToRef,
		snapPoints: snapSettings.settings.snapToObjects ? DEFAULT_PIVOT_SNAP_POINTS : [],
		snapThreshold: DEFAULT_PIVOT_SNAP_THRESHOLD,
		disabled: isReadOnly || !storedSelection,
		onPointerDown: () => {
			// Set flag immediately on pointer down to prevent canvas click from clearing selection
			// This is needed even if the user doesn't actually drag (just clicks)
			justFinishedInteractionRef.current = true
		},
		onDragStart: (pivot) => {
			// Use ref to get latest storedSelection (react-yjs keeps it updated)
			const current = storedSelectionRef.current
			if (!current) return
			interactionStartRef.current = current
			setTempObjectState({
				objectId: current.id,
				x: current.bounds.x,
				y: current.bounds.y,
				width: current.bounds.width,
				height: current.bounds.height,
				pivotX: pivot.x,
				pivotY: pivot.y
			})
		},
		onDrag: (pivot, snappedPoint, compensation) => {
			// Use captured initial state to prevent stale closure issues
			const initial = interactionStartRef.current
			if (!initial) return
			// The hook already calculates compensation for position relative to initial state
			const compensatedX = initial.bounds.x + compensation.x
			const compensatedY = initial.bounds.y + compensation.y
			setTempObjectState({
				objectId: initial.id,
				x: compensatedX,
				y: compensatedY,
				width: initial.bounds.width,
				height: initial.bounds.height,
				pivotX: pivot.x,
				pivotY: pivot.y
			})
		},
		onDragEnd: (pivot, compensation) => {
			// Use captured initial state to prevent stale closure issues
			const initial = interactionStartRef.current
			if (!initial) return
			// Commit to CRDT - updateObjectPivot handles position compensation internally
			updateObjectPivot(prezillo.yDoc, prezillo.doc, initial.id, pivot.x, pivot.y)
			setTempObjectState(null)
			interactionStartRef.current = null
			justFinishedInteractionRef.current = true
		}
	})

	return {
		storedSelection,
		interactionStartRef,
		isResizing,
		activeHandle,
		handleResizeStart,
		rotationState,
		hookRotateStart,
		pivotState,
		hookPivotDragStart
	}
}

// vim: ts=4

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

import * as React from 'react'
import {
	SvgCanvas,
	useSvgCanvas,
	ToolEvent,
	SelectionBox,
	type ResizeHandle,
	useSnapping,
	SnapGuides,
	computeGrabPoint,
	type SnapSpatialObject,
	type SnapGuidesProps,
	type SvgCanvasContext,
	type SvgCanvasHandle
} from 'react-svg-canvas'

/**
 * Wrapper component for SnapGuides that uses the fixed layer transform
 */
function FixedSnapGuides(props: Omit<SnapGuidesProps, 'transformPoint'>) {
	const { translateFrom } = useSvgCanvas()
	return <SnapGuides {...props} transformPoint={translateFrom} />
}

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import './style.css'

import { usePrelloDocument, useSnappingConfig, useGetParent, useSnapSettings } from './hooks'
import { useViewObjects } from './hooks/useViewObjects'
import { useViews } from './hooks/useViews'
import { setEditingState, clearEditingState } from './awareness'
import { RotationHandle, SNAP_ZONE_RATIO } from './components/RotationHandle'
import { PivotHandle, PIVOT_SNAP_POINTS, PIVOT_SNAP_THRESHOLD } from './components/PivotHandle'
import { Toolbar } from './components/Toolbar'
import { ViewPicker } from './components/ViewPicker'
import { ViewFrame } from './components/ViewFrame'
import { TextEditOverlay } from './components/TextEditOverlay'
import { ObjectShape } from './components/ObjectShape'
import { PresentationMode } from './components/PresentationMode'

import type {
	ObjectId,
	ViewId,
	PrelloObject,
	ViewNode,
	Bounds,
	YPrelloDocument
} from './crdt'
import {
	createObject,
	updateObject,
	updateObjectBounds,
	updateObjectPosition,
	updateObjectRotation,
	updateObjectPivot,
	updateObjectTextStyle,
	deleteObject,
	createView,
	getView,
	getAbsoluteBounds,
	resolveShapeStyle,
	resolveTextStyle,
	getNextView,
	getPreviousView,
	bringToFront,
	bringForward,
	sendBackward,
	sendToBack
} from './crdt'

//////////////
// Main App //
//////////////
export function PrelloApp() {
	const prello = usePrelloDocument()
	const views = useViews(prello.doc)
	const viewObjects = useViewObjects(prello.doc, prello.activeViewId)

	// Snapping configuration and hook
	const snapConfig = useSnappingConfig(prello.doc)
	const getParent = useGetParent(prello.doc)
	const snapSettings = useSnapSettings(prello.doc)

	const [toolEvent, setToolEvent] = React.useState<ToolEvent | undefined>()
	const [dragState, setDragState] = React.useState<{
		objectId: ObjectId
		startX: number
		startY: number
		objectStartX: number
		objectStartY: number
	} | null>(null)
	const [resizeState, setResizeState] = React.useState<{
		objectId: ObjectId
		handle: ResizeHandle
		startX: number
		startY: number
		objectStartX: number
		objectStartY: number
		objectStartWidth: number
		objectStartHeight: number
		rotation: number
		cos: number
		sin: number
		pivotX: number
		pivotY: number
		anchorNormX: number
		anchorNormY: number
		anchorScreenX: number
		anchorScreenY: number
	} | null>(null)

	// Presentation mode state
	const [isPresentationMode, setIsPresentationMode] = React.useState(false)

	// Text editing state - which object is being text-edited
	const [editingTextId, setEditingTextId] = React.useState<ObjectId | null>(null)

	// Hover state - which object is being hovered (only active when nothing selected)
	const [hoveredObjectId, setHoveredObjectId] = React.useState<ObjectId | null>(null)

	// Temporary object state during drag/resize/rotate (local visual only, not persisted)
	const [tempObjectState, setTempObjectState] = React.useState<{
		objectId: ObjectId
		x: number
		y: number
		width: number
		height: number
		rotation?: number
		pivotX?: number
		pivotY?: number
	} | null>(null)

	// Rotation state for snap feature
	const [rotationState, setRotationState] = React.useState<{
		isRotating: boolean
		isSnapActive: boolean
	}>({ isRotating: false, isSnapActive: false })

	// Pivot drag state for snap feature
	const [pivotDragState, setPivotDragState] = React.useState<{
		isDragging: boolean
		snappedPoint: { x: number; y: number } | null
		originalBounds: Bounds | null  // Original bounds before position compensation
		initialPivot: { x: number; y: number } | null  // Initial pivot for rotation transform
	}>({ isDragging: false, snappedPoint: null, originalBounds: null, initialPivot: null })

	// Track grab point for snap weighting
	const grabPointRef = React.useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 })

	// Store SvgCanvas context for coordinate transformations (zoom-aware)
	const canvasContextRef = React.useRef<SvgCanvasContext | null>(null)
	const canvasRef = React.useRef<SvgCanvasHandle | null>(null)

	// Track if we just finished an interaction (resize/rotate/pivot) to prevent canvas click from clearing selection
	const justFinishedInteractionRef = React.useRef(false)

	const handleCanvasContextReady = React.useCallback((ctx: SvgCanvasContext) => {
		canvasContextRef.current = ctx
	}, [])

	// Get active view
	const activeView = prello.activeViewId
		? getView(prello.doc, prello.activeViewId)
		: null

	// Center on active view when it changes
	React.useEffect(() => {
		if (activeView && canvasRef.current) {
			canvasRef.current.centerOnRect(activeView.x, activeView.y, activeView.width, activeView.height)
		}
	}, [prello.activeViewId])

	// Create spatial objects for snapping
	const snapObjects = React.useMemo<SnapSpatialObject[]>(() => {
		return viewObjects.map(obj => ({
			id: obj.id,
			bounds: {
				x: obj.x,
				y: obj.y,
				width: obj.width,
				height: obj.height
			},
			rotation: obj.rotation,
			pivotX: obj.pivotX,
			pivotY: obj.pivotY,
			parentId: obj.parentId
		}))
	}, [viewObjects])

	// View bounds for snapping
	const viewBounds = React.useMemo(() => {
		if (!activeView) {
			return { x: 0, y: 0, width: 1920, height: 1080 }
		}
		return {
			x: activeView.x,
			y: activeView.y,
			width: activeView.width,
			height: activeView.height
		}
	}, [activeView])

	// Initialize snapping hook
	const { snapDrag, snapResize, activeSnaps, allCandidates, clearSnaps } = useSnapping({
		objects: snapObjects,
		config: snapConfig,
		viewBounds,
		getParent
	})

	// Use refs to always get latest snap functions (avoids stale closure in drag/resize handlers)
	const snapDragRef = React.useRef(snapDrag)
	snapDragRef.current = snapDrag
	const snapResizeRef = React.useRef(snapResize)
	snapResizeRef.current = snapResize

	// Handle object click
	function handleObjectClick(e: React.MouseEvent, objectId: ObjectId) {
		e.stopPropagation()
		const addToSelection = e.shiftKey || e.ctrlKey || e.metaKey
		prello.selectObject(objectId, addToSelection)
		prello.setActiveTool(null)
	}

	// Handle object double-click (edit text)
	function handleObjectDoubleClick(e: React.MouseEvent, objectId: ObjectId) {
		e.stopPropagation()
		const obj = prello.doc.o.get(objectId)
		if (!obj) return

		// Only text objects are editable
		if (obj.t === 'T') {
			setEditingTextId(objectId)
		}
	}

	// Handle text edit save
	function handleTextEditSave(text: string) {
		if (!editingTextId) return

		updateObject(prello.yDoc, prello.doc, editingTextId, { text } as any)
		setEditingTextId(null)
	}

	// Handle text edit cancel
	function handleTextEditCancel() {
		setEditingTextId(null)
	}

	// Handle object mouse down (start drag)
	function handleObjectMouseDown(e: React.MouseEvent, objectId: ObjectId) {
		// Only handle left button
		if (e.button !== 0) return

		// Don't start drag if using a tool
		if (prello.activeTool) return

		e.stopPropagation()
		e.preventDefault()

		const obj = prello.doc.o.get(objectId)
		if (!obj) return

		// Get SVG element and canvas context for zoom-aware coordinate transformation
		const svgElement = (e.target as SVGElement).ownerSVGElement
		if (!svgElement) return

		const canvasCtx = canvasContextRef.current
		if (!canvasCtx?.translateTo) return

		// Get SVG-relative client coordinates, then transform through canvas zoom
		const rect = svgElement.getBoundingClientRect()
		const [svgX, svgY] = canvasCtx.translateTo(e.clientX - rect.left, e.clientY - rect.top)
		const svgPoint = { x: svgX, y: svgY }

		// Select the object if not already selected
		if (!prello.selectedIds.has(objectId)) {
			const addToSelection = e.shiftKey || e.ctrlKey || e.metaKey
			prello.selectObject(objectId, addToSelection)
		}

		const initialDragState = {
			objectId,
			startX: svgPoint.x,
			startY: svgPoint.y,
			objectStartX: obj.xy[0],
			objectStartY: obj.xy[1],
			objectWidth: obj.wh[0],
			objectHeight: obj.wh[1]
		}

		// Calculate grab point for snap weighting (normalized 0-1)
		grabPointRef.current = computeGrabPoint(
			{ x: svgPoint.x, y: svgPoint.y },
			{
				x: obj.xy[0],
				y: obj.xy[1],
				width: obj.wh[0],
				height: obj.wh[1],
				rotation: obj.r || 0
			}
		)

		// Track current position for final commit (mutable to avoid stale closure)
		let currentX = obj.xy[0]
		let currentY = obj.xy[1]

		setDragState(initialDragState)

		// Initialize temp state
		setTempObjectState({
			objectId,
			x: obj.xy[0],
			y: obj.xy[1],
			width: obj.wh[0],
			height: obj.wh[1]
		})

		// Handle drag with window events for smooth dragging
		const handleMouseMove = (moveEvent: MouseEvent) => {
			const ctx = canvasContextRef.current
			if (!ctx?.translateTo) return

			// Transform screen coords to canvas coords (zoom-aware)
			const rect = svgElement.getBoundingClientRect()
			const [moveX, moveY] = ctx.translateTo(moveEvent.clientX - rect.left, moveEvent.clientY - rect.top)

			const dx = moveX - initialDragState.startX
			const dy = moveY - initialDragState.startY

			// Calculate proposed position before snapping
			const proposedX = initialDragState.objectStartX + dx
			const proposedY = initialDragState.objectStartY + dy

			// Apply snapping (use ref to get latest config)
			const snapResult = snapDragRef.current({
				bounds: {
					x: proposedX,
					y: proposedY,
					width: initialDragState.objectWidth,
					height: initialDragState.objectHeight,
					rotation: obj.r || 0,
					pivotX: obj.pv?.[0] ?? 0.5,
					pivotY: obj.pv?.[1] ?? 0.5
				},
				objectId: initialDragState.objectId,
				delta: { x: dx, y: dy },
				grabPoint: grabPointRef.current,
				excludeIds: new Set([initialDragState.objectId])
			})

			currentX = snapResult.position.x
			currentY = snapResult.position.y

			// Update local temp state (visual only)
			setTempObjectState({
				objectId: initialDragState.objectId,
				x: currentX,
				y: currentY,
				width: initialDragState.objectWidth,
				height: initialDragState.objectHeight
			})

			// Broadcast to other clients via awareness
			if (prello.awareness) {
				setEditingState(
					prello.awareness,
					initialDragState.objectId,
					'drag',
					currentX,
					currentY,
					initialDragState.objectWidth,
					initialDragState.objectHeight
				)
			}
		}

		const handleMouseUp = () => {
			// Commit final position to CRDT (only now!)
			updateObjectPosition(
				prello.yDoc,
				prello.doc,
				initialDragState.objectId,
				currentX,
				currentY
			)

			// Clear awareness
			if (prello.awareness) {
				clearEditingState(prello.awareness)
			}

			// Clear snapping state
			clearSnaps()

			// Clear local state
			setDragState(null)
			setTempObjectState(null)
			window.removeEventListener('mousemove', handleMouseMove)
			window.removeEventListener('mouseup', handleMouseUp)
		}

		window.addEventListener('mousemove', handleMouseMove)
		window.addEventListener('mouseup', handleMouseUp)
	}

	// Handle canvas click (deselect)
	function handleCanvasClick() {
		// Skip if we just finished a resize/rotate/pivot interaction
		if (justFinishedInteractionRef.current) {
			justFinishedInteractionRef.current = false
			return
		}
		if (!prello.activeTool) {
			prello.clearSelection()
		}
		// Cancel text editing if clicking outside
		setEditingTextId(null)
	}

	// Handle delete
	function handleDelete() {
		prello.selectedIds.forEach(id => {
			deleteObject(prello.yDoc, prello.doc, id)
		})
		prello.clearSelection()
	}

	// Refs to store state for use in event handlers (avoids stale closure)
	const resizeStateRef = React.useRef<typeof resizeState>(null)
	const prelloRef = React.useRef(prello)
	React.useEffect(() => {
		// Only update prelloRef, not resizeStateRef (which is managed manually during resize)
		prelloRef.current = prello
	}, [prello])

	// Handle resize start (from selection box handles)
	function handleResizeStart(handle: ResizeHandle, e: React.MouseEvent) {
		e.preventDefault()
		e.stopPropagation()

		if (prello.selectedIds.size !== 1) return

		const objectId = Array.from(prello.selectedIds)[0]
		const obj = prello.doc.o.get(objectId)
		if (!obj) return

		// Get the SVG element and canvas context for zoom-aware coordinate transformation
		const svgElement = (e.target as SVGElement).ownerSVGElement
		if (!svgElement) return

		const canvasCtx = canvasContextRef.current
		if (!canvasCtx?.translateTo) return

		// Get SVG-relative client coordinates, then transform through canvas zoom
		const rect = svgElement.getBoundingClientRect()
		const [svgX, svgY] = canvasCtx.translateTo(e.clientX - rect.left, e.clientY - rect.top)
		const svgPoint = { x: svgX, y: svgY }

		// Get rotation and pivot for coordinate transformation
		const rotation = obj.r ?? 0
		const radians = rotation * (Math.PI / 180)
		const cos = Math.cos(radians)
		const sin = Math.sin(radians)
		const pivotX = obj.pv?.[0] ?? 0.5
		const pivotY = obj.pv?.[1] ?? 0.5

		// Determine anchor point (opposite corner/edge) - in normalized coords (0 or 1)
		let anchorNormX = 0.5, anchorNormY = 0.5
		switch (handle) {
			case 'nw': anchorNormX = 1; anchorNormY = 1; break  // anchor SE
			case 'n':  anchorNormX = 0.5; anchorNormY = 1; break // anchor S center
			case 'ne': anchorNormX = 0; anchorNormY = 1; break  // anchor SW
			case 'e':  anchorNormX = 0; anchorNormY = 0.5; break // anchor W center
			case 'se': anchorNormX = 0; anchorNormY = 0; break  // anchor NW
			case 's':  anchorNormX = 0.5; anchorNormY = 0; break // anchor N center
			case 'sw': anchorNormX = 1; anchorNormY = 0; break  // anchor NE
			case 'w':  anchorNormX = 1; anchorNormY = 0.5; break // anchor E center
		}

		// Calculate initial anchor screen position
		const x = obj.xy[0], y = obj.xy[1], w = obj.wh[0], h = obj.wh[1]
		const anchorLocalX = x + w * anchorNormX
		const anchorLocalY = y + h * anchorNormY
		const pivotAbsX = x + w * pivotX
		const pivotAbsY = y + h * pivotY
		// Rotate anchor around pivot
		const anchorScreenX = pivotAbsX + (anchorLocalX - pivotAbsX) * cos - (anchorLocalY - pivotAbsY) * sin
		const anchorScreenY = pivotAbsY + (anchorLocalX - pivotAbsX) * sin + (anchorLocalY - pivotAbsY) * cos

		const initialState = {
			objectId,
			handle,
			startX: svgPoint.x,
			startY: svgPoint.y,
			objectStartX: obj.xy[0],
			objectStartY: obj.xy[1],
			objectStartWidth: obj.wh[0],
			objectStartHeight: obj.wh[1],
			rotation,
			cos,
			sin,
			pivotX,
			pivotY,
			anchorNormX,
			anchorNormY,
			anchorScreenX,
			anchorScreenY
		}

		// Track current bounds for final commit (mutable to avoid stale closure)
		let currentX = obj.xy[0]
		let currentY = obj.xy[1]
		let currentWidth = obj.wh[0]
		let currentHeight = obj.wh[1]

		// Set both ref (for event handlers) and state (for UI updates)
		resizeStateRef.current = initialState
		setResizeState(initialState)

		// Initialize temp state for visual feedback
		setTempObjectState({
			objectId,
			x: obj.xy[0],
			y: obj.xy[1],
			width: obj.wh[0],
			height: obj.wh[1]
		})

		// Add window event listeners for mouse move and up
		const handleMouseMove = (moveEvent: MouseEvent) => {
			const state = resizeStateRef.current
			if (!state) return

			const ctx = canvasContextRef.current
			if (!ctx?.translateTo) return

			// Transform screen coords to canvas coords (zoom-aware)
			const rect = svgElement.getBoundingClientRect()
			const [moveX, moveY] = ctx.translateTo(moveEvent.clientX - rect.left, moveEvent.clientY - rect.top)

			const screenDx = moveX - state.startX
			const screenDy = moveY - state.startY

			// Un-rotate mouse delta to get movement in object-local space
			const dx = screenDx * state.cos + screenDy * state.sin
			const dy = -screenDx * state.sin + screenDy * state.cos

			let newWidth = state.objectStartWidth
			let newHeight = state.objectStartHeight

			// Calculate new size based on handle (in local/object space)
			switch (state.handle) {
				case 'nw':
					newWidth = state.objectStartWidth - dx
					newHeight = state.objectStartHeight - dy
					break
				case 'n':
					newHeight = state.objectStartHeight - dy
					break
				case 'ne':
					newWidth = state.objectStartWidth + dx
					newHeight = state.objectStartHeight - dy
					break
				case 'e':
					newWidth = state.objectStartWidth + dx
					break
				case 'se':
					newWidth = state.objectStartWidth + dx
					newHeight = state.objectStartHeight + dy
					break
				case 's':
					newHeight = state.objectStartHeight + dy
					break
				case 'sw':
					newWidth = state.objectStartWidth - dx
					newHeight = state.objectStartHeight + dy
					break
				case 'w':
					newWidth = state.objectStartWidth - dx
					break
			}

			// Ensure minimum size
			const minSize = 10
			if (newWidth < minSize) newWidth = minSize
			if (newHeight < minSize) newHeight = minSize

			// Now calculate position to keep anchor point fixed on screen
			// The anchor offset from pivot (in local coords) after resize:
			const newAnchorOffsetX = newWidth * (state.anchorNormX - state.pivotX)
			const newAnchorOffsetY = newHeight * (state.anchorNormY - state.pivotY)

			// Rotate this offset to get screen-space offset from pivot to anchor
			const rotatedOffsetX = newAnchorOffsetX * state.cos - newAnchorOffsetY * state.sin
			const rotatedOffsetY = newAnchorOffsetX * state.sin + newAnchorOffsetY * state.cos

			// The pivot screen position should be such that pivot + rotatedOffset = anchorScreen
			const newPivotScreenX = state.anchorScreenX - rotatedOffsetX
			const newPivotScreenY = state.anchorScreenY - rotatedOffsetY

			// Now pivot = (newX + newWidth * pivotX, newY + newHeight * pivotY)
			// So newX = pivotScreenX - newWidth * pivotX, etc.
			let newX = newPivotScreenX - newWidth * state.pivotX
			let newY = newPivotScreenY - newHeight * state.pivotY

			// Apply snapping (use ref to get latest config)
			const snapResult = snapResizeRef.current({
				originalBounds: {
					x: state.objectStartX,
					y: state.objectStartY,
					width: state.objectStartWidth,
					height: state.objectStartHeight,
					rotation: obj.r || 0
				},
				currentBounds: {
					x: newX,
					y: newY,
					width: newWidth,
					height: newHeight,
					rotation: obj.r || 0
				},
				objectId: state.objectId,
				handle: state.handle,
				delta: { x: dx, y: dy },
				excludeIds: new Set([state.objectId])
			})

			// Use snapped bounds
			newX = snapResult.bounds.x
			newY = snapResult.bounds.y
			newWidth = snapResult.bounds.width
			newHeight = snapResult.bounds.height

			// Update tracking variables
			currentX = newX
			currentY = newY
			currentWidth = newWidth
			currentHeight = newHeight

			// Update local temp state (visual only)
			setTempObjectState({
				objectId: state.objectId,
				x: newX,
				y: newY,
				width: newWidth,
				height: newHeight
			})

			// Broadcast to other clients via awareness
			const currentPrello = prelloRef.current
			if (currentPrello.awareness) {
				setEditingState(
					currentPrello.awareness,
					state.objectId,
					'resize',
					newX,
					newY,
					newWidth,
					newHeight
				)
			}
		}

		const handleMouseUp = () => {
			// Commit final bounds to CRDT (only now!)
			const currentPrello = prelloRef.current
			updateObjectBounds(
				currentPrello.yDoc,
				currentPrello.doc,
				objectId,
				currentX,
				currentY,
				currentWidth,
				currentHeight
			)

			// Clear awareness
			if (currentPrello.awareness) {
				clearEditingState(currentPrello.awareness)
			}

			// Clear snapping state
			clearSnaps()

			// Clear local state
			resizeStateRef.current = null
			setResizeState(null)
			setTempObjectState(null)

			// Prevent canvas click from clearing selection
			justFinishedInteractionRef.current = true

			window.removeEventListener('mousemove', handleMouseMove)
			window.removeEventListener('mouseup', handleMouseUp)
		}

		window.addEventListener('mousemove', handleMouseMove)
		window.addEventListener('mouseup', handleMouseUp)
	}

	// Handle rotation start (from rotation handle)
	function handleRotateStart(e: React.MouseEvent) {
		e.preventDefault()
		e.stopPropagation()

		if (prello.selectedIds.size !== 1) return

		const objectId = Array.from(prello.selectedIds)[0]
		const obj = prello.doc.o.get(objectId)
		if (!obj) return

		// Get the SVG element and canvas context
		const svgElement = (e.target as SVGElement).ownerSVGElement
		if (!svgElement) return

		const canvasCtx = canvasContextRef.current
		if (!canvasCtx?.translateTo) return

		// Get SVG-relative coordinates
		const rect = svgElement.getBoundingClientRect()
		const [svgX, svgY] = canvasCtx.translateTo(e.clientX - rect.left, e.clientY - rect.top)

		// Calculate pivot point in absolute coordinates
		const pivotX = obj.pv?.[0] ?? 0.5
		const pivotY = obj.pv?.[1] ?? 0.5
		const cx = obj.xy[0] + obj.wh[0] * pivotX
		const cy = obj.xy[1] + obj.wh[1] * pivotY

		// Calculate arc radius (same as RotationHandle)
		const halfW = obj.wh[0] / 2
		const halfH = obj.wh[1] / 2
		const maxDist = Math.sqrt(halfW * halfW + halfH * halfH)
		const arcRadius = maxDist + 25  // Add padding for the arc
		const snapZoneRadius = arcRadius * SNAP_ZONE_RATIO

		// Calculate initial angle from pivot to mouse
		const initialAngle = Math.atan2(svgY - cy, svgX - cx) * (180 / Math.PI)
		const initialRotation = obj.r || 0

		// Track current rotation for final commit
		let currentRotation = initialRotation

		// Initialize temp state and rotation state
		setTempObjectState({
			objectId,
			x: obj.xy[0],
			y: obj.xy[1],
			width: obj.wh[0],
			height: obj.wh[1],
			rotation: initialRotation
		})
		setRotationState({ isRotating: true, isSnapActive: false })

		const handleMouseMove = (moveEvent: MouseEvent) => {
			const ctx = canvasContextRef.current
			if (!ctx?.translateTo) return

			const rect = svgElement.getBoundingClientRect()
			const [moveX, moveY] = ctx.translateTo(moveEvent.clientX - rect.left, moveEvent.clientY - rect.top)

			// Calculate distance from mouse to pivot
			const distanceFromPivot = Math.sqrt(
				Math.pow(moveX - cx, 2) + Math.pow(moveY - cy, 2)
			)

			// Determine if snap mode is active (mouse inside inner zone)
			const isSnapActive = distanceFromPivot <= snapZoneRadius

			// Calculate current angle from pivot to mouse
			const currentAngle = Math.atan2(moveY - cy, moveX - cx) * (180 / Math.PI)
			const deltaAngle = currentAngle - initialAngle
			let newRotation = initialRotation + deltaAngle

			// Normalize to 0-360
			newRotation = ((newRotation % 360) + 360) % 360

			// Apply snapping if in snap zone
			if (isSnapActive) {
				// Snap to nearest 15 degrees
				newRotation = Math.round(newRotation / 15) * 15
				// Normalize again in case we hit 360
				newRotation = newRotation % 360
			}

			currentRotation = newRotation

			// Update rotation state
			setRotationState({ isRotating: true, isSnapActive })

			// Update temp state for visual feedback
			setTempObjectState({
				objectId,
				x: obj.xy[0],
				y: obj.xy[1],
				width: obj.wh[0],
				height: obj.wh[1],
				rotation: newRotation
			})

			// Broadcast to other clients
			const currentPrello = prelloRef.current
			if (currentPrello.awareness) {
				setEditingState(
					currentPrello.awareness,
					objectId,
					'rotate',
					obj.xy[0],
					obj.xy[1],
					obj.wh[0],
					obj.wh[1],
					newRotation
				)
			}
		}

		const handleMouseUp = () => {
			// Commit final rotation to CRDT
			const currentPrello = prelloRef.current
			updateObjectRotation(
				currentPrello.yDoc,
				currentPrello.doc,
				objectId,
				currentRotation
			)

			// Clear awareness
			if (currentPrello.awareness) {
				clearEditingState(currentPrello.awareness)
			}

			// Clear local state
			setTempObjectState(null)
			setRotationState({ isRotating: false, isSnapActive: false })

			// Prevent canvas click from clearing selection
			justFinishedInteractionRef.current = true

			window.removeEventListener('mousemove', handleMouseMove)
			window.removeEventListener('mouseup', handleMouseUp)
		}

		window.addEventListener('mousemove', handleMouseMove)
		window.addEventListener('mouseup', handleMouseUp)
	}

	// Handle pivot drag start
	function handlePivotDragStart(e: React.MouseEvent) {
		e.preventDefault()
		e.stopPropagation()

		if (prello.selectedIds.size !== 1) return

		const objectId = Array.from(prello.selectedIds)[0]
		const initialObj = prello.doc.o.get(objectId)
		if (!initialObj) return

		// Get the SVG element and canvas context
		const svgElement = (e.target as SVGElement).ownerSVGElement
		if (!svgElement) return

		const canvasCtx = canvasContextRef.current
		if (!canvasCtx?.translateTo) return

		// Capture initial state (these don't change during drag)
		const initialX = initialObj.xy[0]
		const initialY = initialObj.xy[1]
		const objW = initialObj.wh[0]
		const objH = initialObj.wh[1]
		const initialPivotX = initialObj.pv?.[0] ?? 0.5
		const initialPivotY = initialObj.pv?.[1] ?? 0.5
		const rotation = initialObj.r ?? 0

		// Pre-calculate rotation values for position compensation
		const radians = rotation * (Math.PI / 180)
		const cos = Math.cos(radians)
		const sin = Math.sin(radians)

		// Get initial mouse position
		const rect = svgElement.getBoundingClientRect()
		const [startX, startY] = canvasCtx.translateTo(e.clientX - rect.left, e.clientY - rect.top)

		// Track current values for final commit
		let currentPivotX = initialPivotX
		let currentPivotY = initialPivotY

		// Store original bounds and initial pivot for snap point visualization
		const originalBounds: Bounds = {
			x: initialX,
			y: initialY,
			width: objW,
			height: objH
		}
		const initialPivot = { x: initialPivotX, y: initialPivotY }

		// Initialize temp state and pivot drag state
		setTempObjectState({
			objectId,
			x: initialX,
			y: initialY,
			width: objW,
			height: objH,
			pivotX: initialPivotX,
			pivotY: initialPivotY
		})
		setPivotDragState({ isDragging: true, snappedPoint: null, originalBounds, initialPivot })

		const handleMouseMove = (moveEvent: MouseEvent) => {
			const ctx = canvasContextRef.current
			if (!ctx?.translateTo) return

			const rect = svgElement.getBoundingClientRect()
			const [moveX, moveY] = ctx.translateTo(moveEvent.clientX - rect.left, moveEvent.clientY - rect.top)

			// Calculate mouse delta from start position (in canvas/screen space)
			const dx = moveX - startX
			const dy = moveY - startY

			// Un-rotate mouse delta to get movement in object-local space
			// (pivot coordinates are in unrotated object space)
			const localDx = dx * cos + dy * sin
			const localDy = -dx * sin + dy * cos

			// Convert to pivot delta
			const deltaPivotX = localDx / objW
			const deltaPivotY = localDy / objH

			// Calculate new pivot position (raw, before snapping)
			let newPivotX = Math.max(0, Math.min(1, initialPivotX + deltaPivotX))
			let newPivotY = Math.max(0, Math.min(1, initialPivotY + deltaPivotY))

			// Check if snap to objects is enabled and apply snapping
			let snappedPoint: { x: number; y: number } | null = null
			if (snapSettings.settings.snapToObjects) {
				// Find the nearest snap point
				let nearestDist = Infinity
				for (const point of PIVOT_SNAP_POINTS) {
					const dist = Math.sqrt(
						Math.pow(newPivotX - point.x, 2) + Math.pow(newPivotY - point.y, 2)
					)
					if (dist < nearestDist && dist <= PIVOT_SNAP_THRESHOLD) {
						nearestDist = dist
						snappedPoint = { x: point.x, y: point.y }
					}
				}

				// Apply snap if within threshold
				if (snappedPoint) {
					newPivotX = snappedPoint.x
					newPivotY = snappedPoint.y
				}
			}

			// Update pivot drag state with snapped point info (preserve originalBounds and initialPivot)
			setPivotDragState({ isDragging: true, snappedPoint, originalBounds, initialPivot })

			// Calculate position compensation to keep object visually in place
			// Same formula as updateObjectPivot in object-ops.ts
			const dpx = initialPivotX - newPivotX
			const dpy = initialPivotY - newPivotY
			const compensatedX = initialX + objW * dpx * (1 - cos) + objH * dpy * sin
			const compensatedY = initialY + objH * dpy * (1 - cos) - objW * dpx * sin

			currentPivotX = newPivotX
			currentPivotY = newPivotY

			setTempObjectState({
				objectId,
				x: compensatedX,
				y: compensatedY,
				width: objW,
				height: objH,
				pivotX: newPivotX,
				pivotY: newPivotY
			})
		}

		const handleMouseUp = () => {
			window.removeEventListener('mousemove', handleMouseMove)
			window.removeEventListener('mouseup', handleMouseUp)

			// Commit final pivot to CRDT (only once!)
			const currentPrello = prelloRef.current
			updateObjectPivot(
				currentPrello.yDoc,
				currentPrello.doc,
				objectId,
				currentPivotX,
				currentPivotY
			)

			// Clear temp state and pivot drag state
			setTempObjectState(null)
			setPivotDragState({ isDragging: false, snappedPoint: null, originalBounds: null, initialPivot: null })

			// Prevent canvas click from clearing selection
			justFinishedInteractionRef.current = true
		}

		window.addEventListener('mousemove', handleMouseMove)
		window.addEventListener('mouseup', handleMouseUp)
	}

	// Handle tool start
	function handleToolStart(evt: ToolEvent) {
		if (resizeState) return // Don't start drag while resizing

		if (prello.activeTool) {
			// Start drawing a new shape
			setToolEvent(evt)
		}
		// Note: Dragging selected objects is now handled by ObjectShape's onMouseDown
		// via handleObjectDragStart, not here
	}

	// Handle tool move
	function handleToolMove(evt: ToolEvent) {
		if (resizeState) return // Resize is handled by window events
		if (dragState) return // Drag is handled by window events

		if (prello.activeTool) {
			setToolEvent(evt)
		}
	}

	// Handle tool end
	function handleToolEnd() {
		if (resizeState) return // Resize is handled by window events

		if (dragState) {
			setDragState(null)
			return
		}

		if (!toolEvent || !prello.activeTool) return

		const x = Math.min(toolEvent.startX, toolEvent.x)
		const y = Math.min(toolEvent.startY, toolEvent.y)
		const width = Math.abs(toolEvent.x - toolEvent.startX)
		const height = Math.abs(toolEvent.y - toolEvent.startY)

		if (width < 5 || height < 5) {
			// Too small, ignore
			setToolEvent(undefined)
			return
		}

		// Get first layer as parent
		const layers = prello.doc.r.toArray().filter(ref => ref[0] === 1)
		const layerId = layers.length > 0 ? layers[0][1] : undefined

		// Create object based on tool
		const objectId = createObject(
			prello.yDoc,
			prello.doc,
			prello.activeTool as any,
			x,
			y,
			width,
			height,
			layerId as any
		)

		prello.setActiveTool(null)
		setToolEvent(undefined)
		prello.selectObject(objectId)
	}

	// Handle keyboard
	function handleKeyDown(evt: React.KeyboardEvent) {
		if (evt.target !== evt.currentTarget) return

		if (!evt.altKey && !evt.shiftKey && !evt.ctrlKey && !evt.metaKey) {
			switch (evt.key) {
				case 'Delete':
				case 'Backspace':
					if (prello.selectedIds.size > 0) {
						handleDelete()
					}
					break
				case 'Escape':
					prello.clearSelection()
					prello.setActiveTool(null)
					setEditingTextId(null)
					break
			}
		} else if (!evt.altKey && !evt.shiftKey && (evt.ctrlKey || evt.metaKey)) {
			switch (evt.key) {
				case 'z':
					prello.undo()
					evt.preventDefault()
					break
				case 'y':
					prello.redo()
					evt.preventDefault()
					break
				case 'a':
					// Select all in view
					if (prello.activeViewId) {
						const ids = viewObjects.map(o => o.id)
						prello.selectObjects(ids)
					}
					evt.preventDefault()
					break
			}
		}
	}

	// View navigation
	function handlePrevView() {
		if (prello.activeViewId) {
			const prev = getPreviousView(prello.doc, prello.activeViewId)
			if (prev) prello.setActiveViewId(prev)
		}
	}

	function handleNextView() {
		if (prello.activeViewId) {
			const next = getNextView(prello.doc, prello.activeViewId)
			if (next) prello.setActiveViewId(next)
		}
	}

	function handleAddView() {
		const viewId = createView(prello.yDoc, prello.doc, {
			copyFromViewId: prello.activeViewId || undefined
		})
		prello.setActiveViewId(viewId)
	}

	// Get selection bounds (use tempObjectState for immediate visual feedback during drag/resize)
	const selectionBounds = React.useMemo(() => {
		if (prello.selectedIds.size === 0) return null

		let minX = Infinity, minY = Infinity
		let maxX = -Infinity, maxY = -Infinity

		prello.selectedIds.forEach(id => {
			// Use temp state if available for this object
			if (tempObjectState && tempObjectState.objectId === id) {
				minX = Math.min(minX, tempObjectState.x)
				minY = Math.min(minY, tempObjectState.y)
				maxX = Math.max(maxX, tempObjectState.x + tempObjectState.width)
				maxY = Math.max(maxY, tempObjectState.y + tempObjectState.height)
			} else {
				const bounds = getAbsoluteBounds(prello.doc, id)
				if (bounds) {
					minX = Math.min(minX, bounds.x)
					minY = Math.min(minY, bounds.y)
					maxX = Math.max(maxX, bounds.x + bounds.width)
					maxY = Math.max(maxY, bounds.y + bounds.height)
				}
			}
		})

		if (minX === Infinity) return null

		return {
			x: minX,
			y: minY,
			width: maxX - minX,
			height: maxY - minY
		}
	}, [prello.selectedIds, prello.doc.o, viewObjects, tempObjectState])

	// Get selected object rotation and pivot (for single selection only)
	const selectedObjectTransform = React.useMemo(() => {
		if (prello.selectedIds.size !== 1) return null
		const id = Array.from(prello.selectedIds)[0]
		const obj = prello.doc.o.get(id)
		if (!obj) return null
		return {
			id,
			rotation: tempObjectState?.rotation ?? (obj.r || 0),
			pivotX: tempObjectState?.pivotX ?? obj.pv?.[0] ?? 0.5,
			pivotY: tempObjectState?.pivotY ?? obj.pv?.[1] ?? 0.5
		}
	}, [prello.selectedIds, prello.doc.o, tempObjectState])

	// Check if selection is a text object
	// prello.doc.o in deps ensures this recalculates when any object updates
	const selectedTextObject = React.useMemo(() => {
		if (prello.selectedIds.size !== 1) return null
		const id = Array.from(prello.selectedIds)[0]
		const obj = prello.doc.o.get(id)
		if (!obj || (obj.t !== 'T' && obj.t !== 'B')) return null
		return { id, obj }
	}, [prello.selectedIds, prello.doc.o])

	// Get current text style for selected text object
	const selectedTextStyle = React.useMemo(() => {
		if (!selectedTextObject) return null
		// Re-fetch fresh object to get latest style
		const freshObj = prello.doc.o.get(selectedTextObject.id)
		if (!freshObj) return null
		return resolveTextStyle(prello.doc, freshObj)
	}, [selectedTextObject, prello.doc.o, prello.doc])

	// Handle text alignment change
	function handleTextAlignChange(align: 'left' | 'center' | 'right' | 'justify') {
		if (!selectedTextObject) return
		const taMap = { 'left': 'l', 'center': 'c', 'right': 'r', 'justify': 'j' } as const
		updateObjectTextStyle(prello.yDoc, prello.doc, selectedTextObject.id as ObjectId, {
			ta: taMap[align]
		})
	}

	// Handle vertical alignment change
	function handleVerticalAlignChange(align: 'top' | 'middle' | 'bottom') {
		if (!selectedTextObject) return
		const vaMap = { 'top': 't', 'middle': 'm', 'bottom': 'b' } as const
		updateObjectTextStyle(prello.yDoc, prello.doc, selectedTextObject.id as ObjectId, {
			va: vaMap[align]
		})
	}

	// Handle font size change
	function handleFontSizeChange(size: number) {
		if (!selectedTextObject) return
		updateObjectTextStyle(prello.yDoc, prello.doc, selectedTextObject.id as ObjectId, {
			fs: size
		})
	}

	// Handle bold toggle
	function handleBoldToggle() {
		if (!selectedTextObject || !selectedTextStyle) return
		// Toggle bold: if currently bold, remove it (null to reset to default); otherwise set bold
		const newWeight = selectedTextStyle.fontWeight === 'bold' ? null : 'bold'
		updateObjectTextStyle(prello.yDoc, prello.doc, selectedTextObject.id as ObjectId, {
			fw: newWeight
		})
	}

	// Handle italic toggle
	function handleItalicToggle() {
		if (!selectedTextObject || !selectedTextStyle) return
		// Toggle italic: if currently italic, remove it (null); otherwise set true
		const newItalic = selectedTextStyle.fontItalic ? null : true
		updateObjectTextStyle(prello.yDoc, prello.doc, selectedTextObject.id as ObjectId, {
			fi: newItalic
		})
	}

	// Handle underline toggle
	function handleUnderlineToggle() {
		if (!selectedTextObject || !selectedTextStyle) return
		const currentDecoration = selectedTextStyle.textDecoration
		// Toggle underline: if currently underline, remove it (null); otherwise set underline
		const newDecoration = currentDecoration === 'underline' ? null : 'u'
		updateObjectTextStyle(prello.yDoc, prello.doc, selectedTextObject.id as ObjectId, {
			td: newDecoration
		})
	}

	return <>
		<Toolbar
			tool={prello.activeTool}
			setTool={tool => {
				prello.clearSelection()
				prello.setActiveTool(tool)
			}}
			hasSelection={prello.selectedIds.size > 0}
			onDelete={handleDelete}
			canUndo={prello.canUndo}
			canRedo={prello.canRedo}
			onUndo={prello.undo}
			onRedo={prello.redo}
			onBringToFront={() => {
				prello.selectedIds.forEach(id => bringToFront(prello.yDoc, prello.doc, id))
			}}
			onBringForward={() => {
				prello.selectedIds.forEach(id => bringForward(prello.yDoc, prello.doc, id))
			}}
			onSendBackward={() => {
				// Process in reverse to maintain relative order when moving down
				Array.from(prello.selectedIds).reverse().forEach(id => sendBackward(prello.yDoc, prello.doc, id))
			}}
			onSendToBack={() => {
				// Process in reverse to maintain relative order when moving to back
				Array.from(prello.selectedIds).reverse().forEach(id => sendToBack(prello.yDoc, prello.doc, id))
			}}
			snapToGrid={snapSettings.settings.snapToGrid}
			snapToObjects={snapSettings.settings.snapToObjects}
			snapToSizes={snapSettings.settings.snapToSizes}
			snapDebug={snapSettings.settings.snapDebug}
			onToggleSnapToGrid={snapSettings.toggleSnapToGrid}
			onToggleSnapToObjects={snapSettings.toggleSnapToObjects}
			onToggleSnapToSizes={snapSettings.toggleSnapToSizes}
			onToggleSnapDebug={snapSettings.toggleSnapDebug}
			hasTextSelection={!!selectedTextObject}
			selectedTextAlign={selectedTextStyle?.textAlign}
			selectedVerticalAlign={selectedTextStyle?.verticalAlign}
			onTextAlignChange={handleTextAlignChange}
			onVerticalAlignChange={handleVerticalAlignChange}
			selectedFontSize={selectedTextStyle?.fontSize}
			selectedBold={selectedTextStyle?.fontWeight === 'bold'}
			selectedItalic={selectedTextStyle?.fontItalic}
			selectedUnderline={selectedTextStyle?.textDecoration === 'underline'}
			onFontSizeChange={handleFontSizeChange}
			onBoldToggle={handleBoldToggle}
			onItalicToggle={handleItalicToggle}
			onUnderlineToggle={handleUnderlineToggle}
		/>

		<div
			className="c-panel flex-fill"
			tabIndex={0}
			onKeyDown={handleKeyDown}
			onClick={handleCanvasClick}
			style={{ outline: 'none' }}
		>
			<SvgCanvas
				ref={canvasRef}
				className="w-100 h-100"
				onToolStart={handleToolStart}
				onToolMove={handleToolMove}
				onToolEnd={handleToolEnd}
				onContextReady={handleCanvasContextReady}
				fixed={
					<FixedSnapGuides
						activeSnaps={activeSnaps}
						allCandidates={snapConfig.debug.enabled ? allCandidates : undefined}
						config={snapConfig.guides}
						debugConfig={snapConfig.debug}
						viewBounds={viewBounds}
						draggedBounds={tempObjectState ? {
							x: tempObjectState.x,
							y: tempObjectState.y,
							width: tempObjectState.width,
							height: tempObjectState.height,
							rotation: 0
						} : undefined}
					/>
				}
			>
				{/* Render all views as frames */}
				{views.map(view => (
					<ViewFrame
						key={view.id}
						view={view}
						isActive={view.id === prello.activeViewId}
						onClick={() => prello.setActiveViewId(view.id)}
					/>
				))}

				{/* Render objects in active view */}
				{viewObjects.map(object => {
					const storedObj = prello.doc.o.get(object.id)
					const style = storedObj
						? resolveShapeStyle(prello.doc, storedObj)
						: { fill: '#cccccc', stroke: '#999999', strokeWidth: 1, fillOpacity: 1, strokeOpacity: 1, strokeDasharray: '', strokeLinecap: 'butt' as const, strokeLinejoin: 'miter' as const }
					const textStyle = storedObj
						? resolveTextStyle(prello.doc, storedObj)
						: { fontFamily: 'system-ui, sans-serif', fontSize: 16, fontWeight: 'normal' as const, fontItalic: false, textDecoration: 'none' as const, fill: '#333333', textAlign: 'left' as const, verticalAlign: 'top' as const, lineHeight: 1.2, letterSpacing: 0 }

					// If this object is being text-edited, render the overlay instead
					if (editingTextId === object.id) {
						return <TextEditOverlay
							key={object.id}
							object={object}
							textStyle={textStyle}
							onSave={handleTextEditSave}
							onCancel={handleTextEditCancel}
						/>
					}

					// Pass temp bounds if this object is being dragged/resized
					const objectTempBounds = tempObjectState?.objectId === object.id
						? tempObjectState
						: undefined

					// Only show hover when nothing is selected
					const hasSelection = prello.selectedIds.size > 0
					const isThisHovered = hoveredObjectId === object.id

					return <ObjectShape
						key={object.id}
						object={object}
						style={style}
						textStyle={textStyle}
						isSelected={prello.isSelected(object.id)}
						isHovered={!hasSelection && isThisHovered}
						onClick={e => handleObjectClick(e, object.id)}
						onDoubleClick={e => handleObjectDoubleClick(e, object.id)}
						onMouseDown={e => handleObjectMouseDown(e, object.id)}
						onMouseEnter={() => setHoveredObjectId(object.id as ObjectId)}
						onMouseLeave={() => setHoveredObjectId(null)}
						tempBounds={objectTempBounds}
					/>
				})}

				{/* Ghost overlays for remote users' edits */}
				{Array.from(prello.remotePresence.entries()).map(([clientId, presence]) => {
					if (!presence.editing) return null

					// Find the object being edited
					const obj = viewObjects.find(o => o.id === presence.editing!.objectId)
					if (!obj) return null

					const editing = presence.editing
					const user = presence.user
					const color = user?.color || '#888888'
					const x = editing.x
					const y = editing.y
					const width = editing.width ?? obj.width
					const height = editing.height ?? obj.height

					// Render the ghost shape based on object type
					let ghostShape: React.ReactNode
					switch (obj.type) {
						case 'ellipse':
							ghostShape = (
								<ellipse
									cx={x + width / 2}
									cy={y + height / 2}
									rx={width / 2}
									ry={height / 2}
									fill={color}
									stroke={color}
									strokeWidth={2}
									strokeDasharray="4,4"
								/>
							)
							break
						case 'line':
							const points = obj.points || [[0, height / 2], [width, height / 2]]
							ghostShape = (
								<line
									x1={x + points[0][0]}
									y1={y + points[0][1]}
									x2={x + points[1][0]}
									y2={y + points[1][1]}
									stroke={color}
									strokeWidth={3}
									strokeDasharray="4,4"
								/>
							)
							break
						case 'text':
							ghostShape = (
								<text
									x={x}
									y={y + height * 0.8}
									fill={color}
									fontSize={Math.min(height, 64)}
								>
									{obj.text}
								</text>
							)
							break
						default: // rect and fallback
							ghostShape = (
								<rect
									x={x}
									y={y}
									width={width}
									height={height}
									rx={'cornerRadius' in obj && typeof obj.cornerRadius === 'number' ? obj.cornerRadius : undefined}
									fill={color}
									stroke={color}
									strokeWidth={2}
									strokeDasharray="4,4"
								/>
							)
					}

					return (
						<g key={`ghost-${clientId}`} opacity={0.4} pointerEvents="none">
							{ghostShape}
							<text
								x={x}
								y={y - 5}
								fill={color}
								fontSize={10}
							>
								{user?.name || 'Unknown'}
							</text>
						</g>
					)
				})}

				{/* Selection box */}
				{selectionBounds && (
					<SelectionBox
						bounds={selectionBounds}
						rotation={selectedObjectTransform?.rotation ?? 0}
						pivotX={selectedObjectTransform?.pivotX ?? 0.5}
						pivotY={selectedObjectTransform?.pivotY ?? 0.5}
						onResizeStart={handleResizeStart}
					/>
				)}

				{/* Rotation and pivot handles (single selection only) */}
				{selectionBounds && selectedObjectTransform && (
					<>
						<RotationHandle
							bounds={selectionBounds}
							rotation={selectedObjectTransform.rotation}
							pivotX={selectedObjectTransform.pivotX}
							pivotY={selectedObjectTransform.pivotY}
							scale={1}
							onRotateStart={handleRotateStart}
							onSnapClick={(angle) => {
								updateObjectRotation(prello.yDoc, prello.doc, selectedObjectTransform.id, angle)
							}}
							isRotating={rotationState.isRotating}
							isSnapActive={rotationState.isSnapActive}
						/>
						<PivotHandle
							bounds={selectionBounds}
							rotation={selectedObjectTransform.rotation}
							pivotX={selectedObjectTransform.pivotX}
							pivotY={selectedObjectTransform.pivotY}
							scale={1}
							onPivotDragStart={handlePivotDragStart}
							isDragging={pivotDragState.isDragging}
							snapEnabled={snapSettings.settings.snapToObjects}
							snappedPoint={pivotDragState.snappedPoint}
							originalBounds={pivotDragState.originalBounds ?? undefined}
							initialPivot={pivotDragState.initialPivot ?? undefined}
						/>
					</>
				)}

				{/* Tool preview */}
				{toolEvent && prello.activeTool && (
					<rect
						x={Math.min(toolEvent.startX, toolEvent.x)}
						y={Math.min(toolEvent.startY, toolEvent.y)}
						width={Math.abs(toolEvent.x - toolEvent.startX)}
						height={Math.abs(toolEvent.y - toolEvent.startY)}
						stroke="#0066ff"
						strokeWidth={2}
						strokeDasharray="4,4"
						fill="rgba(0, 102, 255, 0.1)"
						pointerEvents="none"
					/>
				)}
			</SvgCanvas>
		</div>

		<ViewPicker
			views={views}
			activeViewId={prello.activeViewId}
			onViewSelect={id => prello.setActiveViewId(id)}
			onAddView={handleAddView}
			onPrevView={handlePrevView}
			onNextView={handleNextView}
			onPresent={() => setIsPresentationMode(true)}
		/>

		{isPresentationMode && (
			<PresentationMode
				doc={prello.doc}
				views={views}
				initialViewId={prello.activeViewId}
				onExit={() => setIsPresentationMode(false)}
			/>
		)}
	</>
}

// vim: ts=4

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
 * Main Ideallo application component
 * Milestone E: UI Polish
 */

const CURSOR_BROADCAST_THROTTLE_MS = 50

import * as React from 'react'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import '@cloudillo/react/components.css'
import './style.css'

import {
	useIdealloDocument,
	useDrawingHandler,
	useShapeHandler,
	useTextHandler,
	useStickyHandler,
	useSelectHandler,
	useEraserHandler
} from './hooks/index.js'
import {
	useResizable,
	useRotatable,
	type SvgCanvasContext,
	type ResizeHandle,
	type Point as SvgPoint
} from 'react-svg-canvas'
import { normalizeAngle } from './utils/geometry.js'
import {
	Canvas,
	Toolbar,
	ZoomControls,
	PropertyBar,
	type CanvasHandle
} from './components/index.js'
import type { ToolType } from './tools/index.js'
import type { ObjectId, Bounds, IdealloObject } from './crdt/index.js'
import { getObject, updateObject, deleteObjects } from './crdt/index.js'
import { getBoundsFromPoints } from './utils/geometry.js'
import type { MorphAnimationState } from './smart-ink/index.js'

// Helper to compute bounds for an object
function getObjectBounds(obj: IdealloObject): Bounds {
	switch (obj.type) {
		case 'freehand':
			return getBoundsFromPoints(obj.points)
		case 'polygon':
			return getBoundsFromPoints(obj.vertices)
		case 'rect':
		case 'ellipse':
		case 'text':
		case 'sticky':
			return { x: obj.x, y: obj.y, width: obj.width, height: obj.height }
		case 'line':
		case 'arrow':
			return {
				x: Math.min(obj.startX, obj.endX),
				y: Math.min(obj.startY, obj.endY),
				width: Math.abs(obj.endX - obj.startX),
				height: Math.abs(obj.endY - obj.startY)
			}
	}
}

export function IdealloApp() {
	const ideallo = useIdealloDocument()
	const canvasRef = React.useRef<CanvasHandle>(null)

	// Zoom state
	const [scale, setScale] = React.useState(1)

	// Screen-space selection bounds for PropertyBar positioning
	const [screenSelectionBounds, setScreenSelectionBounds] = React.useState<Bounds | null>(null)

	// Smart Ink morph animation state
	const [morphAnimations, setMorphAnimations] = React.useState<Map<string, MorphAnimationState>>(
		new Map()
	)

	// Recently snapped objects for undo hint (objectId -> timestamp)
	const [snappedHints, setSnappedHints] = React.useState<
		Map<ObjectId, { bounds: Bounds; timestamp: number }>
	>(new Map())

	// Selection state
	const [selectedIds, setSelectedIds] = React.useState<Set<ObjectId>>(new Set())

	const selectObject = React.useCallback((id: ObjectId, addToSelection: boolean = false) => {
		setSelectedIds((prev) => {
			if (addToSelection) {
				const next = new Set(prev)
				if (next.has(id)) {
					next.delete(id)
				} else {
					next.add(id)
				}
				return next
			}
			return new Set([id])
		})
	}, [])

	const clearSelection = React.useCallback(() => {
		setSelectedIds(new Set())
	}, [])

	// Canvas context ref for coordinate transforms
	const canvasContextRef = React.useRef<SvgCanvasContext | null>(null)

	// Track initial state at start of interaction (for CRDT commit)
	const interactionStartRef = React.useRef<{
		id: ObjectId
		bounds: Bounds
		rotation: number
		pivotX: number
		pivotY: number
		originalObjects: Map<ObjectId, IdealloObject>
	} | null>(null)

	// Temp state for visual feedback during interactions (not persisted until release)
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

	// Handle Smart Ink morph animation updates
	const handleMorphAnimationUpdate = React.useCallback(
		(states: Map<string, MorphAnimationState>) => {
			setMorphAnimations(new Map(states))
		},
		[]
	)

	// Handle object created with snapped flag (for undo hint)
	const handleObjectCreated = React.useCallback(
		(id: ObjectId, snapped: boolean) => {
			if (snapped && ideallo.doc) {
				const obj = getObject(ideallo.doc, id)
				if (obj) {
					const bounds = getObjectBounds(obj)
					setSnappedHints((prev) => {
						const next = new Map(prev)
						next.set(id, { bounds, timestamp: Date.now() })
						return next
					})
				}
			}
		},
		[ideallo.doc]
	)

	// Drawing handler for pen tool
	const drawingHandler = useDrawingHandler({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		awareness: ideallo.awareness,
		currentStyle: ideallo.currentStyle,
		enabled: ideallo.activeTool === 'pen',
		onMorphAnimationUpdate: handleMorphAnimationUpdate,
		onObjectCreated: handleObjectCreated
	})

	// Handle undo for snapped object (revert to original freehand)
	const handleUndoSnapped = React.useCallback(
		(objectId: ObjectId) => {
			// Remove hint
			setSnappedHints((prev) => {
				const next = new Map(prev)
				next.delete(objectId)
				return next
			})
			// Undo the stroke
			drawingHandler.undoStroke()
		},
		[drawingHandler]
	)

	// Shape handler for rect, ellipse, line, arrow
	const shapeHandler = useShapeHandler({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		awareness: ideallo.awareness,
		currentStyle: ideallo.currentStyle,
		activeTool: ideallo.activeTool as ToolType
	})

	// Text handler for text tool
	const textHandler = useTextHandler({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		currentStyle: ideallo.currentStyle,
		enabled: ideallo.activeTool === 'text'
	})

	// Sticky handler for sticky note tool
	const stickyHandler = useStickyHandler({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		currentStyle: ideallo.currentStyle,
		enabled: ideallo.activeTool === 'sticky'
	})

	// Select handler for select tool
	const selectHandler = useSelectHandler({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		awareness: ideallo.awareness,
		selectedIds,
		selectObject,
		clearSelection,
		enabled: ideallo.activeTool === 'select'
	})

	// Eraser handler for eraser tool
	const eraserHandler = useEraserHandler({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		awareness: ideallo.awareness,
		objects: ideallo.objects,
		enabled: ideallo.activeTool === 'eraser',
		scale
	})

	// We need selectionBounds before we can initialize resize handler
	// Compute basic selection bounds first (without offsets)
	const baseSelectionBounds = React.useMemo<Bounds | null>(() => {
		if (selectedIds.size === 0 || !ideallo.doc) return null

		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity

		selectedIds.forEach((id) => {
			const obj = getObject(ideallo.doc!, id)
			if (obj) {
				const bounds = getObjectBounds(obj)
				minX = Math.min(minX, bounds.x)
				minY = Math.min(minY, bounds.y)
				maxX = Math.max(maxX, bounds.x + bounds.width)
				maxY = Math.max(maxY, bounds.y + bounds.height)
			}
		})

		if (minX === Infinity) return null
		return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
	}, [selectedIds, ideallo.doc, ideallo.objects])

	// Get rotation of selected object (for single selection)
	const selectedObjectRotation = React.useMemo(() => {
		if (selectedIds.size !== 1 || !ideallo.doc) return 0
		const id = Array.from(selectedIds)[0]
		const obj = getObject(ideallo.doc, id)
		return obj?.rotation ?? 0
	}, [selectedIds, ideallo.doc, ideallo.objects])

	// Get pivot of selected object (for single selection)
	const selectedObjectPivotX = React.useMemo(() => {
		if (selectedIds.size !== 1 || !ideallo.doc) return 0.5
		const id = Array.from(selectedIds)[0]
		const obj = getObject(ideallo.doc, id)
		return obj?.pivotX ?? 0.5
	}, [selectedIds, ideallo.doc, ideallo.objects])

	const selectedObjectPivotY = React.useMemo(() => {
		if (selectedIds.size !== 1 || !ideallo.doc) return 0.5
		const id = Array.from(selectedIds)[0]
		const obj = getObject(ideallo.doc, id)
		return obj?.pivotY ?? 0.5
	}, [selectedIds, ideallo.doc, ideallo.objects])

	// Stored selection for hooks (single object selection)
	const storedSelection = React.useMemo(() => {
		if (selectedIds.size !== 1 || !ideallo.doc) return null
		const id = Array.from(selectedIds)[0]
		const obj = getObject(ideallo.doc, id)
		if (!obj) return null
		return {
			id,
			bounds: getObjectBounds(obj),
			rotation: obj.rotation ?? 0,
			pivotX: obj.pivotX ?? 0.5,
			pivotY: obj.pivotY ?? 0.5
		}
	}, [selectedIds, ideallo.doc, ideallo.objects])

	// Keep a ref for callbacks to avoid stale closures
	const storedSelectionRef = React.useRef(storedSelection)
	storedSelectionRef.current = storedSelection

	// Coordinate transform callbacks for library hooks
	// Note: SvgCanvasContext.translateTo returns [number, number], but hooks expect Point { x, y }
	const resizeTransformCoordinates = React.useCallback(
		(clientX: number, clientY: number, element: Element): SvgPoint => {
			const ctx = canvasContextRef.current
			if (!ctx?.translateTo) return { x: clientX, y: clientY }
			const rect = element.getBoundingClientRect()
			const [x, y] = ctx.translateTo(clientX - rect.left, clientY - rect.top)
			return { x, y }
		},
		[]
	)

	const translateToRef = React.useCallback(
		(clientX: number, clientY: number): [number, number] => {
			const ctx = canvasContextRef.current
			return ctx?.translateTo(clientX, clientY) ?? [clientX, clientY]
		},
		[]
	)

	const translateFromRef = React.useCallback(
		(canvasX: number, canvasY: number): [number, number] => {
			const ctx = canvasContextRef.current
			return ctx?.translateFrom(canvasX, canvasY) ?? [canvasX, canvasY]
		},
		[]
	)

	// Broadcast editing state via awareness
	const broadcastEditing = React.useCallback(
		(
			objectId: ObjectId | null,
			action: 'drag' | 'resize' | 'rotate' | null,
			x?: number,
			y?: number,
			width?: number,
			height?: number,
			rotation?: number
		) => {
			if (!ideallo.awareness) return
			if (objectId && action) {
				ideallo.awareness.setLocalStateField('editing', {
					objectIds: [objectId],
					action,
					dx: x ?? 0,
					dy: y ?? 0,
					...(width !== undefined && { width }),
					...(height !== undefined && { height }),
					...(rotation !== undefined && { rotation })
				})
			} else {
				ideallo.awareness.setLocalStateField('editing', undefined)
			}
		},
		[ideallo.awareness]
	)

	const clearEditingState = React.useCallback(() => {
		if (ideallo.awareness) {
			ideallo.awareness.setLocalStateField('editing', undefined)
		}
	}, [ideallo.awareness])

	// Resize hook - provides rotation-aware resize
	const {
		isResizing,
		activeHandle,
		handleResizeStart: hookResizeStart
	} = useResizable({
		bounds: storedSelection?.bounds ?? { x: 0, y: 0, width: 0, height: 0 },
		rotation: storedSelection?.rotation ?? 0,
		pivotX: storedSelection?.pivotX ?? 0.5,
		pivotY: storedSelection?.pivotY ?? 0.5,
		objectId: storedSelection?.id,
		transformCoordinates: resizeTransformCoordinates,
		disabled: ideallo.activeTool !== 'select' || !storedSelection,
		onResizeStart: ({ handle, bounds }) => {
			const current = storedSelectionRef.current
			if (!current || !ideallo.doc) return
			// Store all selected objects for multi-object resize
			const originalObjects = new Map<ObjectId, IdealloObject>()
			selectedIds.forEach((id) => {
				const obj = getObject(ideallo.doc!, id)
				if (obj) originalObjects.set(id, obj)
			})
			interactionStartRef.current = { ...current, originalObjects }
			setTempObjectState({
				objectId: current.id,
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: bounds.height
			})
		},
		onResize: ({ handle, bounds }) => {
			const initial = interactionStartRef.current
			if (!initial) return
			setTempObjectState({
				objectId: initial.id,
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: bounds.height
			})
			broadcastEditing(initial.id, 'resize', bounds.x, bounds.y, bounds.width, bounds.height)
		},
		onResizeEnd: ({ handle, bounds, originalBounds }) => {
			const initial = interactionStartRef.current
			if (!initial || !ideallo.yDoc || !ideallo.doc) return

			// Calculate scale factors
			const scaleX = bounds.width / originalBounds.width
			const scaleY = bounds.height / originalBounds.height
			const dx = bounds.x - originalBounds.x
			const dy = bounds.y - originalBounds.y

			if (dx !== 0 || dy !== 0 || scaleX !== 1 || scaleY !== 1) {
				ideallo.yDoc.transact(() => {
					initial.originalObjects.forEach((origObj, objectId) => {
						// Calculate object's relative position within selection
						const relX = origObj.x - originalBounds.x
						const relY = origObj.y - originalBounds.y

						// New position = selection origin + offset + scaled relative position
						const objNewX = originalBounds.x + dx + relX * scaleX
						const objNewY = originalBounds.y + dy + relY * scaleY

						if (
							origObj.type === 'rect' ||
							origObj.type === 'ellipse' ||
							origObj.type === 'text' ||
							origObj.type === 'sticky'
						) {
							const objNewWidth = origObj.width * scaleX
							const objNewHeight = origObj.height * scaleY
							updateObject(ideallo.yDoc, ideallo.doc!, objectId, {
								x: objNewX,
								y: objNewY,
								width: Math.max(10, objNewWidth),
								height: Math.max(10, objNewHeight)
							} as any)
						} else if (origObj.type === 'line' || origObj.type === 'arrow') {
							// Scale line endpoints relative to selection origin
							const relStartX = origObj.startX - originalBounds.x
							const relStartY = origObj.startY - originalBounds.y
							const relEndX = origObj.endX - originalBounds.x
							const relEndY = origObj.endY - originalBounds.y
							updateObject(ideallo.yDoc, ideallo.doc!, objectId, {
								x: objNewX,
								y: objNewY,
								startX: originalBounds.x + dx + relStartX * scaleX,
								startY: originalBounds.y + dy + relStartY * scaleY,
								endX: originalBounds.x + dx + relEndX * scaleX,
								endY: originalBounds.y + dy + relEndY * scaleY
							} as any)
						} else if (origObj.type === 'freehand') {
							// Scale all points relative to selection origin
							const newPoints = origObj.points.map(([px, py]) => {
								const relPx = px - originalBounds.x
								const relPy = py - originalBounds.y
								return [
									originalBounds.x + dx + relPx * scaleX,
									originalBounds.y + dy + relPy * scaleY
								] as [number, number]
							})
							updateObject(ideallo.yDoc, ideallo.doc!, objectId, {
								x: objNewX,
								y: objNewY,
								points: newPoints
							} as any)
						}
					})
				})
			}

			clearEditingState()
			setTempObjectState(null)
			interactionStartRef.current = null
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
		pivotX: storedSelection?.pivotX ?? 0.5,
		pivotY: storedSelection?.pivotY ?? 0.5,
		translateTo: translateToRef,
		translateFrom: translateFromRef,
		screenSpaceSnapZone: true,
		disabled: ideallo.activeTool !== 'select' || !storedSelection,
		onRotateStart: (angle) => {
			const current = storedSelectionRef.current
			if (!current || !ideallo.doc) return
			// Store all selected objects for multi-object rotation
			const originalObjects = new Map<ObjectId, IdealloObject>()
			selectedIds.forEach((id) => {
				const obj = getObject(ideallo.doc!, id)
				if (obj) originalObjects.set(id, obj)
			})
			interactionStartRef.current = { ...current, originalObjects }
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
			broadcastEditing(
				initial.id,
				'rotate',
				initial.bounds.x,
				initial.bounds.y,
				initial.bounds.width,
				initial.bounds.height,
				newRotation
			)
		},
		onRotateEnd: (finalRotation) => {
			const initial = interactionStartRef.current
			if (!initial || !ideallo.yDoc || !ideallo.doc) return

			const normalizedRotation = normalizeAngle(finalRotation)

			if (
				Math.abs(normalizedRotation - initial.rotation) > 0.5 ||
				normalizedRotation !== initial.rotation
			) {
				ideallo.yDoc.transact(() => {
					initial.originalObjects.forEach((origObj, objectId) => {
						updateObject(ideallo.yDoc, ideallo.doc!, objectId, {
							rotation: normalizedRotation === 0 ? undefined : normalizedRotation
						} as any)
					})
				})
			}

			clearEditingState()
			setTempObjectState(null)
			interactionStartRef.current = null
		}
	})

	// Derived states
	const isRotating = rotationState.isRotating
	const isSnapActive = rotationState.isInSnapZone

	// Compute selection bounds (with drag offset or temp state applied)
	const selectionBounds = React.useMemo<Bounds | null>(() => {
		if (selectedIds.size === 0 || !ideallo.doc) return null

		// If we have temp state from resize/rotate, use that directly
		if (tempObjectState && selectedIds.has(tempObjectState.objectId)) {
			return {
				x: tempObjectState.x,
				y: tempObjectState.y,
				width: tempObjectState.width,
				height: tempObjectState.height
			}
		}

		const dragOffset = selectHandler.dragOffset

		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity

		selectedIds.forEach((id) => {
			const obj = getObject(ideallo.doc!, id)
			if (obj) {
				const bounds = getObjectBounds(obj)
				// Apply drag offset if this object is being dragged
				const dx = dragOffset && dragOffset.objectIds.has(id) ? dragOffset.dx : 0
				const dy = dragOffset && dragOffset.objectIds.has(id) ? dragOffset.dy : 0
				minX = Math.min(minX, bounds.x + dx)
				minY = Math.min(minY, bounds.y + dy)
				maxX = Math.max(maxX, bounds.x + bounds.width + dx)
				maxY = Math.max(maxY, bounds.y + bounds.height + dy)
			}
		})

		if (minX === Infinity) return null

		return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
	}, [selectedIds, ideallo.doc, ideallo.objects, selectHandler.dragOffset, tempObjectState])

	// Unified pointer handlers that route to the right tool
	const handlePointerDown = React.useCallback(
		(x: number, y: number, shiftKey: boolean = false) => {
			if (ideallo.activeTool === 'select') {
				selectHandler.handlePointerDown(x, y, shiftKey)
			} else if (ideallo.activeTool === 'pen') {
				drawingHandler.handlePointerDown(x, y)
			} else if (ideallo.activeTool === 'eraser') {
				eraserHandler.handlePointerDown(x, y)
			} else if (['rect', 'ellipse', 'line', 'arrow'].includes(ideallo.activeTool)) {
				shapeHandler.handlePointerDown(x, y)
			} else if (ideallo.activeTool === 'text') {
				textHandler.handlePointerDown(x, y)
			} else if (ideallo.activeTool === 'sticky') {
				stickyHandler.handlePointerDown(x, y)
			}
		},
		[
			ideallo.activeTool,
			selectHandler,
			drawingHandler,
			eraserHandler,
			shapeHandler,
			textHandler,
			stickyHandler
		]
	)

	const handlePointerMove = React.useCallback(
		(x: number, y: number) => {
			// Resize/rotate is now handled by library hooks via Canvas
			if (ideallo.activeTool === 'select') {
				selectHandler.handlePointerMove(x, y)
			} else if (ideallo.activeTool === 'pen') {
				drawingHandler.handlePointerMove(x, y)
			} else if (ideallo.activeTool === 'eraser') {
				eraserHandler.handlePointerMove(x, y)
			} else if (['rect', 'ellipse', 'line', 'arrow'].includes(ideallo.activeTool)) {
				shapeHandler.handlePointerMove(x, y)
			}
		},
		[ideallo.activeTool, selectHandler, drawingHandler, eraserHandler, shapeHandler]
	)

	const handlePointerUp = React.useCallback(() => {
		// Resize/rotate is now handled by library hooks via Canvas
		if (ideallo.activeTool === 'select') {
			selectHandler.handlePointerUp()
		} else if (ideallo.activeTool === 'pen') {
			drawingHandler.handlePointerUp()
		} else if (ideallo.activeTool === 'eraser') {
			eraserHandler.handlePointerUp()
		} else if (['rect', 'ellipse', 'line', 'arrow'].includes(ideallo.activeTool)) {
			shapeHandler.handlePointerUp()
		}
	}, [ideallo.activeTool, selectHandler, drawingHandler, eraserHandler, shapeHandler])

	// Zoom handlers
	const handleZoomIn = React.useCallback(() => {
		canvasRef.current?.zoomIn()
	}, [])

	const handleZoomOut = React.useCallback(() => {
		canvasRef.current?.zoomOut()
	}, [])

	const handleZoomReset = React.useCallback(() => {
		canvasRef.current?.zoomReset()
	}, [])

	// Handle pivot commit from usePivotDrag hook
	const handlePivotCommit = React.useCallback(
		(finalPivot: { x: number; y: number }, compensation: { x: number; y: number }) => {
			if (selectedIds.size !== 1 || !ideallo.yDoc || !ideallo.doc) return
			const objectId = Array.from(selectedIds)[0]
			const obj = getObject(ideallo.doc, objectId)
			if (!obj) return

			updateObject(ideallo.yDoc, ideallo.doc, objectId, {
				pivotX: finalPivot.x,
				pivotY: finalPivot.y,
				x: obj.x + compensation.x,
				y: obj.y + compensation.y
			} as any)
		},
		[selectedIds, ideallo]
	)

	// Handle keyboard shortcuts
	const handleKeyDown = React.useCallback(
		(evt: React.KeyboardEvent) => {
			if (evt.target !== evt.currentTarget) return

			// Cmd/Ctrl+Z for undo
			if ((evt.ctrlKey || evt.metaKey) && evt.key === 'z' && !evt.shiftKey) {
				ideallo.undo()
				evt.preventDefault()
			}
			// Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y for redo
			if (
				(evt.ctrlKey || evt.metaKey) &&
				(evt.key === 'y' || (evt.key === 'z' && evt.shiftKey))
			) {
				ideallo.redo()
				evt.preventDefault()
			}

			// Zoom shortcuts
			if (evt.key === '+' || evt.key === '=') {
				handleZoomIn()
				evt.preventDefault()
			}
			if (evt.key === '-') {
				handleZoomOut()
				evt.preventDefault()
			}
			if (evt.key === '0') {
				handleZoomReset()
				evt.preventDefault()
			}

			// Tool shortcuts
			if (!evt.ctrlKey && !evt.metaKey) {
				switch (evt.key.toLowerCase()) {
					case 'v':
						ideallo.setActiveTool('select')
						break
					case 'p':
						ideallo.setActiveTool('pen')
						break
					case 'x':
						ideallo.setActiveTool('eraser')
						break
					case 'r':
						ideallo.setActiveTool('rect')
						break
					case 'e':
						ideallo.setActiveTool('ellipse')
						break
					case 'l':
						ideallo.setActiveTool('line')
						break
					case 'a':
						ideallo.setActiveTool('arrow')
						break
					case 't':
						ideallo.setActiveTool('text')
						break
					case 's':
						ideallo.setActiveTool('sticky')
						break
				}
			}

			// Delete selected objects
			if (evt.key === 'Delete' || evt.key === 'Backspace') {
				if (
					selectedIds.size > 0 &&
					ideallo.activeTool === 'select' &&
					ideallo.yDoc &&
					ideallo.doc
				) {
					deleteObjects(ideallo.yDoc, ideallo.doc, Array.from(selectedIds))
					clearSelection()
					evt.preventDefault()
				}
			}

			// Escape to clear selection
			if (evt.key === 'Escape') {
				clearSelection()
			}
		},
		[
			ideallo.undo,
			ideallo.redo,
			ideallo.setActiveTool,
			selectedIds,
			ideallo.activeTool,
			clearSelection,
			handleZoomIn,
			handleZoomOut,
			handleZoomReset
		]
	)

	// Throttled cursor position broadcast
	const cursorThrottleRef = React.useRef<number | null>(null)
	const handleCursorMove = React.useCallback(
		(x: number, y: number) => {
			// Update eraser position on hover (not just during active erasing)
			if (ideallo.activeTool === 'eraser') {
				eraserHandler.handlePointerMove(x, y)
			}

			if (!ideallo.awareness || cursorThrottleRef.current) return

			cursorThrottleRef.current = window.setTimeout(() => {
				cursorThrottleRef.current = null
				ideallo.awareness?.setLocalStateField('cursor', { x, y })
			}, CURSOR_BROADCAST_THROTTLE_MS)
		},
		[ideallo.awareness, ideallo.activeTool, eraserHandler]
	)

	// Cleanup throttle on unmount
	React.useEffect(() => {
		return () => {
			if (cursorThrottleRef.current) {
				clearTimeout(cursorThrottleRef.current)
			}
		}
	}, [])

	// Show loading state until synced
	if (!ideallo.cloudillo.synced) {
		return (
			<div className="ideallo-loading">
				<div className="ideallo-loading-spinner" />
				<div>Loading...</div>
			</div>
		)
	}

	return (
		<div
			className="ideallo-app"
			data-tool={ideallo.activeTool}
			tabIndex={0}
			onKeyDown={handleKeyDown}
		>
			{/* Canvas */}
			<Canvas
				ref={canvasRef}
				objects={ideallo.objects}
				activeStroke={drawingHandler.activeStroke}
				shapePreview={shapeHandler.shapePreview}
				textInput={textHandler.textInput}
				textInputRef={textHandler.inputRef}
				remotePresence={ideallo.remotePresence}
				activeTool={ideallo.activeTool as ToolType}
				selectedIds={selectedIds}
				selectionBounds={selectionBounds}
				selectedObjectRotation={tempObjectState?.rotation ?? selectedObjectRotation}
				selectedObjectPivotX={tempObjectState?.pivotX ?? selectedObjectPivotX}
				selectedObjectPivotY={tempObjectState?.pivotY ?? selectedObjectPivotY}
				dragOffset={selectHandler.dragOffset}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onCursorMove={handleCursorMove}
				onTextChange={textHandler.handleTextChange}
				onTextCommit={textHandler.commitText}
				onTextCancel={textHandler.cancelText}
				// Sticky editing
				editingSticky={stickyHandler.editingSticky}
				onStickyTextChange={stickyHandler.handleTextChange}
				onStickyEditComplete={stickyHandler.commitSticky}
				onStickyDoubleClick={(objectId) => {
					const obj = ideallo.doc && getObject(ideallo.doc, objectId)
					if (obj && obj.type === 'sticky') {
						stickyHandler.startEditing(obj)
					}
				}}
				onScaleChange={setScale}
				onContextReady={(ctx) => {
					canvasContextRef.current = ctx
				}}
				// Pass hook handlers for resize/rotate
				onResizeStart={hookResizeStart}
				onRotateStart={hookRotateStart}
				isRotating={isRotating}
				isSnapActive={isSnapActive}
				rotationState={rotationState}
				arcRadius={arcRadius}
				pivotPosition={pivotPosition}
				onPivotCommit={handlePivotCommit}
				// Smart Ink
				morphAnimations={morphAnimations}
				snappedHints={snappedHints}
				onUndoSnapped={handleUndoSnapped}
				currentStrokeStyle={{
					color: ideallo.currentStyle.strokeColor,
					width: ideallo.currentStyle.strokeWidth
				}}
				onScreenBoundsChange={setScreenSelectionBounds}
				// Eraser tool
				eraserPosition={eraserHandler.eraserPosition}
				eraserRadius={eraserHandler.canvasRadius}
				eraserHighlightedIds={eraserHandler.highlightedIds}
				isErasing={eraserHandler.isErasing}
				onEraserLeave={eraserHandler.handlePointerLeave}
			/>

			{/* Toolbar */}
			<Toolbar
				activeTool={ideallo.activeTool as ToolType}
				canUndo={ideallo.canUndo}
				canRedo={ideallo.canRedo}
				onToolChange={ideallo.setActiveTool}
				onUndo={ideallo.undo}
				onRedo={ideallo.redo}
			/>

			{/* Property bar for selection styling */}
			{ideallo.doc && (
				<PropertyBar
					yDoc={ideallo.yDoc}
					doc={ideallo.doc}
					selectedIds={selectedIds}
					screenBounds={screenSelectionBounds}
					rotation={selectedObjectRotation}
					currentStyle={ideallo.currentStyle}
					onCurrentStyleChange={(updates) => {
						ideallo.setCurrentStyle((prev) => ({ ...prev, ...updates }))
					}}
				/>
			)}

			{/* Zoom controls */}
			<ZoomControls
				scale={scale}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onZoomReset={handleZoomReset}
			/>

			{/* Status indicator */}
			<div className="ideallo-status">
				{ideallo.remotePresence.size > 0 && (
					<span className="ideallo-users">{ideallo.remotePresence.size + 1} users</span>
				)}
			</div>
		</div>
	)
}

// vim: ts=4

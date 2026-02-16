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
 * Main canvas component for Ideallo
 * Handles pan/zoom and pointer events
 */

import * as React from 'react'
import {
	SvgCanvas,
	useSvgCanvas,
	SelectionBox,
	usePivotDrag,
	type ToolEvent,
	type SvgCanvasHandle,
	type SvgCanvasContext,
	type ResizeHandle,
	type Point
} from 'react-svg-canvas'

import type { StoredObject, Bounds, ObjectId, YIdealloDocument } from '../crdt/index.js'
import { expandObject, toObjectId } from '../crdt/index.js'
import type {
	IdealloPresence,
	ActiveStroke as ActiveStrokeType,
	DragOffset
} from '../hooks/index.js'
import type {
	ShapePreview as ShapePreviewType,
	TextInputState,
	StickyInputState,
	TextEditState,
	ToolType
} from '../tools/index.js'

import type Quill from 'quill'
import {
	RotationHandle,
	PivotHandle,
	type RotationHandleProps,
	type PivotHandleProps
} from '@cloudillo/canvas-tools'
import type { RotationState } from 'react-svg-canvas'

/**
 * Wrapper component for RotationHandle that uses the fixed layer transform
 * Converts canvas coordinates to screen coordinates for consistent sizing
 */
function FixedRotationHandle(
	props: Omit<RotationHandleProps, 'scale' | 'bounds'> & { canvasBounds: Bounds }
) {
	const { translateFrom, scale } = useSvgCanvas()
	const [screenX, screenY] = translateFrom(props.canvasBounds.x, props.canvasBounds.y)
	const screenBounds: Bounds = {
		x: screenX,
		y: screenY,
		width: props.canvasBounds.width * scale,
		height: props.canvasBounds.height * scale
	}
	return <RotationHandle {...props} bounds={screenBounds} scale={1} />
}

/**
 * Wrapper component for PivotHandle that uses the fixed layer transform
 * Converts canvas coordinates to screen coordinates for consistent sizing
 * Uses usePivotDrag hook with translateTo for proper coordinate handling
 */
function FixedPivotHandle(
	props: Omit<
		PivotHandleProps,
		'scale' | 'bounds' | 'onPivotDragStart' | 'isDragging' | 'snappedPoint'
	> & {
		canvasBounds: Bounds
		activeTool: string
		onPivotDragStart?: () => void
		onPivotDrag?: (pivot: Point, compensation: Point) => void
		onPivotCommit?: (finalPivot: Point, compensation: Point) => void
	}
) {
	const canvasContext = useSvgCanvas()
	const { translateFrom, scale } = canvasContext

	// Ref for fresh translateTo in window handlers
	const ctxRef = React.useRef(canvasContext)
	ctxRef.current = canvasContext

	// Calculate scale-aware snap threshold (15 screen pixels)
	// Normalized threshold = screenPixels / (objectSize * scale)
	const SNAP_SCREEN_PIXELS = 15
	const avgObjectSize = (props.canvasBounds.width + props.canvasBounds.height) / 2
	const snapThreshold = avgObjectSize > 0 ? SNAP_SCREEN_PIXELS / (avgObjectSize * scale) : 0.08

	const pivotDrag = usePivotDrag({
		bounds: props.canvasBounds,
		rotation: props.rotation,
		pivotX: props.pivotX,
		pivotY: props.pivotY,
		translateTo: (x, y) => ctxRef.current.translateTo(x, y),
		snapThreshold,
		onPointerDown: () => {
			// Fire immediately on pointer down to prevent object dragging
			props.onPivotDragStart?.()
		},
		onDrag: (pivot, _snappedPoint, compensation) => {
			props.onPivotDrag?.(pivot, compensation)
		},
		onDragEnd: (finalPivot, compensation) => {
			props.onPivotCommit?.(finalPivot, compensation)
		},
		disabled: props.activeTool !== 'select'
	})

	// Screen bounds for rendering
	const [screenX, screenY] = translateFrom(props.canvasBounds.x, props.canvasBounds.y)
	const screenBounds: Bounds = {
		x: screenX,
		y: screenY,
		width: props.canvasBounds.width * scale,
		height: props.canvasBounds.height * scale
	}

	return (
		<PivotHandle
			{...props}
			bounds={screenBounds}
			scale={1}
			pivotX={pivotDrag.pivotState.pivotX}
			pivotY={pivotDrag.pivotState.pivotY}
			onPivotDragStart={pivotDrag.handlePivotDragStart}
			isDragging={pivotDrag.pivotState.isDragging}
			snappedPoint={pivotDrag.pivotState.snappedPoint}
			initialPivot={pivotDrag.pivotState.initialPivot ?? undefined}
		/>
	)
}

import { ObjectRenderer } from './ObjectRenderer.js'
import { ActiveStroke } from './ActiveStroke.js'
import { GhostStrokes } from './GhostStrokes.js'
import { GhostShapes } from './GhostShapes.js'
import { GhostEditing } from './GhostEditing.js'
import { Cursors } from './Cursors.js'
import { ShapePreview } from './ShapePreview.js'
import { TextInput } from './TextInput.js'
import { UndoHint } from './UndoHint.js'
import type { MorphAnimationState } from '../smart-ink/index.js'
import { pointsToSmoothPath } from '../utils/index.js'

export interface CanvasProps {
	doc: YIdealloDocument
	objects: Record<string, StoredObject> | null
	textContent?: Record<string, unknown> | null // Text content map, used to trigger re-render
	activeStroke: ActiveStrokeType | null
	shapePreview: ShapePreviewType | null
	textInput: TextInputState | null
	textInputRef: React.RefObject<HTMLInputElement | null>
	remotePresence: Map<number, IdealloPresence>
	activeTool: ToolType
	selectedIds: Set<ObjectId>
	selectionBounds: Bounds | null
	selectedObjectRotation: number
	selectedObjectPivotX: number
	selectedObjectPivotY: number
	dragOffset: DragOffset | null
	onPointerDown: (x: number, y: number, shiftKey?: boolean) => void
	onPointerMove: (x: number, y: number) => void
	onPointerUp: () => void
	onCursorMove?: (x: number, y: number) => void
	onTextChange?: (text: string) => void
	onTextCommit?: () => void
	onTextCancel?: () => void
	// Sticky editing
	editingSticky?: StickyInputState | null
	onStickyTextChange?: (text: string) => void
	onStickySave?: (text: string) => void
	onStickyCancel?: () => void
	onStickyDragStart?: (e: React.PointerEvent, objectId: ObjectId) => void
	onStickyDoubleClick?: (objectId: ObjectId) => void
	// Text label editing
	editingText?: TextEditState | null
	onTextLabelSave?: () => void
	onTextLabelCancel?: () => void
	onTextDoubleClick?: (objectId: ObjectId) => void
	// Callback when editor content height changes (for auto-grow)
	onEditHeightChange?: (height: number) => void
	// Quill ref for text formatting
	quillRef?: React.MutableRefObject<Quill | null>
	onScaleChange?: (scale: number) => void
	onContextReady?: (ctx: SvgCanvasContext) => void
	// Resize/Rotate - hooks receive raw pointer events
	onResizeStart?: (handle: ResizeHandle, event: React.PointerEvent) => void
	onRotateStart?: (event: React.PointerEvent) => void
	isRotating?: boolean
	isSnapActive?: boolean
	rotationState?: RotationState
	arcRadius?: number
	pivotPosition?: Point
	// Pivot
	onPivotDragStart?: () => void
	onPivotDrag?: (pivot: Point, compensation: Point) => void
	onPivotCommit?: (finalPivot: Point, compensation: Point) => void
	// Smart Ink
	morphAnimations?: Map<string, MorphAnimationState>
	snappedHints?: Map<ObjectId, { bounds: Bounds; timestamp: number }>
	onUndoSnapped?: (objectId: ObjectId) => void
	currentStrokeStyle?: { color: string; width: number }
	// Screen-space selection bounds for PropertyBar positioning
	onScreenBoundsChange?: (bounds: Bounds | null) => void
	// Eraser tool
	eraserPosition?: { x: number; y: number } | null
	eraserRadius?: number
	eraserHighlightedIds?: Set<ObjectId>
	isErasing?: boolean
	onEraserLeave?: () => void
	// Hover effect
	hoveredId?: ObjectId | null
	onPointerLeave?: () => void
	// Image loading
	ownerTag?: string
}

export interface CanvasHandle {
	zoomIn: () => void
	zoomOut: () => void
	zoomReset: () => void
}

export const Canvas = React.forwardRef<CanvasHandle, CanvasProps>(function Canvas(
	{
		doc,
		objects,
		textContent,
		activeStroke,
		shapePreview,
		textInput,
		textInputRef,
		remotePresence,
		activeTool,
		selectedIds,
		selectionBounds,
		selectedObjectRotation,
		selectedObjectPivotX,
		selectedObjectPivotY,
		dragOffset,
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onCursorMove,
		onTextChange,
		onTextCommit,
		onTextCancel,
		// Sticky editing
		editingSticky,
		onStickyTextChange,
		onStickySave,
		onStickyCancel,
		onStickyDragStart,
		onStickyDoubleClick,
		// Text label editing
		editingText,
		onTextLabelSave,
		onTextLabelCancel,
		onTextDoubleClick,
		// Height change callback
		onEditHeightChange,
		// Quill ref
		quillRef,
		onScaleChange,
		onContextReady,
		onResizeStart,
		onRotateStart,
		isRotating = false,
		isSnapActive = false,
		rotationState,
		arcRadius,
		pivotPosition,
		onPivotDragStart,
		onPivotDrag,
		onPivotCommit,
		// Smart Ink
		morphAnimations,
		snappedHints,
		onUndoSnapped,
		currentStrokeStyle,
		onScreenBoundsChange,
		// Eraser tool
		eraserPosition,
		eraserRadius = 16,
		eraserHighlightedIds,
		isErasing = false,
		onEraserLeave,
		// Hover effect
		hoveredId,
		onPointerLeave,
		// Image loading
		ownerTag
	},
	ref
) {
	const svgCanvasRef = React.useRef<SvgCanvasHandle>(null)
	const [canvasMatrix, setCanvasMatrix] = React.useState<
		[number, number, number, number, number, number]
	>([1, 0, 0, 1, 0, 0])

	// Expose zoom controls via ref
	React.useImperativeHandle(
		ref,
		() => ({
			zoomIn: () => {
				const handle = svgCanvasRef.current
				if (!handle) return
				const matrix = handle.getMatrix()
				const scaleFactor = 1.25
				const newScale = Math.min(matrix[0] * scaleFactor, 10)
				// Get viewport center from the SVG element
				const svg = document.querySelector('.ideallo-app svg')
				if (!svg) {
					handle.setMatrix([newScale, 0, 0, newScale, matrix[4], matrix[5]])
					return
				}
				const rect = svg.getBoundingClientRect()
				const cx = rect.width / 2
				const cy = rect.height / 2
				// Zoom around viewport center
				const newTx = matrix[4] - (cx - matrix[4]) * (scaleFactor - 1)
				const newTy = matrix[5] - (cy - matrix[5]) * (scaleFactor - 1)
				handle.setMatrix([newScale, 0, 0, newScale, newTx, newTy])
			},
			zoomOut: () => {
				const handle = svgCanvasRef.current
				if (!handle) return
				const matrix = handle.getMatrix()
				const scaleFactor = 0.8
				const newScale = Math.max(matrix[0] * scaleFactor, 0.1)
				// Get viewport center from the SVG element
				const svg = document.querySelector('.ideallo-app svg')
				if (!svg) {
					handle.setMatrix([newScale, 0, 0, newScale, matrix[4], matrix[5]])
					return
				}
				const rect = svg.getBoundingClientRect()
				const cx = rect.width / 2
				const cy = rect.height / 2
				// Zoom around viewport center
				const newTx = matrix[4] - (cx - matrix[4]) * (scaleFactor - 1)
				const newTy = matrix[5] - (cy - matrix[5]) * (scaleFactor - 1)
				handle.setMatrix([newScale, 0, 0, newScale, newTx, newTy])
			},
			zoomReset: () => {
				const handle = svgCanvasRef.current
				if (!handle) return
				handle.setMatrix([1, 0, 0, 1, 0, 0])
			}
		}),
		[]
	)

	// Track last matrix to avoid unnecessary state updates
	const lastMatrixRef = React.useRef<[number, number, number, number, number, number]>([
		1, 0, 0, 1, 0, 0
	])

	// Report scale changes and track matrix for fixed-layer rendering
	const handleContextReady = React.useCallback(
		(context: SvgCanvasContext) => {
			// Pass context to parent
			onContextReady?.(context)

			// Only update matrix state if values actually changed (avoids infinite loops)
			const newMatrix = context.matrix
			const prev = lastMatrixRef.current
			if (
				prev[0] !== newMatrix[0] ||
				prev[1] !== newMatrix[1] ||
				prev[2] !== newMatrix[2] ||
				prev[3] !== newMatrix[3] ||
				prev[4] !== newMatrix[4] ||
				prev[5] !== newMatrix[5]
			) {
				lastMatrixRef.current = newMatrix
				setCanvasMatrix(newMatrix)
				onScaleChange?.(context.scale)
			}
		},
		[onContextReady, onScaleChange]
	)

	const handleToolStart = React.useCallback(
		(evt: ToolEvent) => {
			onPointerDown(evt.x, evt.y, evt.shiftKey)
		},
		[onPointerDown]
	)

	const handleToolMove = React.useCallback(
		(evt: ToolEvent) => {
			onPointerMove(evt.x, evt.y)
		},
		[onPointerMove]
	)

	const handleMove = React.useCallback(
		(evt: ToolEvent) => {
			onCursorMove?.(evt.x, evt.y)
		},
		[onCursorMove]
	)

	const handleToolEnd = React.useCallback(() => {
		onPointerUp()
	}, [onPointerUp])

	// Transform selection bounds from canvas space to screen space for fixed layer
	const screenSelectionBounds = React.useMemo(() => {
		if (!selectionBounds) return null
		const [scale, , , , tx, ty] = canvasMatrix
		return {
			x: selectionBounds.x * scale + tx,
			y: selectionBounds.y * scale + ty,
			width: selectionBounds.width * scale,
			height: selectionBounds.height * scale
		}
	}, [selectionBounds, canvasMatrix])

	// Report screen bounds changes for PropertyBar positioning
	// Use ref to compare values and avoid triggering on reference-only changes
	const prevScreenBoundsRef = React.useRef<Bounds | null>(null)
	React.useEffect(() => {
		const prev = prevScreenBoundsRef.current
		const curr = screenSelectionBounds

		// Compare by value to avoid infinite loops from reference changes
		const changed =
			prev === null || curr === null
				? prev !== curr
				: prev.x !== curr.x ||
					prev.y !== curr.y ||
					prev.width !== curr.width ||
					prev.height !== curr.height

		if (changed) {
			prevScreenBoundsRef.current = curr
			onScreenBoundsChange?.(curr)
		}
	}, [screenSelectionBounds, onScreenBoundsChange])

	// Convert stored objects to runtime format for rendering
	// Apply local drag offset if object is being dragged
	const objectsToRender = React.useMemo(() => {
		if (!objects) return []

		return Object.entries(objects).map(([id, stored]) => {
			const objectId = toObjectId(id)
			let obj = expandObject(objectId, stored, doc)

			// Apply local drag offset if this object is being dragged
			if (dragOffset && dragOffset.objectIds.has(objectId)) {
				obj = {
					...obj,
					x: obj.x + dragOffset.dx,
					y: obj.y + dragOffset.dy,
					// For line/arrow, also offset endpoints
					...(obj.type === 'line' || obj.type === 'arrow'
						? {
								startX: obj.startX + dragOffset.dx,
								startY: obj.startY + dragOffset.dy,
								endX: obj.endX + dragOffset.dx,
								endY: obj.endY + dragOffset.dy
							}
						: {})
					// Note: Freehand pathData uses absolute coords, position update handled above
				}
			}

			return obj
		})
	}, [objects, textContent, dragOffset])

	// Get current scale for RotationHandle and pivot conversion
	const scale = canvasMatrix[0]

	// The displayed rotation is now passed directly from app.tsx (includes temp state)
	const displayRotation = selectedObjectRotation

	// Handle resize start from library SelectionBox - pass raw event to hook
	const handleLibResizeStart = React.useCallback(
		(handle: ResizeHandle, e: React.PointerEvent) => {
			if (!onResizeStart) return
			onResizeStart(handle, e)
		},
		[onResizeStart]
	)

	// Handle rotation start from RotationHandle - pass raw event to hook
	const handleRotateStart = React.useCallback(
		(e: React.PointerEvent) => {
			if (!onRotateStart) return
			onRotateStart(e)
		},
		[onRotateStart]
	)

	// Fixed layer content (doesn't zoom with canvas)
	const fixedContent = screenSelectionBounds ? (
		<g>
			<SelectionBox
				bounds={screenSelectionBounds}
				rotation={displayRotation}
				pivotX={selectedObjectPivotX}
				pivotY={selectedObjectPivotY}
				onResizeStart={handleLibResizeStart}
			/>
			{/* Rotation handle - rendered in fixed layer for consistent screen-space sizing */}
			{activeTool === 'select' && selectionBounds && (
				<FixedRotationHandle
					canvasBounds={selectionBounds}
					rotation={displayRotation}
					pivotX={selectedObjectPivotX}
					pivotY={selectedObjectPivotY}
					onRotateStart={handleRotateStart}
					isRotating={isRotating}
					isSnapActive={isSnapActive}
				/>
			)}
			{/* Pivot handle - uses usePivotDrag hook internally for coordinate transforms */}
			{activeTool === 'select' && selectionBounds && (
				<FixedPivotHandle
					canvasBounds={selectionBounds}
					rotation={displayRotation}
					pivotX={selectedObjectPivotX}
					pivotY={selectedObjectPivotY}
					activeTool={activeTool}
					onPivotDragStart={onPivotDragStart}
					onPivotDrag={onPivotDrag}
					onPivotCommit={onPivotCommit}
					snapEnabled={true}
				/>
			)}
		</g>
	) : null

	// Handle pointer leaving the canvas
	const handlePointerLeave = React.useCallback(() => {
		onEraserLeave?.()
		onPointerLeave?.()
	}, [onEraserLeave, onPointerLeave])

	return (
		<div
			style={{ width: '100%', height: '100%', position: 'relative' }}
			onPointerLeave={handlePointerLeave}
		>
			<SvgCanvas
				ref={svgCanvasRef}
				className="w-100 h-100"
				style={{ background: 'var(--col-surface, #f8f9fa)' }}
				onToolStart={handleToolStart}
				onToolMove={handleToolMove}
				onToolEnd={handleToolEnd}
				onMove={handleMove}
				onContextReady={handleContextReady}
				fixed={fixedContent}
			>
				{/* Render committed objects */}
				{objectsToRender.map((obj) => {
					const isStickyEditing = obj.type === 'sticky' && editingSticky?.id === obj.id
					const isTextEditing = obj.type === 'text' && editingText?.id === obj.id
					const isEditing = isStickyEditing || isTextEditing
					return (
						<ObjectRenderer
							key={obj.id}
							object={obj}
							doc={doc}
							ownerTag={ownerTag}
							scale={scale}
							isEditing={isEditing}
							onTextChange={isStickyEditing ? onStickyTextChange : undefined}
							onSave={isStickyEditing ? onStickySave : undefined}
							onCancel={
								isStickyEditing
									? onStickyCancel
									: isTextEditing
										? onTextLabelCancel
										: undefined
							}
							onDragStart={
								isStickyEditing && onStickyDragStart
									? (e) => onStickyDragStart(e, obj.id)
									: undefined
							}
							onDoubleClick={
								obj.type === 'sticky' && onStickyDoubleClick
									? () => onStickyDoubleClick(obj.id)
									: obj.type === 'text' && onTextDoubleClick
										? () => onTextDoubleClick(obj.id)
										: undefined
							}
							quillRef={isEditing ? quillRef : undefined}
							onHeightChange={isEditing ? onEditHeightChange : undefined}
							isHighlighted={eraserHighlightedIds?.has(obj.id) ?? false}
							isEraserHovered={activeTool === 'eraser' && hoveredId === obj.id}
							isHovered={
								activeTool === 'select' &&
								!dragOffset &&
								hoveredId === obj.id &&
								!selectedIds.has(obj.id)
							}
						/>
					)
				})}

				{/* Render ghost strokes from remote users */}
				<GhostStrokes remotePresence={remotePresence} />

				{/* Render ghost shapes from remote users */}
				<GhostShapes remotePresence={remotePresence} />

				{/* Render objects being edited (dragged) by remote users */}
				<GhostEditing doc={doc} remotePresence={remotePresence} objects={objects} />

				{/* Render remote user cursors */}
				<Cursors remotePresence={remotePresence} />

				{/* Render active stroke being drawn */}
				{activeStroke && <ActiveStroke stroke={activeStroke} />}

				{/* Render Smart Ink morph animations */}
				{morphAnimations && morphAnimations.size > 0 && (
					<g className="smart-ink-morphs">
						{Array.from(morphAnimations.entries()).map(([id, state]) => (
							<path
								key={id}
								d={pointsToSmoothPath(state.currentPoints as [number, number][])}
								fill="none"
								stroke={currentStrokeStyle?.color ?? '#1e1e1e'}
								strokeWidth={currentStrokeStyle?.width ?? 2}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						))}
					</g>
				)}

				{/* Render undo hints for snapped objects */}
				{snappedHints && snappedHints.size > 0 && onUndoSnapped && (
					<g className="smart-ink-undo-hints">
						{Array.from(snappedHints.entries()).map(([objectId, { bounds }]) => (
							<UndoHint
								key={objectId}
								bounds={bounds}
								onUndo={() => onUndoSnapped(objectId)}
							/>
						))}
					</g>
				)}

				{/* Render shape preview during creation */}
				{shapePreview && <ShapePreview preview={shapePreview} />}

				{/* Render text input during text creation */}
				{textInput && onTextChange && onTextCommit && onTextCancel && (
					<TextInput
						textInput={textInput}
						inputRef={textInputRef}
						onTextChange={onTextChange}
						onCommit={onTextCommit}
						onCancel={onTextCancel}
					/>
				)}

				{/* Render eraser cursor */}
				{activeTool === 'eraser' && eraserPosition && (
					<g className="eraser-cursor" pointerEvents="none">
						{/* Outer circle (eraser brush area) */}
						<circle
							cx={eraserPosition.x}
							cy={eraserPosition.y}
							r={eraserRadius}
							fill={
								isErasing ? 'rgba(255, 100, 100, 0.2)' : 'rgba(255, 100, 100, 0.1)'
							}
							stroke="#ff6666"
							strokeWidth={2 / scale}
							strokeDasharray={isErasing ? 'none' : `${4 / scale} ${4 / scale}`}
						/>
						{/* Center crosshair - horizontal */}
						<line
							x1={eraserPosition.x - 6 / scale}
							y1={eraserPosition.y}
							x2={eraserPosition.x + 6 / scale}
							y2={eraserPosition.y}
							stroke="#ff6666"
							strokeWidth={1.5 / scale}
							strokeLinecap="round"
						/>
						{/* Center crosshair - vertical */}
						<line
							x1={eraserPosition.x}
							y1={eraserPosition.y - 6 / scale}
							x2={eraserPosition.x}
							y2={eraserPosition.y + 6 / scale}
							stroke="#ff6666"
							strokeWidth={1.5 / scale}
							strokeLinecap="round"
						/>
					</g>
				)}
			</SvgCanvas>
		</div>
	)
})

// vim: ts=4

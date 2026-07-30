// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Main canvas component for Ideallo
 * Handles pan/zoom and pointer events
 */

import {
	PivotHandle,
	type PivotHandleProps,
	RotationHandle,
	type RotationHandleProps
} from '@cloudillo/canvas-tools'
import type Quill from 'quill'
import * as React from 'react'
import type { RotationState } from 'react-svg-canvas'
import {
	type Point,
	type ResizeHandle,
	SelectionBox,
	SvgCanvas,
	type SvgCanvasContext,
	type SvgCanvasHandle,
	type ToolEvent,
	usePivotDrag,
	useSvgCanvas
} from 'react-svg-canvas'

import type {
	ConnectorEndpointPreview,
	GeometryOverrides,
	ShapeGeometry
} from '../connectors/index.js'
import {
	anchorWorldPoint,
	applyEndpointPreview,
	buildConnectorContext,
	isBoundConnector,
	resolveConnectorRoutes
} from '../connectors/index.js'
import type {
	AnchorPointType,
	Bounds,
	ConnectorObject,
	IdealloObject,
	ObjectId,
	StoredObject,
	YIdealloDocument
} from '../crdt/index.js'
import { isTextBearing, toObjectId, tryExpandObject } from '../crdt/index.js'
import type {
	ActiveStroke as ActiveStrokeType,
	DragOffset,
	IdealloPresence
} from '../hooks/index.js'
import type { ObjectEditState, ShapePreview as ShapePreviewType, ToolType } from '../tools/index.js'

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
		'scale' | 'bounds' | 'originalBounds' | 'onPivotDragStart' | 'isDragging' | 'snappedPoint'
	> & {
		canvasBounds: Bounds
		canvasOriginalBounds?: Bounds | null
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

	// Transform original bounds to screen space (for stable snap points during drag)
	const screenOriginalBounds = React.useMemo(() => {
		if (!props.canvasOriginalBounds) return undefined
		const [ox, oy] = translateFrom(props.canvasOriginalBounds.x, props.canvasOriginalBounds.y)
		return {
			x: ox,
			y: oy,
			width: props.canvasOriginalBounds.width * scale,
			height: props.canvasOriginalBounds.height * scale
		}
	}, [props.canvasOriginalBounds, translateFrom, scale])

	return (
		<PivotHandle
			{...props}
			bounds={screenBounds}
			originalBounds={screenOriginalBounds}
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

import type { MorphAnimationState } from '../smart-ink/index.js'
import { getObjectBounds } from '../utils/bounds.js'
import { pointsToSmoothPath, scaleConnectorTerminals } from '../utils/index.js'
import { scalePathData } from '../utils/path-scaling.js'
import { ActiveStroke } from './ActiveStroke.js'
import { ConnectorAnchorDots } from './ConnectorAnchorDots.js'
import type { ConnectorEndpointHandlesProps } from './ConnectorEndpointHandles.js'
import { ConnectorEndpointHandles, terminalState } from './ConnectorEndpointHandles.js'
import { Cursors } from './Cursors.js'
import { GhostEditing } from './GhostEditing.js'
import { GhostShapes } from './GhostShapes.js'
import { GhostStrokes } from './GhostStrokes.js'
import { ObjectRenderer } from './ObjectRenderer.js'
import { ShapePreview } from './ShapePreview.js'
import { UndoHint } from './UndoHint.js'

/**
 * Wrapper that puts the connector terminal handles in the fixed layer, converting the world
 * endpoints to screen coordinates so the handles stay a constant size at any zoom.
 * Same pattern as FixedRotationHandle / FixedPivotHandle above.
 */
function FixedConnectorEndpointHandles(
	props: Omit<ConnectorEndpointHandlesProps, 'start' | 'end'> & {
		canvasStart: [number, number]
		canvasEnd: [number, number]
	}
) {
	const { translateFrom } = useSvgCanvas()
	const { canvasStart, canvasEnd, ...rest } = props
	const start = translateFrom(canvasStart[0], canvasStart[1]) as [number, number]
	const end = translateFrom(canvasEnd[0], canvasEnd[1]) as [number, number]
	return <ConnectorEndpointHandles {...rest} start={start} end={end} />
}

/**
 * Map a previewed bounding box onto an object, for the resize preview.
 * Shapes take the box directly; endpoint and vertex geometry is scaled into it.
 *
 * `originalBounds` is the box the resize started from, threaded down from app.tsx through
 * GeometryOverride. It cannot be measured here: connector routes are derived AFTER this runs, so
 * `getObjectBounds(obj)` would fall back to the tight endpoint box rather than the padded
 * `route.bounds` the commit scales out of.
 */
function applyBoundsOverride(
	obj: IdealloObject,
	bounds: Bounds,
	rotation?: number,
	pivot?: { x: number; y: number },
	originalBounds?: Bounds
): IdealloObject {
	const rotated = rotation !== undefined ? { rotation } : {}
	// The pivot rides along because a pivot drag compensates the object's position: without the
	// new pivot the renderer would still turn about the OLD one and the shape would visibly jump.
	const pivoted = pivot ? { pivotX: pivot.x, pivotY: pivot.y } : {}
	switch (obj.type) {
		case 'connector': {
			// Same mapper the commit calls (onResizeEnd in app.tsx), out of the same source box.
			const patch = scaleConnectorTerminals(
				obj,
				originalBounds ?? getObjectBounds(obj),
				bounds
			)
			// Fully bound: both terminals are derived, so there is nothing to preview.
			if (!patch) return { ...obj, ...rotated, ...pivoted }
			return {
				...obj,
				...rotated,
				...pivoted,
				...patch
			}
		}
		case 'polygon': {
			const current = obj.vertices
			if (!current.length) return { ...obj, ...rotated, ...pivoted, x: bounds.x, y: bounds.y }
			const xs = current.map((v) => v[0])
			const ys = current.map((v) => v[1])
			const minX = Math.min(...xs)
			const minY = Math.min(...ys)
			const width = Math.max(...xs) - minX
			const height = Math.max(...ys) - minY
			const sx = width ? bounds.width / width : 1
			const sy = height ? bounds.height / height : 1
			return {
				...obj,
				...rotated,
				...pivoted,
				x: bounds.x,
				y: bounds.y,
				vertices: current.map(
					(v) =>
						[bounds.x + (v[0] - minX) * sx, bounds.y + (v[1] - minY) * sy] as [
							number,
							number
						]
				)
			}
		}
		case 'freehand': {
			// The commit scales pathData too (app.tsx onResizeEnd), and FreehandPath ignores
			// width/height - so without the same scaling here the frame moves around a stroke that
			// sits still and only snaps on release. The factors come off getObjectBounds because
			// that is what onResizeEnd divides by: a freehand's box is MEASURED from the path and
			// can differ from the stored width/height.
			const src = getObjectBounds(obj)
			const sx = src.width ? bounds.width / src.width : 1
			const sy = src.height ? bounds.height / src.height : 1
			return {
				...obj,
				...rotated,
				...pivoted,
				// pathData is RELATIVE to x/y, and the measured box need not start there, so the
				// origin keeps its offset within the box - the same arithmetic the commit does.
				x: bounds.x + (obj.x - src.x) * sx,
				y: bounds.y + (obj.y - src.y) * sy,
				width: obj.width * sx,
				height: obj.height * sy,
				pathData: scalePathData(obj.pathData, sx, sy)
			}
		}
		default:
			return {
				...obj,
				...rotated,
				...pivoted,
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: bounds.height
			}
	}
}

export interface CanvasProps {
	doc: YIdealloDocument
	objects: Record<string, StoredObject> | null
	order: string[] | null
	textContent?: Record<string, unknown> | null // Text content map, used to trigger re-render
	activeStroke: ActiveStrokeType | null
	shapePreview: ShapePreviewType | null
	/** Shape a connector terminal would attach to right now, shown with its anchor dots */
	connectorTarget?: ShapeGeometry | null
	/** Terminal currently being dragged on the selected connector, if any */
	connectorDragTerminal?: 'start' | 'end' | null
	/**
	 * Uncommitted terminal drag on the selected connector. Applied to the arrow before routing,
	 * so the whole connector - body, heads and the grabbed handle - tracks the pointer live.
	 */
	connectorEndpointPreview?: ConnectorEndpointPreview | null
	/** Larger touch targets on small viewports */
	mobileHandles?: boolean
	/** Omit to leave the connector terminal handles out entirely (e.g. read-only) */
	onConnectorEndpointPointerDown?: (terminal: 'start' | 'end', event: React.PointerEvent) => void
	remotePresence: Map<number, IdealloPresence>
	activeTool: ToolType
	selectedIds: Set<ObjectId>
	selectionBounds: Bounds | null
	selectedObjectRotation: number
	selectedObjectPivotX: number
	selectedObjectPivotY: number
	dragOffset: DragOffset | null
	/**
	 * Pending resize/rotate geometry from app.tsx, keyed by object id.
	 * Combined with dragOffset to reroute connectors bound to whatever is being manipulated.
	 */
	geometryOverrides?: GeometryOverrides
	onPointerDown: (x: number, y: number, shiftKey?: boolean, altKey?: boolean) => void
	onPointerMove: (x: number, y: number) => void
	onPointerUp: () => void
	onCursorMove?: (x: number, y: number) => void
	// Text editing. ONE slot, one save, one double-click route: a sticky, a label and a shape's
	// caption are the same interaction, so they are the same four props.
	editing?: ObjectEditState | null
	onEditSave?: () => void
	onEditDragStart?: (e: React.PointerEvent, objectId: ObjectId) => void
	onObjectDoubleClick?: (objectId: ObjectId, e: React.MouseEvent) => void
	/** Blur into the property bar is the user styling what they are editing, not leaving it */
	shouldIgnoreEditorBlur?: () => boolean
	// Callback when editor content height changes (for auto-grow)
	onEditHeightChange?: (height: number) => void
	// Quill ref for text formatting
	quillRef?: React.MutableRefObject<Quill | null>
	onScaleChange?: (scale: number) => void
	onMatrixChange?: (matrix: [number, number, number, number, number, number]) => void
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
	pivotOriginalBounds?: Bounds | null
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
	// Stacked move highlight
	stackedHighlightIds?: Set<ObjectId>
	// Image loading
	ownerTag?: string
	token?: string
	// Source file ID for document embedding
	sourceFileId?: string
	// Document embed activation
	activeDocumentId?: ObjectId | null
	onDocumentActivate?: (id: ObjectId) => void
	// Callback when an embedded document reports view state changes
	onDocumentViewStateChange?: (
		objectId: string,
		viewState: string,
		aspectRatio?: [number, number],
		aspectFixed?: boolean
	) => void
	// Read-only mode: all document embeds are always interactive
	readOnly?: boolean
}

export interface CanvasHandle {
	zoomIn: () => void
	zoomOut: () => void
	zoomReset: () => void
	setViewport: (centerX: number, centerY: number, zoom: number) => void
}

export const Canvas = React.forwardRef<CanvasHandle, CanvasProps>(function Canvas(
	{
		doc,
		objects,
		order,
		textContent,
		activeStroke,
		shapePreview,
		connectorTarget,
		connectorDragTerminal,
		connectorEndpointPreview,
		mobileHandles,
		onConnectorEndpointPointerDown,
		remotePresence,
		activeTool,
		selectedIds,
		selectionBounds,
		selectedObjectRotation,
		selectedObjectPivotX,
		selectedObjectPivotY,
		dragOffset,
		geometryOverrides,
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onCursorMove,
		// Text editing - sticky, label and shape caption alike
		editing,
		onEditSave,
		onEditDragStart,
		onObjectDoubleClick,
		shouldIgnoreEditorBlur,
		// Height change callback
		onEditHeightChange,
		// Quill ref
		quillRef,
		onScaleChange,
		onMatrixChange,
		onContextReady,
		onResizeStart,
		onRotateStart,
		isRotating = false,
		isSnapActive = false,
		pivotOriginalBounds,
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
		// Stacked move highlight
		stackedHighlightIds,
		// Image loading
		ownerTag,
		token,
		sourceFileId,
		// Document embed activation
		activeDocumentId,
		onDocumentActivate,
		onDocumentViewStateChange,
		readOnly
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
			},
			setViewport: (centerX: number, centerY: number, zoom: number) => {
				const handle = svgCanvasRef.current
				if (!handle) return
				const svg = document.querySelector('.ideallo-app svg')
				if (!svg) return
				const rect = svg.getBoundingClientRect()
				const tx = rect.width / 2 - centerX * zoom
				const ty = rect.height / 2 - centerY * zoom
				handle.setMatrix([zoom, 0, 0, zoom, tx, ty])
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
				onMatrixChange?.(newMatrix)
			}
		},
		[onContextReady, onScaleChange, onMatrixChange]
	)

	const handleToolStart = React.useCallback(
		(evt: ToolEvent) => {
			onPointerDown(evt.x, evt.y, evt.shiftKey, evt.altKey)
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

	/**
	 * Pending geometry that has not reached the CRDT yet: the local drag offset plus whatever
	 * app.tsx is previewing for a resize or rotate.
	 *
	 * A map rather than a `dragOffset.objectIds.has(id)` gate, so an arrow bound to a dragged box
	 * reroutes live even though the arrow is not itself in the drag selection.
	 */
	const pendingGeometry = React.useMemo<GeometryOverrides>(() => {
		if (!dragOffset && !geometryOverrides) return null
		const map = new Map(geometryOverrides ?? [])
		if (dragOffset) {
			for (const id of dragOffset.objectIds) {
				map.set(id, { ...map.get(id), dx: dragOffset.dx, dy: dragOffset.dy })
			}
		}
		return map.size ? map : null
	}, [dragOffset, geometryOverrides])

	/**
	 * The document expanded to runtime objects, in z-order, with NO override applied.
	 *
	 * Split from objectsToRender because it depends only on the DOCUMENT: the ghost layer resolves
	 * once per remote pointermove per remote user, and re-expanding every record at that rate is
	 * the expensive half. GhostEditing gets this array and applies its own override map to it.
	 */
	const expandedObjects = React.useMemo(() => {
		if (!objects) return []

		// Use order array for z-ordering, fall back to Object.keys for unordered docs
		const ids = order && order.length > 0 ? order : Object.keys(objects)

		return (
			ids
				.filter((id) => id in objects)
				// Null when this build cannot read the record's type - skipped, not fatal
				.map((id) => tryExpandObject(toObjectId(id), objects[id], doc))
				.filter((obj): obj is IdealloObject => obj !== null)
		)
	}, [objects, order, textContent, doc])

	// Apply pending geometry to the expanded objects, then derive connector routes from the result
	const objectsToRender = React.useMemo(() => {
		const expanded = expandedObjects.map((obj) => {
			const override = pendingGeometry?.get(obj.id)
			if (!override) return obj

			const pivot =
				override.pivotX !== undefined && override.pivotY !== undefined
					? { x: override.pivotX, y: override.pivotY }
					: undefined
			if (override.bounds) {
				// A resize preview: app.tsx already computed the new box
				return applyBoundsOverride(
					obj,
					override.bounds,
					override.rotation,
					pivot,
					override.originalBounds
				)
			}
			const dx = override.dx ?? 0
			const dy = override.dy ?? 0
			if (!dx && !dy && override.rotation === undefined && !pivot) return obj
			return {
				...obj,
				x: obj.x + dx,
				y: obj.y + dy,
				...(override.rotation !== undefined ? { rotation: override.rotation } : {}),
				...(pivot ? { pivotX: pivot.x, pivotY: pivot.y } : {}),
				// A BOUND terminal is derived below; only free endpoints move with the drag
				...(obj.type === 'connector'
					? {
							...(obj.startObjectId
								? {}
								: { startX: obj.startX + dx, startY: obj.startY + dy }),
							...(obj.endObjectId ? {} : { endX: obj.endX + dx, endY: obj.endY + dy })
						}
					: {}),
				...(obj.type === 'polygon'
					? {
							vertices: obj.vertices.map(
								(v) => [v[0] + dx, v[1] + dy] as [number, number]
							)
						}
					: {})
				// Freehand needs nothing extra: its pathData is RELATIVE to x/y and drawn
				// through a <g transform>, so shifting the origin above moves the stroke.
			} as IdealloObject
		})

		// An in-flight terminal drag is a pending change to the ARROW, not to a shape, so it
		// cannot ride along in the override map - it is patched onto the arrow here and routed
		// below like any other binding.
		const previewed = connectorEndpointPreview
			? expanded.map((obj) => applyEndpointPreview(obj, connectorEndpointPreview))
			: expanded

		// No override map here on purpose: `previewed` ALREADY carries the pending drag/resize/
		// rotate geometry, and toShapeGeometry() would add dx/dy a second time, making every bound
		// route track at double the speed of the shape it is glued to. GhostEditing takes the other
		// route and hands the resolver raw objects plus the map - one application, never both.
		return resolveConnectorRoutes(previewed)
	}, [expandedObjects, pendingGeometry, connectorEndpointPreview])

	/**
	 * Shapes an in-flight connector PREVIEW wants to bind to - local draw gesture and remote ghosts
	 * alike. They are not referenced by any committed connector yet, so buildConnectorContext would
	 * otherwise leave them out and the preview would route against nothing.
	 */
	const previewBindIds = React.useMemo<ObjectId[]>(() => {
		const ids: ObjectId[] = []
		if (shapePreview?.type === 'connector') {
			if (shapePreview.startObjectId) ids.push(shapePreview.startObjectId)
			if (shapePreview.endObjectId) ids.push(shapePreview.endObjectId)
		}
		for (const presence of remotePresence.values()) {
			const s = presence.shape
			if (s?.type !== 'connector') continue
			if (s.startObjectId) ids.push(s.startObjectId)
			if (s.endObjectId) ids.push(s.endObjectId)
		}
		return ids
	}, [shapePreview, remotePresence])

	/**
	 * Shape lookup for connector previews (local and remote), over what is on screen now.
	 *
	 * `previewBindIds` gets a new identity on every pointermove during a connector gesture, so this
	 * is rebuilt per frame then. Deliberate: one O(objects) pass, the same order findBindTargetShape
	 * in connectors/binding.ts already pays per pointermove.
	 */
	const connectorContext = React.useMemo(
		() => buildConnectorContext(objectsToRender, undefined, previewBindIds),
		[objectsToRender, previewBindIds]
	)

	/**
	 * The anchor that would be picked if the pointer were released now, for dot highlighting.
	 * Either gesture can be the one asking: drawing a new connector, or dragging a terminal of
	 * an existing one.
	 */
	const activeConnectorAnchor = React.useMemo<AnchorPointType | null>(() => {
		const anchor = shapePreview?.targetObjectId
			? shapePreview.endAnchor
			: connectorEndpointPreview?.bind?.anchor
		return typeof anchor === 'string' ? anchor : null
	}, [shapePreview, connectorEndpointPreview])

	/**
	 * The other half of the same answer: where a FREE anchor would land. A drop that avoids all 9
	 * dots binds to a free normalized point, and without a dot under the pointer that placement
	 * is invisible until the drag ends.
	 */
	const activeFreeAnchorPoint = React.useMemo<[number, number] | null>(() => {
		const anchor = shapePreview?.targetObjectId
			? shapePreview.endAnchor
			: connectorEndpointPreview?.bind?.anchor
		if (!connectorTarget || typeof anchor !== 'object' || !anchor) return null
		return anchorWorldPoint(connectorTarget, anchor)
	}, [shapePreview, connectorEndpointPreview, connectorTarget])

	// Get current scale for RotationHandle and pivot conversion
	const scale = canvasMatrix[0]

	// The displayed rotation is now passed directly from app.tsx (includes temp state)
	const displayRotation = selectedObjectRotation

	/** The single selected connector, if that is what the selection is */
	const selectedConnector = React.useMemo<ConnectorObject | null>(() => {
		if (activeTool !== 'select' || selectedIds.size !== 1) return null
		const [id] = Array.from(selectedIds)
		const obj = objectsToRender.find((o) => o.id === id)
		return obj?.type === 'connector' ? obj : null
	}, [activeTool, selectedIds, objectsToRender])

	/**
	 * A connector bound at BOTH ends has no user-editable geometry: its position is entirely
	 * derived. The SelectionBox is HIDDEN rather than shown with inert resize and rotate handles,
	 * which reads as broken; the terminal handles below are what it does still offer.
	 */
	const fullyBoundConnector = Boolean(
		selectedConnector?.startObjectId && selectedConnector?.endObjectId
	)

	/** Any binding rules out rotation - see isBoundConnector in connectors/resolve.ts for why */
	const boundConnector = selectedConnector ? isBoundConnector(selectedConnector) : false

	/**
	 * A locked object loses the same affordances and gains the dashed outline below instead. ANY
	 * locked object in the selection disables them, rather than a resize that silently skips one
	 * member. useSelectHandler blocks the drag; this is the visible half of the same rule.
	 */
	const selectionLocked = React.useMemo(() => {
		if (!selectedIds.size) return false
		return objectsToRender.some((obj) => selectedIds.has(obj.id) && obj.locked)
	}, [selectedIds, objectsToRender])

	const noTransformHandles = fullyBoundConnector || selectionLocked

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
	const fixedContent =
		!readOnly && screenSelectionBounds ? (
			<g>
				{!noTransformHandles && (
					<SelectionBox
						bounds={screenSelectionBounds}
						rotation={displayRotation}
						pivotX={selectedObjectPivotX}
						pivotY={selectedObjectPivotY}
						onResizeStart={handleLibResizeStart}
					/>
				)}
				{/* What "selected, but locked" looks like, in place of the box it replaces */}
				{selectionLocked && (
					<rect
						className="ideallo-locked-outline"
						x={screenSelectionBounds.x}
						y={screenSelectionBounds.y}
						width={screenSelectionBounds.width}
						height={screenSelectionBounds.height}
						pointerEvents="none"
					/>
				)}
				{/* Terminal handles - the only geometry affordance a bound connector has */}
				{selectedConnector &&
					!selectedConnector.locked &&
					onConnectorEndpointPointerDown && (
						<FixedConnectorEndpointHandles
							canvasStart={[selectedConnector.startX, selectedConnector.startY]}
							canvasEnd={[selectedConnector.endX, selectedConnector.endY]}
							startState={terminalState(
								selectedConnector.startObjectId,
								selectedConnector.startAnchor
							)}
							endState={terminalState(
								selectedConnector.endObjectId,
								selectedConnector.endAnchor
							)}
							draggingTerminal={connectorDragTerminal ?? null}
							mobile={mobileHandles}
							onPointerDown={onConnectorEndpointPointerDown}
						/>
					)}
				{/* Rotation handle - rendered in fixed layer for consistent screen-space sizing */}
				{activeTool === 'select' &&
					selectionBounds &&
					!noTransformHandles &&
					!boundConnector && (
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
				{activeTool === 'select' &&
					selectionBounds &&
					!noTransformHandles &&
					!boundConnector && (
						<FixedPivotHandle
							canvasBounds={selectionBounds}
							canvasOriginalBounds={pivotOriginalBounds}
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
				{/*
					A fully bound connector gets no SelectionBox, so this halo is what shows it is
					selected. Drawn BEHIND the objects - a semi-transparent band painted over the
					arrow would wash out its own stroke.
				*/}
				{!readOnly && fullyBoundConnector && selectedConnector?.route && (
					<path
						className="connector-route-highlight"
						d={selectedConnector.route.d}
						strokeWidth={selectedConnector.style.strokeWidth + 8 / scale}
						pointerEvents="none"
					/>
				)}

				{/* Render committed objects */}
				{objectsToRender.map((obj) => {
					const isEditing = editing?.id === obj.id
					return (
						<ObjectRenderer
							key={obj.id}
							object={obj}
							doc={doc}
							ownerTag={ownerTag}
							token={token}
							scale={scale}
							sourceFileId={sourceFileId}
							activeDocument={
								obj.type === 'document' && (readOnly || activeDocumentId === obj.id)
							}
							onDocumentViewStateChange={onDocumentViewStateChange}
							isEditing={isEditing}
							onSave={isEditing ? onEditSave : undefined}
							caretPoint={isEditing ? editing?.caretPoint : undefined}
							shouldIgnoreBlur={isEditing ? shouldIgnoreEditorBlur : undefined}
							onDragStart={
								isEditing && obj.type === 'sticky' && onEditDragStart
									? (e) => onEditDragStart(e, obj.id)
									: undefined
							}
							onDoubleClick={
								isTextBearing(obj.type) && onObjectDoubleClick
									? (e) => onObjectDoubleClick(obj.id, e)
									: obj.type === 'document' && onDocumentActivate
										? () => onDocumentActivate(obj.id)
										: undefined
							}
							quillRef={isEditing ? quillRef : undefined}
							/* Auto-grow is a TEXT CONTAINER behaviour: a sticky and a text label both
							   grow to fit their content, while a rect is a box the user sized on
							   purpose and its text clips. */
							onHeightChange={
								isEditing && (obj.type === 'sticky' || obj.type === 'text')
									? onEditHeightChange
									: undefined
							}
							isHighlighted={eraserHighlightedIds?.has(obj.id) ?? false}
							isEraserHovered={activeTool === 'eraser' && hoveredId === obj.id}
							isStacked={stackedHighlightIds?.has(obj.id) ?? false}
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
				<GhostShapes remotePresence={remotePresence} connectorContext={connectorContext} />

				{/*
					Objects being edited (dragged) by remote users. `expandedObjects`, not
					`objectsToRender`: the ghost layer hands the resolver raw objects plus its own
					override map, and the latter has the local override already baked in - see the
					comment on resolveConnectorRoutes above.
				*/}
				<GhostEditing
					doc={doc}
					remotePresence={remotePresence}
					objects={objects}
					expandedObjects={expandedObjects}
					ownerTag={ownerTag}
					token={token}
				/>

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
				{/* Drop-target affordance, under the preview so the line stays legible */}
				{!readOnly && connectorTarget && (
					<ConnectorAnchorDots
						shape={connectorTarget}
						scale={scale}
						activeAnchor={activeConnectorAnchor}
						freeAnchor={activeFreeAnchorPoint}
					/>
				)}

				{shapePreview && (
					<ShapePreview preview={shapePreview} connectorContext={connectorContext} />
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

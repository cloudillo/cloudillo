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
	type SelectionBoxProps,
	type ResizeHandle,
	useSnapping,
	SnapGuides,
	computeGrabPoint,
	type SnapSpatialObject,
	type SnapGuidesProps,
	type SvgCanvasContext,
	type SvgCanvasHandle,
	DEFAULT_PIVOT_SNAP_POINTS,
	DEFAULT_PIVOT_SNAP_THRESHOLD,
	// Hooks for interactions
	useResizable,
	useRotatable,
	usePivotDrag
} from 'react-svg-canvas'
import {
	RotationHandle,
	PivotHandle,
	type RotationHandleProps,
	type PivotHandleProps
} from '@cloudillo/canvas-tools'

/**
 * Wrapper component for SnapGuides that uses the fixed layer transform
 */
function FixedSnapGuides(props: Omit<SnapGuidesProps, 'transformPoint'>) {
	const { translateFrom } = useSvgCanvas()
	return <SnapGuides {...props} transformPoint={translateFrom} />
}

/**
 * Wrapper component for SelectionBox that renders in the fixed layer
 * Transforms canvas coordinates to screen coordinates
 */
function FixedSelectionBox(props: Omit<SelectionBoxProps, 'bounds'> & { canvasBounds: Bounds }) {
	const { translateFrom, scale } = useSvgCanvas()

	// Transform bounds from canvas space to screen space
	const [screenX, screenY] = translateFrom(props.canvasBounds.x, props.canvasBounds.y)
	const screenBounds = {
		x: screenX,
		y: screenY,
		width: props.canvasBounds.width * scale,
		height: props.canvasBounds.height * scale
	}

	return <SelectionBox {...props} bounds={screenBounds} />
}

/**
 * Wrapper component for RotationHandle that renders in the fixed layer
 * Transforms canvas coordinates to screen coordinates
 */
function FixedRotationHandle(
	props: Omit<RotationHandleProps, 'scale' | 'bounds'> & { canvasBounds: Bounds }
) {
	const { translateFrom, scale } = useSvgCanvas()

	const [screenX, screenY] = translateFrom(props.canvasBounds.x, props.canvasBounds.y)
	const screenBounds = {
		x: screenX,
		y: screenY,
		width: props.canvasBounds.width * scale,
		height: props.canvasBounds.height * scale
	}

	return <RotationHandle {...props} bounds={screenBounds} scale={1} />
}

/**
 * Wrapper component for PivotHandle that renders in the fixed layer
 * Transforms canvas coordinates to screen coordinates
 */
function FixedPivotHandle(
	props: Omit<PivotHandleProps, 'scale' | 'bounds' | 'originalBounds' | 'initialPivot'> & {
		canvasBounds: Bounds
		canvasOriginalBounds?: Bounds
		initialPivot?: { x: number; y: number }
	}
) {
	const { canvasOriginalBounds, initialPivot, ...rest } = props
	const { translateFrom, scale } = useSvgCanvas()

	const [screenX, screenY] = translateFrom(props.canvasBounds.x, props.canvasBounds.y)
	const screenBounds = {
		x: screenX,
		y: screenY,
		width: props.canvasBounds.width * scale,
		height: props.canvasBounds.height * scale
	}

	// Transform original bounds for snap points during drag
	let screenOriginalBounds: Bounds | undefined
	if (canvasOriginalBounds) {
		const [origX, origY] = translateFrom(canvasOriginalBounds.x, canvasOriginalBounds.y)
		screenOriginalBounds = {
			x: origX,
			y: origY,
			width: canvasOriginalBounds.width * scale,
			height: canvasOriginalBounds.height * scale
		}
	}

	return (
		<PivotHandle
			{...rest}
			bounds={screenBounds}
			originalBounds={screenOriginalBounds}
			initialPivot={initialPivot}
			scale={1}
		/>
	)
}

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import '@cloudillo/react/components.css'
import '@cloudillo/canvas-tools/components.css'
import './style.css'

import {
	usePrezilloDocument,
	useSnappingConfig,
	useGetParent,
	useSnapSettings,
	useImageHandler
} from './hooks'
import { useViewObjects } from './hooks/useViewObjects'
import { useViews } from './hooks/useViews'
import { setEditingState, clearEditingState } from './awareness'
import { Toolbar } from './components/Toolbar'
import { ViewPicker } from './components/ViewPicker'
import { ViewFrame } from './components/ViewFrame'
import { TextEditOverlay } from './components/TextEditOverlay'
import { ObjectShape } from './components/ObjectShape'
import { PresentationMode } from './components/PresentationMode'
import {
	PrezilloPropertiesPanel,
	MobilePropertyPanel,
	type PropertyPreview
} from './components/PropertiesPanel'
import { useIsMobile, useToast, ToastContainer, type BottomSheetSnapPoint } from '@cloudillo/react'

import type { ObjectId, ViewId, PrezilloObject, ViewNode, Bounds, YPrezilloDocument } from './crdt'
import {
	createObject,
	updateObject,
	updateObjectBounds,
	updateObjectPosition,
	updateObjectSize,
	updateObjectRotation,
	updateObjectPivot,
	updateObjectTextStyle,
	updateObjectPageAssociation,
	deleteObject,
	createView,
	getView,
	getAbsoluteBounds,
	resolveShapeStyle,
	resolveTextStyle,
	getNextView,
	getPreviousView,
	moveViewInPresentation,
	bringToFront,
	bringForward,
	sendBackward,
	sendToBack,
	expandObject,
	findViewAtPoint,
	downloadExport
} from './crdt'
import { measureTextHeight } from './utils'

//////////////
// Main App //
//////////////
export function PrezilloApp() {
	const prezillo = usePrezilloDocument()
	const isReadOnly = prezillo.cloudillo.access === 'read'
	const views = useViews(prezillo.doc)
	const viewObjects = useViewObjects(prezillo.doc, prezillo.activeViewId)

	// Snapping configuration and hook
	const snapConfig = useSnappingConfig(prezillo.doc)
	const getParent = useGetParent(prezillo.doc)
	const snapSettings = useSnapSettings(prezillo.doc)

	const [toolEvent, setToolEvent] = React.useState<ToolEvent | undefined>()
	const [dragState, setDragState] = React.useState<{
		objectId: ObjectId
		startX: number
		startY: number
		objectStartX: number
		objectStartY: number
	} | null>(null)

	// Presentation mode state
	const [isPresentationMode, setIsPresentationMode] = React.useState(false)

	// Fullscreen following mode (when following presenter in fullscreen)
	const [isFullscreenFollowing, setIsFullscreenFollowing] = React.useState(false)

	// Toast for presenter notifications
	const { toast } = useToast()

	// Track previous presenters to detect new ones
	const prevPresentersRef = React.useRef<Set<number>>(new Set())

	// Show toast when a new presenter starts
	React.useEffect(() => {
		const currentIds = new Set(prezillo.activePresenters.map((p) => p.clientId))
		const prevIds = prevPresentersRef.current

		// Find new presenters (excluding local client)
		for (const presenter of prezillo.activePresenters) {
			if (
				!prevIds.has(presenter.clientId) &&
				presenter.clientId !== prezillo.awareness?.clientID
			) {
				toast({
					variant: 'info',
					title: `${presenter.user.name} started presenting`,
					duration: 4000,
					actions: (
						<button
							className="c-button primary small"
							onClick={() => prezillo.followPresenter(presenter.clientId)}
						>
							Follow
						</button>
					)
				})
			}
		}

		prevPresentersRef.current = currentIds
	}, [prezillo.activePresenters, prezillo.awareness?.clientID, prezillo.followPresenter, toast])

	// Get presenter being followed
	const followedPresenter = React.useMemo(() => {
		if (!prezillo.followingClientId) return null
		return prezillo.activePresenters.find((p) => p.clientId === prezillo.followingClientId)
	}, [prezillo.followingClientId, prezillo.activePresenters])

	// Auto-enter fullscreen when starting to follow
	React.useEffect(() => {
		if (prezillo.followingClientId && !isFullscreenFollowing) {
			setIsFullscreenFollowing(true)
		} else if (!prezillo.followingClientId && isFullscreenFollowing) {
			setIsFullscreenFollowing(false)
		}
	}, [prezillo.followingClientId, isFullscreenFollowing])

	// Handle exiting fullscreen following mode
	const handleExitFullscreenFollowing = React.useCallback(() => {
		setIsFullscreenFollowing(false)
		prezillo.unfollowPresenter()
	}, [prezillo.unfollowPresenter])

	// Handle starting presentation (with fullscreen)
	const handleStartPresenting = React.useCallback(() => {
		prezillo.startPresenting()
		setIsPresentationMode(true)
	}, [prezillo.startPresenting])

	// Handle stopping presentation
	const handleStopPresenting = React.useCallback(() => {
		prezillo.stopPresenting()
		setIsPresentationMode(false)
	}, [prezillo.stopPresenting])

	// Mobile detection
	const isMobile = useIsMobile()

	// Properties panel visibility (desktop)
	const [isPanelVisible, setIsPanelVisible] = React.useState(true)

	// Mobile bottom sheet state
	const [mobileSnapPoint, setMobileSnapPoint] = React.useState<BottomSheetSnapPoint>('closed')
	const userCollapsedRef = React.useRef(false)

	// Text editing state - which object is being text-edited
	const [editingTextId, setEditingTextId] = React.useState<ObjectId | null>(null)
	// Ref to store current editing text for save-on-click-outside
	const editingTextRef = React.useRef<string>('')

	// Hover state - which object is being hovered (only active when nothing selected)
	const [hoveredObjectId, setHoveredObjectId] = React.useState<ObjectId | null>(null)

	// Property preview state for live feedback during property scrubbing (doesn't persist)
	const [propertyPreview, setPropertyPreview] = React.useState<PropertyPreview | null>(null)

	// Selected container (layer) for creating objects inside
	const [selectedContainerId, setSelectedContainerId] = React.useState<string | null>(null)

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

	// Track grab point for snap weighting
	const grabPointRef = React.useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 })

	// Store SvgCanvas context for coordinate transformations (zoom-aware)
	const canvasContextRef = React.useRef<SvgCanvasContext | null>(null)
	const canvasRef = React.useRef<SvgCanvasHandle | null>(null)

	// Track if we just finished an interaction (resize/rotate/pivot) to prevent canvas click from clearing selection
	const justFinishedInteractionRef = React.useRef(false)

	// Canvas scale for image variant selection
	const [canvasScale, setCanvasScale] = React.useState(1)

	const handleCanvasContextReady = React.useCallback((ctx: SvgCanvasContext) => {
		canvasContextRef.current = ctx
		setCanvasScale(ctx.scale)
	}, [])

	// Image handler for inserting images via MediaPicker
	const imageHandlerRef = React.useRef<{ insertImage: (x: number, y: number) => void } | null>(
		null
	)
	const imageHandler = useImageHandler({
		yDoc: prezillo.yDoc,
		doc: prezillo.doc,
		enabled: prezillo.activeTool === 'image',
		documentFileId: prezillo.cloudillo.fileId,
		onObjectCreated: (id) => {
			prezillo.selectObject(id)
		},
		onInsertComplete: () => {
			prezillo.setActiveTool(null)
		}
	})
	imageHandlerRef.current = imageHandler

	// Get active view
	const activeView = prezillo.activeViewId ? getView(prezillo.doc, prezillo.activeViewId) : null

	// Trigger image insertion when image tool is activated
	React.useEffect(() => {
		if (prezillo.activeTool === 'image' && activeView && !imageHandler.isInserting) {
			// Insert at view center
			const centerX = activeView.x + activeView.width / 2
			const centerY = activeView.y + activeView.height / 2
			imageHandler.insertImage(centerX, centerY)
		}
	}, [prezillo.activeTool, activeView, imageHandler])

	// Center on active view when it changes
	React.useEffect(() => {
		if (activeView && canvasRef.current) {
			canvasRef.current.centerOnRect(
				activeView.x,
				activeView.y,
				activeView.width,
				activeView.height
			)
		}
	}, [prezillo.activeViewId])

	// Auto-expand/collapse mobile panel based on selection
	React.useEffect(() => {
		if (!isMobile) return

		if (prezillo.selectedIds.size > 0) {
			// Object selected - expand to peek if not user-collapsed
			if (!userCollapsedRef.current && mobileSnapPoint === 'closed') {
				setMobileSnapPoint('peek')
			}
		} else {
			// Deselected - collapse and reset user preference
			setMobileSnapPoint('closed')
			userCollapsedRef.current = false
		}
	}, [isMobile, prezillo.selectedIds.size, mobileSnapPoint])

	// Handle mobile snap point change (from user gesture)
	const handleMobileSnapChange = React.useCallback((snapPoint: BottomSheetSnapPoint) => {
		setMobileSnapPoint(snapPoint)
		// Track if user manually collapsed
		if (snapPoint === 'closed') {
			userCollapsedRef.current = true
		}
	}, [])

	// Create spatial objects for snapping
	const snapObjects = React.useMemo<SnapSpatialObject[]>(() => {
		return viewObjects.map((obj) => ({
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
	const { snapDrag, snapResize, activeSnaps, activeSnapEdges, allCandidates, clearSnaps } =
		useSnapping({
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

	// Ref to capture initial selection state at interaction start (prevents stale closure issues)
	const interactionStartRef = React.useRef<{
		id: ObjectId
		bounds: { x: number; y: number; width: number; height: number }
		rotation: number
		pivotX: number
		pivotY: number
	} | null>(null)

	// Get stored bounds for the single selected object (used by resize/rotate/pivot hooks)
	// Uses react-yjs reactive snapshot (prezillo.objects) instead of raw Y.Map
	// This ensures proper re-renders when CRDT data changes
	const storedSelection = React.useMemo(() => {
		if (prezillo.selectedIds.size !== 1) return null
		const id = Array.from(prezillo.selectedIds)[0]
		// Use react-yjs reactive snapshot instead of raw doc.o.get()
		const obj = prezillo.objects?.[id]
		if (!obj) return null
		return {
			id: id as ObjectId,
			bounds: { x: obj.xy[0], y: obj.xy[1], width: obj.wh[0], height: obj.wh[1] },
			rotation: obj.r ?? 0,
			pivotX: obj.pv?.[0] ?? 0.5,
			pivotY: obj.pv?.[1] ?? 0.5
		}
	}, [prezillo.selectedIds, prezillo.objects])

	// Ref to access latest storedSelection from callbacks (avoids stale closure)
	const storedSelectionRef = React.useRef(storedSelection)
	storedSelectionRef.current = storedSelection

	// Compute aspect ratio for single image selection
	// This is used by useResizable for aspect-locked resize
	const selectionAspectRatio = React.useMemo(() => {
		if (prezillo.selectedIds.size !== 1) return undefined
		const id = Array.from(prezillo.selectedIds)[0]
		const obj = prezillo.objects?.[id]
		if (!obj || obj.t !== 'I') return undefined // 'I' = image type
		return obj.wh[0] / obj.wh[1] // width / height
	}, [prezillo.selectedIds, prezillo.objects])

	// Transform functions that use canvasContextRef (since hooks are outside SvgCanvas context)
	const translateToRef = React.useCallback((x: number, y: number): [number, number] => {
		const ctx = canvasContextRef.current
		if (!ctx?.translateTo) return [x, y]
		return ctx.translateTo(x, y)
	}, [])

	const translateFromRef = React.useCallback((x: number, y: number): [number, number] => {
		const ctx = canvasContextRef.current
		if (!ctx?.translateFrom) return [x, y]
		return ctx.translateFrom(x, y)
	}, [])

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
		[]
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
			// Commit to CRDT
			updateObjectBounds(
				prezillo.yDoc,
				prezillo.doc,
				initial.id,
				bounds.x,
				bounds.y,
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

	// Handle object click
	function handleObjectClick(e: React.MouseEvent, objectId: ObjectId) {
		e.stopPropagation()
		const addToSelection = e.shiftKey || e.ctrlKey || e.metaKey

		// Single-click to edit: if clicking an already-selected text object, enter edit mode
		if (!isReadOnly && !addToSelection && prezillo.selectedIds.has(objectId)) {
			const obj = prezillo.doc.o.get(objectId)
			if (obj?.t === 'T') {
				setEditingTextId(objectId)
				return
			}
		}

		prezillo.selectObject(objectId, addToSelection)
		prezillo.setActiveTool(null)
	}

	// Handle object double-click (edit text)
	function handleObjectDoubleClick(e: React.MouseEvent, objectId: ObjectId) {
		if (isReadOnly) return
		e.stopPropagation()
		const obj = prezillo.doc.o.get(objectId)
		if (!obj) return

		// Only text objects are editable
		if (obj.t === 'T') {
			setEditingTextId(objectId)
		}
	}

	// Handle text edit save
	function handleTextEditSave(text: string) {
		if (!editingTextId) return

		const storedObj = prezillo.doc.o.get(editingTextId)
		if (!storedObj || storedObj.t !== 'T') {
			setEditingTextId(null)
			return
		}

		// Get the expanded object and text style
		const obj = expandObject(editingTextId, storedObj)
		const originalText = (obj as any).text ?? ''

		// Skip update if text hasn't changed
		if (text === originalText) {
			setEditingTextId(null)
			return
		}

		const textStyle = resolveTextStyle(prezillo.doc, storedObj)

		// Measure the text height with current width and style
		const measuredHeight = measureTextHeight(text, obj.width, textStyle)

		// Use minHeight if set, otherwise use current height as minimum
		const minHeight = (obj as any).minHeight ?? obj.height
		const newHeight = Math.max(measuredHeight, minHeight)

		// Update text content
		updateObject(prezillo.yDoc, prezillo.doc, editingTextId, { text } as any)

		// Update height if it changed
		if (newHeight !== obj.height) {
			updateObjectSize(prezillo.yDoc, prezillo.doc, editingTextId, obj.width, newHeight)
		}

		setEditingTextId(null)
	}

	// Handle text edit cancel
	function handleTextEditCancel() {
		setEditingTextId(null)
	}

	// Handle object pointer down (start drag) - works for both mouse and touch
	function handleObjectPointerDown(e: React.PointerEvent, objectId: ObjectId) {
		// Don't allow drag in read-only mode
		if (isReadOnly) return

		// Only handle primary button (left mouse or touch)
		if (e.button !== 0) return

		// Don't start drag if using a tool
		if (prezillo.activeTool) return

		e.stopPropagation()
		e.preventDefault()

		const obj = prezillo.doc.o.get(objectId)
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

		// Check if object was already selected BEFORE any selection changes
		// Only allow drag if object was already selected (industry standard UX pattern)
		const wasAlreadySelected = prezillo.selectedIds.has(objectId)

		// Select the object if not already selected
		if (!wasAlreadySelected) {
			const addToSelection = e.shiftKey || e.ctrlKey || e.metaKey
			prezillo.selectObject(objectId, addToSelection)
			// Don't start drag - just selected the object
			return
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

		// Handle drag with window events for smooth dragging (pointer events work for both mouse and touch)
		const handlePointerMove = (moveEvent: PointerEvent) => {
			const ctx = canvasContextRef.current
			if (!ctx?.translateTo) return

			// Transform screen coords to canvas coords (zoom-aware)
			const rect = svgElement.getBoundingClientRect()
			const [moveX, moveY] = ctx.translateTo(
				moveEvent.clientX - rect.left,
				moveEvent.clientY - rect.top
			)

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
			if (prezillo.awareness) {
				setEditingState(
					prezillo.awareness,
					initialDragState.objectId,
					'drag',
					currentX,
					currentY,
					initialDragState.objectWidth,
					initialDragState.objectHeight
				)
			}
		}

		const handlePointerUp = () => {
			// Only commit to CRDT if position actually changed
			if (
				currentX !== initialDragState.objectStartX ||
				currentY !== initialDragState.objectStartY
			) {
				updateObjectPosition(
					prezillo.yDoc,
					prezillo.doc,
					initialDragState.objectId,
					currentX,
					currentY
				)

				// Check if object should transfer to a different page
				const obj = prezillo.doc.o.get(initialDragState.objectId)
				if (obj) {
					const currentPageId = obj.vi as ViewId | undefined
					const objWidth = obj.wh[0]
					const objHeight = obj.wh[1]

					// Calculate object center in global coords
					let centerX = currentX + objWidth / 2
					let centerY = currentY + objHeight / 2

					// If currently on a page, add page offset to get global coords
					if (currentPageId) {
						const currentPage = prezillo.doc.v.get(currentPageId)
						if (currentPage) {
							centerX += currentPage.x
							centerY += currentPage.y
						}
					}

					// Find which page the center is now in
					const newPageId = findViewAtPoint(prezillo.doc, centerX, centerY)

					// If page changed, update association
					if (newPageId !== currentPageId) {
						updateObjectPageAssociation(
							prezillo.yDoc,
							prezillo.doc,
							initialDragState.objectId,
							newPageId,
							{ preserveGlobalPosition: true }
						)
					}
				}
			}

			// Clear awareness
			if (prezillo.awareness) {
				clearEditingState(prezillo.awareness)
			}

			// Clear snapping state
			clearSnaps()

			// Clear local state
			setDragState(null)
			setTempObjectState(null)
			window.removeEventListener('pointermove', handlePointerMove)
			window.removeEventListener('pointerup', handlePointerUp)
		}

		window.addEventListener('pointermove', handlePointerMove)
		window.addEventListener('pointerup', handlePointerUp)
	}

	// Handle canvas click (deselect)
	function handleCanvasClick() {
		// Skip if we just finished a resize/rotate/pivot interaction
		if (justFinishedInteractionRef.current) {
			justFinishedInteractionRef.current = false
			return
		}
		// If we're editing text, save it before clearing
		if (editingTextId) {
			handleTextEditSave(editingTextRef.current)
			return // Don't clear selection when exiting text edit
		}
		if (!prezillo.activeTool) {
			prezillo.clearSelection()
		}
	}

	// Handle delete
	function handleDelete() {
		if (isReadOnly) return
		prezillo.selectedIds.forEach((id) => {
			deleteObject(prezillo.yDoc, prezillo.doc, id)
		})
		prezillo.clearSelection()
	}

	// Handle tool start
	function handleToolStart(evt: ToolEvent) {
		if (isReadOnly) return // Don't allow tools in read-only mode
		if (isResizing) return // Don't start drag while resizing

		if (prezillo.activeTool) {
			// Start drawing a new shape
			setToolEvent(evt)
		}
		// Note: Dragging selected objects is now handled by ObjectShape's onPointerDown
		// via handleObjectPointerDown, not here
	}

	// Handle tool move
	function handleToolMove(evt: ToolEvent) {
		if (isResizing) return // Resize is handled by window events
		if (dragState) return // Drag is handled by window events

		if (prezillo.activeTool) {
			setToolEvent(evt)
		}
	}

	// Handle tool end
	function handleToolEnd() {
		if (isResizing) return // Resize is handled by window events

		if (dragState) {
			setDragState(null)
			return
		}

		if (!toolEvent || !prezillo.activeTool) return

		let x = Math.min(toolEvent.startX, toolEvent.x)
		let y = Math.min(toolEvent.startY, toolEvent.y)
		let width = Math.abs(toolEvent.x - toolEvent.startX)
		let height = Math.abs(toolEvent.y - toolEvent.startY)

		const isTextTool = prezillo.activeTool === 'text'

		if (width < 5 || height < 5) {
			if (isTextTool) {
				// Click-to-create: use default size at click point
				x = toolEvent.startX
				y = toolEvent.startY
				width = 800
				height = 80
			} else {
				setToolEvent(undefined)
				return
			}
		}

		// Use selected container, or first layer if none selected
		let parentId = selectedContainerId
		if (!parentId) {
			const layers = prezillo.doc.r.toArray().filter((ref) => ref[0] === 1)
			parentId = layers.length > 0 ? layers[0][1] : null
		}

		// Determine which page the object should be created on (page-relative coords)
		const targetPageId = findViewAtPoint(prezillo.doc, toolEvent.startX, toolEvent.startY)

		// If creating on a page, convert to page-relative coordinates
		let createX = x
		let createY = y
		if (targetPageId) {
			const view = getView(prezillo.doc, targetPageId)
			if (view) {
				createX = x - view.x
				createY = y - view.y
			}
		}

		// Create object based on tool
		const objectId = createObject(
			prezillo.yDoc,
			prezillo.doc,
			prezillo.activeTool as any,
			createX,
			createY,
			width,
			height,
			parentId as any,
			undefined, // insertIndex
			targetPageId ?? undefined // pageId - page-relative if on a page
		)

		prezillo.setActiveTool(null)
		setToolEvent(undefined)
		prezillo.selectObject(objectId)

		// Start editing immediately for text objects (better UX - no double-click needed)
		if (isTextTool) {
			setEditingTextId(objectId)
		}
	}

	// Handle keyboard
	function handleKeyDown(evt: React.KeyboardEvent) {
		if (evt.target !== evt.currentTarget) return

		if (!evt.altKey && !evt.shiftKey && !evt.ctrlKey && !evt.metaKey) {
			switch (evt.key) {
				case 'Delete':
				case 'Backspace':
					if (!isReadOnly && prezillo.selectedIds.size > 0) {
						handleDelete()
					}
					break
				case 'Escape':
					prezillo.clearSelection()
					prezillo.setActiveTool(null)
					setEditingTextId(null)
					break
			}
		} else if (!evt.altKey && !evt.shiftKey && (evt.ctrlKey || evt.metaKey)) {
			switch (evt.key) {
				case 'z':
					if (!isReadOnly) prezillo.undo()
					evt.preventDefault()
					break
				case 'y':
					if (!isReadOnly) prezillo.redo()
					evt.preventDefault()
					break
				case 'a':
					// Select all in view
					if (prezillo.activeViewId) {
						const ids = viewObjects.map((o) => o.id)
						prezillo.selectObjects(ids)
					}
					evt.preventDefault()
					break
			}
		}
	}

	// View navigation
	function handlePrevView() {
		if (prezillo.activeViewId) {
			const prev = getPreviousView(prezillo.doc, prezillo.activeViewId)
			if (prev) prezillo.setActiveViewId(prev)
		}
	}

	function handleNextView() {
		if (prezillo.activeViewId) {
			const next = getNextView(prezillo.doc, prezillo.activeViewId)
			if (next) prezillo.setActiveViewId(next)
		}
	}

	function handleAddView() {
		const viewId = createView(prezillo.yDoc, prezillo.doc, {
			copyFromViewId: prezillo.activeViewId || undefined
		})
		prezillo.setActiveViewId(viewId)
	}

	function handleReorderView(viewId: ViewId, newIndex: number) {
		moveViewInPresentation(prezillo.yDoc, prezillo.doc, viewId, newIndex)
	}

	// Get selection bounds (use tempObjectState for immediate visual feedback during drag/resize)
	const selectionBounds = React.useMemo(() => {
		if (prezillo.selectedIds.size === 0) return null

		let minX = Infinity,
			minY = Infinity
		let maxX = -Infinity,
			maxY = -Infinity

		prezillo.selectedIds.forEach((id) => {
			// Use temp state if available for this object
			if (tempObjectState && tempObjectState.objectId === id) {
				minX = Math.min(minX, tempObjectState.x)
				minY = Math.min(minY, tempObjectState.y)
				maxX = Math.max(maxX, tempObjectState.x + tempObjectState.width)
				maxY = Math.max(maxY, tempObjectState.y + tempObjectState.height)
			} else {
				const bounds = getAbsoluteBounds(prezillo.doc, id)
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
	}, [prezillo.selectedIds, prezillo.doc.o, viewObjects, tempObjectState])

	// Get selected object rotation and pivot (for single selection only)
	const selectedObjectTransform = React.useMemo(() => {
		if (prezillo.selectedIds.size !== 1) return null
		const id = Array.from(prezillo.selectedIds)[0]
		const obj = prezillo.doc.o.get(id)
		if (!obj) return null
		return {
			id,
			rotation: tempObjectState?.rotation ?? (obj.r || 0),
			pivotX: tempObjectState?.pivotX ?? obj.pv?.[0] ?? 0.5,
			pivotY: tempObjectState?.pivotY ?? obj.pv?.[1] ?? 0.5
		}
	}, [prezillo.selectedIds, prezillo.doc.o, tempObjectState])

	// Check if selection is a text object
	// prezillo.doc.o in deps ensures this recalculates when any object updates
	const selectedTextObject = React.useMemo(() => {
		if (prezillo.selectedIds.size !== 1) return null
		const id = Array.from(prezillo.selectedIds)[0]
		const obj = prezillo.doc.o.get(id)
		if (!obj || (obj.t !== 'T' && obj.t !== 'B')) return null
		return { id, obj }
	}, [prezillo.selectedIds, prezillo.doc.o])

	// Get current text style for selected text object
	const selectedTextStyle = React.useMemo(() => {
		if (!selectedTextObject) return null
		// Re-fetch fresh object to get latest style
		const freshObj = prezillo.doc.o.get(selectedTextObject.id)
		if (!freshObj) return null
		return resolveTextStyle(prezillo.doc, freshObj)
	}, [selectedTextObject, prezillo.doc.o, prezillo.doc])

	// Handle text alignment change
	function handleTextAlignChange(align: 'left' | 'center' | 'right' | 'justify') {
		if (!selectedTextObject) return
		const taMap = { left: 'l', center: 'c', right: 'r', justify: 'j' } as const
		updateObjectTextStyle(prezillo.yDoc, prezillo.doc, selectedTextObject.id as ObjectId, {
			ta: taMap[align]
		})
	}

	// Handle vertical alignment change
	function handleVerticalAlignChange(align: 'top' | 'middle' | 'bottom') {
		if (!selectedTextObject) return
		const vaMap = { top: 't', middle: 'm', bottom: 'b' } as const
		updateObjectTextStyle(prezillo.yDoc, prezillo.doc, selectedTextObject.id as ObjectId, {
			va: vaMap[align]
		})
	}

	// Handle font size change
	function handleFontSizeChange(size: number) {
		if (!selectedTextObject) return
		updateObjectTextStyle(prezillo.yDoc, prezillo.doc, selectedTextObject.id as ObjectId, {
			fs: size
		})
	}

	// Handle bold toggle
	function handleBoldToggle() {
		if (!selectedTextObject || !selectedTextStyle) return
		// Toggle bold: if currently bold, remove it (null to reset to default); otherwise set bold
		const newWeight = selectedTextStyle.fontWeight === 'bold' ? null : 'bold'
		updateObjectTextStyle(prezillo.yDoc, prezillo.doc, selectedTextObject.id as ObjectId, {
			fw: newWeight
		})
	}

	// Handle italic toggle
	function handleItalicToggle() {
		if (!selectedTextObject || !selectedTextStyle) return
		// Toggle italic: if currently italic, remove it (null); otherwise set true
		const newItalic = selectedTextStyle.fontItalic ? null : true
		updateObjectTextStyle(prezillo.yDoc, prezillo.doc, selectedTextObject.id as ObjectId, {
			fi: newItalic
		})
	}

	// Handle underline toggle
	function handleUnderlineToggle() {
		if (!selectedTextObject || !selectedTextStyle) return
		const currentDecoration = selectedTextStyle.textDecoration
		// Toggle underline: if currently underline, remove it (null); otherwise set underline
		const newDecoration = currentDecoration === 'underline' ? null : 'u'
		updateObjectTextStyle(prezillo.yDoc, prezillo.doc, selectedTextObject.id as ObjectId, {
			td: newDecoration
		})
	}

	return (
		<>
			{!isReadOnly && (
				<Toolbar
					doc={prezillo.doc}
					yDoc={prezillo.yDoc}
					tool={prezillo.activeTool}
					setTool={(tool) => {
						prezillo.clearSelection()
						prezillo.setActiveTool(tool)
					}}
					hasSelection={prezillo.selectedIds.size > 0}
					onDelete={handleDelete}
					canUndo={prezillo.canUndo}
					canRedo={prezillo.canRedo}
					onUndo={prezillo.undo}
					onRedo={prezillo.redo}
					onExport={() => {
						if (prezillo.yDoc && prezillo.doc) {
							downloadExport(prezillo.yDoc, prezillo.doc)
						}
					}}
					onBringToFront={() => {
						prezillo.selectedIds.forEach((id) =>
							bringToFront(prezillo.yDoc, prezillo.doc, id)
						)
					}}
					onBringForward={() => {
						prezillo.selectedIds.forEach((id) =>
							bringForward(prezillo.yDoc, prezillo.doc, id)
						)
					}}
					onSendBackward={() => {
						// Process in reverse to maintain relative order when moving down
						Array.from(prezillo.selectedIds)
							.reverse()
							.forEach((id) => sendBackward(prezillo.yDoc, prezillo.doc, id))
					}}
					onSendToBack={() => {
						// Process in reverse to maintain relative order when moving to back
						Array.from(prezillo.selectedIds)
							.reverse()
							.forEach((id) => sendToBack(prezillo.yDoc, prezillo.doc, id))
					}}
					snapToGrid={snapSettings.settings.snapToGrid}
					snapToObjects={snapSettings.settings.snapToObjects}
					snapToSizes={snapSettings.settings.snapToSizes}
					snapToDistribution={snapSettings.settings.snapToDistribution}
					snapDebug={snapSettings.settings.snapDebug}
					onToggleSnapToGrid={snapSettings.toggleSnapToGrid}
					onToggleSnapToObjects={snapSettings.toggleSnapToObjects}
					onToggleSnapToSizes={snapSettings.toggleSnapToSizes}
					onToggleSnapToDistribution={snapSettings.toggleSnapToDistribution}
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
					isPanelVisible={isPanelVisible}
					onTogglePanel={() => setIsPanelVisible((v) => !v)}
				/>
			)}

			<div className="c-hbox flex-fill" style={{ overflow: 'hidden' }}>
				<div
					className="c-panel flex-fill"
					tabIndex={0}
					onKeyDown={handleKeyDown}
					onClick={handleCanvasClick}
					style={{ outline: 'none', minWidth: 0 }}
				>
					<SvgCanvas
						ref={canvasRef}
						className="w-100 h-100"
						onToolStart={prezillo.activeTool ? handleToolStart : undefined}
						onToolMove={prezillo.activeTool ? handleToolMove : undefined}
						onToolEnd={prezillo.activeTool ? handleToolEnd : undefined}
						onContextReady={handleCanvasContextReady}
						fixed={
							<>
								<FixedSnapGuides
									activeSnaps={activeSnaps}
									activeSnapEdges={activeSnapEdges}
									allCandidates={
										snapConfig.debug.enabled ? allCandidates : undefined
									}
									config={snapConfig.guides}
									debugConfig={snapConfig.debug}
									viewBounds={viewBounds}
									draggedBounds={
										tempObjectState
											? {
													x: tempObjectState.x,
													y: tempObjectState.y,
													width: tempObjectState.width,
													height: tempObjectState.height,
													rotation: 0
												}
											: undefined
									}
								/>
								{/* Selection box - fixed layer for constant screen size */}
								{selectionBounds && (
									<FixedSelectionBox
										canvasBounds={selectionBounds}
										rotation={selectedObjectTransform?.rotation ?? 0}
										pivotX={selectedObjectTransform?.pivotX ?? 0.5}
										pivotY={selectedObjectTransform?.pivotY ?? 0.5}
										onResizeStart={handleResizeStart}
									/>
								)}
								{/* Rotation and pivot handles - fixed layer for constant screen size */}
								{!isReadOnly && selectionBounds && selectedObjectTransform && (
									<>
										<FixedRotationHandle
											canvasBounds={selectionBounds}
											rotation={selectedObjectTransform.rotation}
											pivotX={selectedObjectTransform.pivotX}
											pivotY={selectedObjectTransform.pivotY}
											onRotateStart={hookRotateStart}
											onSnapClick={(angle) => {
												updateObjectRotation(
													prezillo.yDoc,
													prezillo.doc,
													selectedObjectTransform.id,
													angle
												)
											}}
											isRotating={rotationState.isRotating}
											isSnapActive={rotationState.isInSnapZone}
										/>
										<FixedPivotHandle
											canvasBounds={selectionBounds}
											canvasOriginalBounds={
												storedSelection?.bounds ?? undefined
											}
											initialPivot={
												storedSelection
													? {
															x: storedSelection.pivotX,
															y: storedSelection.pivotY
														}
													: undefined
											}
											rotation={selectedObjectTransform.rotation}
											pivotX={
												tempObjectState?.pivotX ??
												selectedObjectTransform.pivotX
											}
											pivotY={
												tempObjectState?.pivotY ??
												selectedObjectTransform.pivotY
											}
											onPivotDragStart={hookPivotDragStart}
											isDragging={pivotState.isDragging}
											snapEnabled={snapSettings.settings.snapToObjects}
											snappedPoint={pivotState.snappedPoint}
										/>
									</>
								)}
							</>
						}
					>
						{/* Render all views as frames */}
						{views.map((view) => (
							<ViewFrame
								key={view.id}
								view={view}
								isActive={view.id === prezillo.activeViewId}
								isSelected={view.id === prezillo.selectedViewId}
								onClick={() => prezillo.selectView(view.id)}
							/>
						))}

						{/* Render objects in active view */}
						{viewObjects.map((object) => {
							const storedObj = prezillo.doc.o.get(object.id)
							const style = storedObj
								? resolveShapeStyle(prezillo.doc, storedObj)
								: {
										fill: '#cccccc',
										stroke: '#999999',
										strokeWidth: 1,
										fillOpacity: 1,
										strokeOpacity: 1,
										strokeDasharray: '',
										strokeLinecap: 'butt' as const,
										strokeLinejoin: 'miter' as const
									}
							const textStyle = storedObj
								? resolveTextStyle(prezillo.doc, storedObj)
								: {
										fontFamily: 'system-ui, sans-serif',
										fontSize: 16,
										fontWeight: 'normal' as const,
										fontItalic: false,
										textDecoration: 'none' as const,
										fill: '#333333',
										textAlign: 'left' as const,
										verticalAlign: 'top' as const,
										lineHeight: 1.2,
										letterSpacing: 0
									}

							// If this object is being text-edited, render the overlay instead
							if (editingTextId === object.id) {
								return (
									<TextEditOverlay
										key={object.id}
										object={object}
										textStyle={textStyle}
										onSave={handleTextEditSave}
										onCancel={handleTextEditCancel}
										onTextChange={(t) => {
											editingTextRef.current = t
										}}
										onDragStart={(e) => handleObjectPointerDown(e, object.id)}
									/>
								)
							}

							// Pass temp bounds if this object is being dragged/resized
							const objectTempBounds =
								tempObjectState?.objectId === object.id
									? tempObjectState
									: undefined

							// Apply property preview if this object is being scrubbed
							const displayObject =
								propertyPreview?.objectId === object.id
									? {
											...object,
											opacity: propertyPreview.opacity ?? object.opacity
										}
									: object

							// Only show hover when nothing is selected
							const hasSelection = prezillo.selectedIds.size > 0
							const isThisHovered = hoveredObjectId === object.id

							return (
								<ObjectShape
									key={object.id}
									object={displayObject}
									style={style}
									textStyle={textStyle}
									isSelected={prezillo.isSelected(object.id)}
									isHovered={!hasSelection && isThisHovered}
									onClick={(e) => handleObjectClick(e, object.id)}
									onDoubleClick={(e) => handleObjectDoubleClick(e, object.id)}
									onPointerDown={(e) => handleObjectPointerDown(e, object.id)}
									onMouseEnter={() => setHoveredObjectId(object.id as ObjectId)}
									onMouseLeave={() => setHoveredObjectId(null)}
									tempBounds={objectTempBounds}
									ownerTag={prezillo.cloudillo.idTag}
									scale={canvasScale}
								/>
							)
						})}

						{/* Ghost overlays for remote users' edits */}
						{Array.from(prezillo.remotePresence.entries()).map(
							([clientId, presence]) => {
								if (!presence.editing) return null

								// Find the object being edited
								const obj = viewObjects.find(
									(o) => o.id === presence.editing!.objectId
								)
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
										const points = obj.points || [
											[0, height / 2],
											[width, height / 2]
										]
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
												rx={
													'cornerRadius' in obj &&
													typeof obj.cornerRadius === 'number'
														? obj.cornerRadius
														: undefined
												}
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
										<text x={x} y={y - 5} fill={color} fontSize={10}>
											{user?.name || 'Unknown'}
										</text>
									</g>
								)
							}
						)}

						{/* Tool preview */}
						{toolEvent && prezillo.activeTool && (
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

				{/* Desktop: Sidebar panel */}
				{!isMobile && isPanelVisible && !isReadOnly && (
					<PrezilloPropertiesPanel
						doc={prezillo.doc}
						yDoc={prezillo.yDoc}
						selectedIds={prezillo.selectedIds}
						onSelectObject={prezillo.selectObject}
						activeViewId={prezillo.activeViewId}
						selectedViewId={prezillo.selectedViewId}
						onPreview={setPropertyPreview}
						selectedContainerId={selectedContainerId as any}
						onSelectContainer={setSelectedContainerId as any}
					/>
				)}
			</div>

			{/* Mobile: Bottom sheet panel */}
			{isMobile && !isReadOnly && (
				<MobilePropertyPanel
					doc={prezillo.doc}
					yDoc={prezillo.yDoc}
					selectedIds={prezillo.selectedIds}
					activeViewId={prezillo.activeViewId}
					selectedViewId={prezillo.selectedViewId}
					snapPoint={mobileSnapPoint}
					onSnapChange={handleMobileSnapChange}
					onPreview={setPropertyPreview}
				/>
			)}

			<div className="c-nav-container c-hbox">
				<ViewPicker
					views={views}
					activeViewId={prezillo.activeViewId}
					onViewSelect={(id) => {
						// When following and user clicks a view, stop following
						if (prezillo.followingClientId) {
							prezillo.unfollowPresenter()
						}
						prezillo.setActiveViewId(id)
					}}
					onAddView={handleAddView}
					onPrevView={handlePrevView}
					onNextView={handleNextView}
					onPresent={handleStartPresenting}
					readOnly={isReadOnly}
					onReorderView={handleReorderView}
					isPresenting={prezillo.isPresenting}
					onStopPresenting={handleStopPresenting}
					activePresenters={prezillo.activePresenters}
					isMobile={isMobile}
					followingClientId={prezillo.followingClientId}
					onFollow={prezillo.followPresenter}
					onUnfollow={prezillo.unfollowPresenter}
				/>
			</div>

			{/* Presentation mode - local presenting */}
			{isPresentationMode && (
				<PresentationMode
					doc={prezillo.doc}
					views={views}
					initialViewId={prezillo.activeViewId}
					onExit={handleStopPresenting}
					ownerTag={prezillo.cloudillo.idTag}
					onViewChange={(viewIndex, viewId) => {
						prezillo.setActiveViewId(viewId)
					}}
				/>
			)}

			{/* Fullscreen following mode */}
			{isFullscreenFollowing && followedPresenter && (
				<PresentationMode
					doc={prezillo.doc}
					views={views}
					initialViewId={followedPresenter.viewId}
					onExit={handleExitFullscreenFollowing}
					ownerTag={prezillo.cloudillo.idTag}
					isFollowing={true}
					followingViewIndex={followedPresenter.viewIndex}
				/>
			)}

			{/* Toast container for notifications */}
			<ToastContainer position="top-right" />
		</>
	)
}

// vim: ts=4

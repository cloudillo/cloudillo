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
	type PivotHandleProps,
	createLinearGradientDef,
	createRadialGradientDef
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
	useImageHandler,
	useTemplateGuides,
	useTemplateObjects,
	useTemplates
} from './hooks'
import { useViewObjects, useVisibleViewObjects } from './hooks/useViewObjects'
import { useVisibleViews } from './hooks/useVisibleViews'
import { useViews } from './hooks/useViews'
import { setEditingState, clearEditingState } from './awareness'
import { Toolbar } from './components/Toolbar'
import { ViewPicker } from './components/ViewPicker'
import { ViewFrame } from './components/ViewFrame'
import { TextEditOverlay } from './components/TextEditOverlay'
import { ObjectShape } from './components/ObjectShape'
import { PresentationMode } from './components/PresentationMode'
import { TemplateGuideRenderer } from './components/TemplateGuideRenderer'
import { TemplatesRow } from './components/TemplatesRow'
import {
	PrezilloPropertiesPanel,
	MobilePropertyPanel,
	type PropertyPreview
} from './components/PropertiesPanel'
import {
	useIsMobile,
	useToast,
	ToastContainer,
	useDialog,
	type BottomSheetSnapPoint
} from '@cloudillo/react'

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
	deletePrototypeWithInstances,
	getInstancesOfPrototype,
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
	downloadExport,
	getTemplate,
	addObjectToTemplate,
	// Template instance lock checking
	isInstance,
	isPropertyGroupLocked,
	// Prototype resolution helpers
	resolveObject,
	getResolvedBounds,
	getResolvedWh,
	duplicateObject
} from './crdt'
import { measureTextHeight } from './utils'

//////////////
// Main App //
//////////////
export function PrezilloApp() {
	const prezillo = usePrezilloDocument()
	const isReadOnly = prezillo.cloudillo.access === 'read'
	const views = useViews(prezillo.doc)

	// Active view objects (for snapping - within active page only)
	const activeViewObjects = useViewObjects(prezillo.doc, prezillo.activeViewId)

	// Snapping configuration and hook
	const snapConfig = useSnappingConfig(prezillo.doc)
	const getParent = useGetParent(prezillo.doc)
	const snapSettings = useSnapSettings(prezillo.doc)

	// Template guides for current view
	const templateGuides = useTemplateGuides(prezillo.doc, prezillo.activeViewId)

	// Template objects for editing mode
	const templateEditingContext = useTemplateObjects(prezillo.doc, prezillo.editingTemplateId)

	// Templates for the templates row
	const { templates: templatesWithUsage, getTemplateObjects } = useTemplates(prezillo.doc)

	// Templates row collapsed state (expanded by default)
	const [templatesRowCollapsed, setTemplatesRowCollapsed] = React.useState(false)

	// Dialog for confirmations
	const dialog = useDialog()

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
	// Container ref for viewport bounds calculation
	const canvasContainerRef = React.useRef<HTMLDivElement | null>(null)

	// Track if we just finished an interaction (resize/rotate/pivot) to prevent canvas click from clearing selection
	const justFinishedInteractionRef = React.useRef(false)

	// Canvas scale for image variant selection
	const [canvasScale, setCanvasScale] = React.useState(1)

	// Viewport bounds in canvas coordinates (for multi-page visibility culling)
	const [viewportBounds, setViewportBounds] = React.useState<Bounds | null>(null)

	// Calculate viewport bounds from canvas context
	const updateViewportBounds = React.useCallback((ctx: SvgCanvasContext) => {
		// Get the canvas container dimensions
		const container = canvasContainerRef.current
		if (!container) return

		const rect = container.getBoundingClientRect()
		// Convert screen corners to canvas coordinates
		const [x1, y1] = ctx.translateTo(0, 0)
		const [x2, y2] = ctx.translateTo(rect.width, rect.height)

		setViewportBounds({
			x: Math.min(x1, x2),
			y: Math.min(y1, y2),
			width: Math.abs(x2 - x1),
			height: Math.abs(y2 - y1)
		})
	}, [])

	const handleCanvasContextReady = React.useCallback(
		(ctx: SvgCanvasContext) => {
			canvasContextRef.current = ctx
			setCanvasScale(ctx.scale)
			updateViewportBounds(ctx)
		},
		[updateViewportBounds]
	)

	// Update viewport bounds on pan/zoom (tracked via context scale changes)
	React.useEffect(() => {
		const ctx = canvasContextRef.current
		if (ctx) {
			updateViewportBounds(ctx)
		}
	}, [canvasScale, updateViewportBounds])

	// Also update viewport bounds on window resize
	React.useEffect(() => {
		const handleResize = () => {
			const ctx = canvasContextRef.current
			if (ctx) {
				updateViewportBounds(ctx)
			}
		}
		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [updateViewportBounds])

	// Multi-page rendering: get all visible views and their objects
	const visibleViews = useVisibleViews(prezillo.doc, viewportBounds)
	const visibleViewIds = React.useMemo(() => visibleViews.map((v) => v.id), [visibleViews])
	const visibleViewObjects = useVisibleViewObjects(prezillo.doc, visibleViewIds)

	// Calculate templates row Y position (above the first view)
	const templatesRowY = React.useMemo(() => {
		if (views.length === 0) return -300
		// Find the topmost view
		const topView = views.reduce((top, v) => (v.y < top.y ? v : top), views[0])
		// Position templates row above the first view with margin
		// Row height: ~180px (thumbnail + labels + padding)
		return topView.y - 220
	}, [views])

	// Determine which objects to render: template prototypes when editing, visible view objects otherwise
	const canvasObjects = React.useMemo(() => {
		if (prezillo.editingTemplateId && templateEditingContext) {
			return templateEditingContext.objects
		}
		// Use visible view objects for multi-page rendering
		return visibleViewObjects
	}, [prezillo.editingTemplateId, templateEditingContext, visibleViewObjects])

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

	// Center on template when entering template edit mode
	React.useEffect(() => {
		if (prezillo.editingTemplateId && templateEditingContext && canvasRef.current) {
			// Template is rendered at (0, 0)
			canvasRef.current.centerOnRect(
				0,
				0,
				templateEditingContext.templateWidth,
				templateEditingContext.templateHeight
			)
		}
	}, [
		prezillo.editingTemplateId,
		templateEditingContext?.templateWidth,
		templateEditingContext?.templateHeight
	])

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

	// Create spatial objects for snapping (active page only - cross-page snapping would be confusing)
	const snapObjects = React.useMemo<SnapSpatialObject[]>(() => {
		// Use activeViewObjects for snapping (only objects on the active page)
		const objectsForSnapping =
			prezillo.editingTemplateId && templateEditingContext
				? templateEditingContext.objects
				: activeViewObjects
		return objectsForSnapping.map((obj) => ({
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
	}, [prezillo.editingTemplateId, templateEditingContext, activeViewObjects])

	// View bounds for snapping (use template dimensions when editing template)
	const viewBounds = React.useMemo(() => {
		if (prezillo.editingTemplateId && templateEditingContext) {
			return {
				x: 0,
				y: 0,
				width: templateEditingContext.templateWidth,
				height: templateEditingContext.templateHeight
			}
		}
		if (!activeView) {
			return { x: 0, y: 0, width: 1920, height: 1080 }
		}
		return {
			x: activeView.x,
			y: activeView.y,
			width: activeView.width,
			height: activeView.height
		}
	}, [activeView, prezillo.editingTemplateId, templateEditingContext])

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
		const stored = prezillo.doc.o.get(id)
		if (!stored) return null

		// Use centralized prototype resolution helper
		const bounds = getResolvedBounds(prezillo.doc, stored)
		if (!bounds) return null

		return {
			id: id as ObjectId,
			bounds: { x: bounds.xy[0], y: bounds.xy[1], width: bounds.wh[0], height: bounds.wh[1] },
			rotation: bounds.r,
			pivotX: bounds.pv[0],
			pivotY: bounds.pv[1]
		}
	}, [prezillo.selectedIds, prezillo.objects])

	// Ref to access latest storedSelection from callbacks (avoids stale closure)
	const storedSelectionRef = React.useRef(storedSelection)
	storedSelectionRef.current = storedSelection

	// Compute aspect ratio for single image/qrcode selection
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
		return undefined
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

		// Auto-switch to object's page if clicking on an object from a different page
		prezillo.autoSwitchToObjectPage(objectId)

		// Single-click to edit: if clicking an already-selected text object, enter edit mode
		const obj = prezillo.doc.o.get(objectId)
		if (!isReadOnly && !addToSelection && prezillo.selectedIds.has(objectId)) {
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

		// Auto-switch to object's page if clicking on an object from a different page
		prezillo.autoSwitchToObjectPage(objectId)

		// Only text objects are editable
		const obj = prezillo.doc.o.get(objectId)
		if (obj?.t === 'T') {
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

		// Check if this is a template instance
		const isInstanceObj = storedObj.proto !== undefined
		const hasLocalText = storedObj.tx !== undefined

		// Get the resolved object (handles prototype inheritance) and text style
		const obj = resolveObject(prezillo.doc, editingTextId)
		if (!obj) {
			setEditingTextId(null)
			return
		}
		const originalText = (obj as any).text ?? ''

		// For instances: empty text means "inherit from prototype" (clear local override)
		// For non-instances or instances with local text that hasn't changed: check if text changed
		if (isInstanceObj && text === '' && !hasLocalText) {
			// Instance was inheriting and user didn't type anything - no change needed
			setEditingTextId(null)
			return
		}

		// Skip update if text hasn't changed
		if (text === originalText) {
			setEditingTextId(null)
			return
		}

		const textStyle = resolveTextStyle(prezillo.doc, storedObj)

		// For height calculation, use new text or prototype text if clearing to inherit
		let displayText = text
		if (isInstanceObj && text === '') {
			// Clearing local text - will inherit from prototype
			const protoObj = prezillo.doc.o.get(storedObj.proto!)
			displayText = protoObj && 'tx' in protoObj ? (protoObj.tx as string) : ''
		}

		// Measure the text height with current width and style
		const measuredHeight = measureTextHeight(displayText, obj.width, textStyle)

		// Use minHeight if set, otherwise use current height as minimum
		const minHeight = (obj as any).minHeight ?? obj.height
		const newHeight = Math.max(measuredHeight, minHeight)

		// Update text content
		// For instances with empty text, clear local override by setting text to undefined
		if (isInstanceObj && text === '') {
			// Clear local text to inherit from prototype
			prezillo.yDoc.transact(() => {
				const currentObj = prezillo.doc.o.get(editingTextId)
				if (currentObj) {
					const updated = { ...currentObj }
					delete (updated as any).tx
					prezillo.doc.o.set(editingTextId, updated)
				}
			}, prezillo.yDoc.clientID)
		} else {
			updateObject(prezillo.yDoc, prezillo.doc, editingTextId, { text } as any)
		}

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

		// Auto-switch to object's page if clicking on an object from a different page
		prezillo.autoSwitchToObjectPage(objectId)

		const obj = prezillo.doc.o.get(objectId)
		if (!obj) return

		// Block drag for locked template instance position
		if (
			isInstance(prezillo.doc, objectId) &&
			isPropertyGroupLocked(prezillo.doc, objectId, 'position')
		) {
			return
		}

		// Use centralized prototype resolution
		const resolvedBounds = getResolvedBounds(prezillo.doc, obj)
		if (!resolvedBounds) return
		const { xy, wh } = resolvedBounds

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
			objectStartX: xy[0],
			objectStartY: xy[1],
			objectWidth: wh[0],
			objectHeight: wh[1]
		}

		// Calculate grab point for snap weighting (normalized 0-1)
		grabPointRef.current = computeGrabPoint(
			{ x: svgPoint.x, y: svgPoint.y },
			{
				x: xy[0],
				y: xy[1],
				width: wh[0],
				height: wh[1],
				rotation: obj.r || 0
			}
		)

		// Track current position for final commit (mutable to avoid stale closure)
		let currentX = xy[0]
		let currentY = xy[1]

		setDragState(initialDragState)

		// Initialize temp state
		setTempObjectState({
			objectId,
			x: xy[0],
			y: xy[1],
			width: wh[0],
			height: wh[1]
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
					// Resolve dimensions from prototype if needed
					let objWh: [number, number] | undefined = obj.wh
					if (!objWh && obj.proto) {
						const proto = prezillo.doc.o.get(obj.proto)
						objWh = proto?.wh
					}
					if (!objWh) return
					const objWidth = objWh[0]
					const objHeight = objWh[1]

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
			// Also clear template selection when clicking canvas background
			if (prezillo.selectedTemplateId) {
				prezillo.clearTemplateSelection()
			}
		}
	}

	// Handle delete
	async function handleDelete() {
		if (isReadOnly) return

		// Check if any selected objects are prototypes with instances
		let totalInstances = 0
		const prototypesToDelete: ObjectId[] = []

		for (const id of prezillo.selectedIds) {
			const instances = getInstancesOfPrototype(prezillo.doc, id)
			if (instances.length > 0) {
				totalInstances += instances.length
				prototypesToDelete.push(id)
			}
		}

		// Show confirmation dialog if deleting prototypes
		if (totalInstances > 0) {
			const confirmed = await dialog.confirm(
				'Delete Prototype Objects?',
				`This will also delete ${totalInstances} instance(s) that depend on these prototypes. Continue?`
			)
			if (!confirmed) return
		}

		// Proceed with deletion
		prezillo.selectedIds.forEach((id) => {
			if (prototypesToDelete.includes(id)) {
				deletePrototypeWithInstances(prezillo.yDoc, prezillo.doc, id, 'delete-instances')
			} else {
				deleteObject(prezillo.yDoc, prezillo.doc, id)
			}
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

		// Template editing mode: create as prototype
		if (prezillo.editingTemplateId) {
			// Create object without page association (prototype)
			const objectId = createObject(
				prezillo.yDoc,
				prezillo.doc,
				prezillo.activeTool as any,
				x,
				y,
				width,
				height,
				undefined, // No parent (template prototypes go to root)
				undefined,
				undefined // No pageId - prototype is not bound to any page
			)

			// Add to template's prototype tracking
			addObjectToTemplate(prezillo.yDoc, prezillo.doc, prezillo.editingTemplateId, objectId)

			prezillo.setActiveTool(null)
			setToolEvent(undefined)
			prezillo.selectObject(objectId)

			// Start editing immediately for text objects
			if (isTextTool) {
				setEditingTextId(objectId)
			}
			return
		}

		// Normal mode: use selected container, or first layer if none selected
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
					// Select all objects (in view or template)
					if (prezillo.activeViewId || prezillo.editingTemplateId) {
						const ids = canvasObjects.map((o) => o.id)
						prezillo.selectObjects(ids)
					}
					evt.preventDefault()
					break
				case 'd':
					// Duplicate selected objects
					if (!isReadOnly && prezillo.selectedIds.size > 0) {
						handleDuplicate()
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

	function handleDuplicate() {
		if (isReadOnly) return
		if (prezillo.selectedIds.size === 0) return

		const newIds: ObjectId[] = []
		prezillo.selectedIds.forEach((id) => {
			const newId = duplicateObject(prezillo.yDoc, prezillo.doc, id, 20, 20)
			if (newId) newIds.push(newId)
		})

		// Select the duplicated objects
		if (newIds.length > 0) {
			prezillo.selectObjects(newIds)
		}
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
	}, [prezillo.selectedIds, prezillo.doc.o, canvasObjects, tempObjectState])

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

			{/* Template editing mode banner */}
			{prezillo.editingTemplateId && (
				<div className="c-template-editing-banner">
					<span className="c-template-editing-banner__text">
						Editing Template:{' '}
						<strong>
							{getTemplate(prezillo.doc, prezillo.editingTemplateId)?.name ??
								'Untitled'}
						</strong>
					</span>
					<span className="c-template-editing-banner__hint">
						Objects created here will appear on all pages using this template
					</span>
					<button
						type="button"
						className="c-button primary small"
						onClick={prezillo.stopEditingTemplate}
					>
						Done Editing
					</button>
				</div>
			)}

			<div className="c-hbox flex-fill" style={{ overflow: 'hidden' }}>
				<div
					ref={canvasContainerRef}
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
						{/* Render views or template canvas based on mode */}
						{!prezillo.editingTemplateId ? (
							<>
								{/* Templates row (above views) */}
								{templatesWithUsage.length > 0 && !isMobile && (
									<TemplatesRow
										doc={prezillo.doc}
										yDoc={prezillo.yDoc}
										templates={templatesWithUsage}
										selectedTemplateId={prezillo.selectedTemplateId}
										editingTemplateId={prezillo.editingTemplateId}
										onSelectTemplate={prezillo.selectTemplate}
										onEditTemplate={prezillo.startEditingTemplate}
										rowY={templatesRowY}
										collapsed={templatesRowCollapsed}
										onToggleCollapse={() => setTemplatesRowCollapsed((c) => !c)}
										readOnly={isReadOnly}
										getTemplateObjects={getTemplateObjects}
									/>
								)}

								{/* Normal mode: Render all views as frames */}
								{views.map((view) => (
									<ViewFrame
										key={view.id}
										view={view}
										isActive={view.id === prezillo.activeViewId}
										isSelected={
											prezillo.isViewFocused &&
											view.id === prezillo.activeViewId
										}
										onClick={() => prezillo.selectView(view.id)}
									/>
								))}

								{/* Template guides for current view */}
								{activeView && templateGuides.hasTemplateGuides && (
									<TemplateGuideRenderer
										view={activeView}
										guides={templateGuides.guides}
										visible={templateGuides.visible}
									/>
								)}
							</>
						) : (
							/* Template editing mode: Render virtual template canvas */
							templateEditingContext &&
							(() => {
								const gradient = templateEditingContext.backgroundGradient
								const hasGradient =
									gradient &&
									gradient.type !== 'solid' &&
									gradient.stops?.length >= 2
								const gradientId = 'template-bg-gradient'

								// Generate gradient definition
								const gradientDef = hasGradient
									? gradient.type === 'linear'
										? {
												type: 'linear' as const,
												def: createLinearGradientDef(
													gradient.angle ?? 180,
													gradient.stops
												)
											}
										: gradient.type === 'radial'
											? {
													type: 'radial' as const,
													def: createRadialGradientDef(
														gradient.centerX ?? 0.5,
														gradient.centerY ?? 0.5,
														gradient.stops
													)
												}
											: null
									: null

								const fill = hasGradient
									? `url(#${gradientId})`
									: (templateEditingContext.backgroundColor ?? '#ffffff')

								return (
									<g>
										{/* Gradient definition */}
										{gradientDef && (
											<defs>
												{gradientDef.type === 'linear' ? (
													<linearGradient
														id={gradientId}
														x1={gradientDef.def.x1}
														y1={gradientDef.def.y1}
														x2={gradientDef.def.x2}
														y2={gradientDef.def.y2}
													>
														{gradientDef.def.stops.map((stop, i) => (
															<stop
																key={i}
																offset={stop.offset}
																stopColor={stop.stopColor}
															/>
														))}
													</linearGradient>
												) : (
													<radialGradient
														id={gradientId}
														cx={gradientDef.def.cx}
														cy={gradientDef.def.cy}
														r={gradientDef.def.r}
													>
														{gradientDef.def.stops.map((stop, i) => (
															<stop
																key={i}
																offset={stop.offset}
																stopColor={stop.stopColor}
															/>
														))}
													</radialGradient>
												)}
											</defs>
										)}
										<rect
											x={0}
											y={0}
											width={templateEditingContext.templateWidth}
											height={templateEditingContext.templateHeight}
											fill={fill}
											className="c-template-editing-canvas"
										/>
									</g>
								)
							})()
						)}

						{/* Render objects (view objects or template prototypes) */}
						{canvasObjects.map((object) => {
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
								// For template instances, get prototype text for placeholder
								let prototypeText: string | undefined
								let hasLocalText = true
								if (storedObj?.proto) {
									const protoObj = prezillo.doc.o.get(storedObj.proto)
									if (protoObj && 'tx' in protoObj) {
										prototypeText = protoObj.tx as string
									}
									// Instance has local text if tx is explicitly defined
									hasLocalText = 'tx' in storedObj && storedObj.tx !== undefined
								}

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
										prototypeText={prototypeText}
										hasLocalText={hasLocalText}
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
								const obj = canvasObjects.find(
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
						isViewFocused={prezillo.isViewFocused}
						onPreview={setPropertyPreview}
						selectedContainerId={selectedContainerId as any}
						onSelectContainer={setSelectedContainerId as any}
						onStartEditingTemplate={prezillo.startEditingTemplate}
						selectedTemplateId={prezillo.selectedTemplateId}
						onClearTemplateSelection={prezillo.clearTemplateSelection}
						onSelectTemplate={prezillo.selectTemplate}
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
					isViewFocused={prezillo.isViewFocused}
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

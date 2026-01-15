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
	calculateArcRadius,
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
import '@cloudillo/fonts/fonts.css'
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
	useTemplates,
	useTextEditing,
	useTextStyling,
	usePresentationMode,
	useViewNavigation,
	useObjectDrag,
	useTableGridSnaps,
	type TempObjectState
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
import { TemplateFrame } from './components/TemplateFrame'
import { ContextMenu } from './components/ContextMenu'
import { RemotePresenceOverlay } from './components/RemotePresenceOverlay'
import { ZoneDivider } from './components/ZoneDivider'
import { TemplateZoneEmptyState } from './components/TemplateZoneEmptyState'
import { useTemplateLayout } from './hooks/useTemplateLayout'
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
	DialogContainer,
	type BottomSheetSnapPoint
} from '@cloudillo/react'

import type {
	ObjectId,
	ViewId,
	TemplateId,
	PrezilloObject,
	TableGridObject,
	ViewNode,
	Bounds,
	YPrezilloDocument
} from './crdt'

/**
 * Extended type for canvas objects that may include template metadata
 * Used when rendering prototype objects on template frames
 */
type CanvasObject = PrezilloObject & {
	/** Template ID if this is a prototype rendered on a template frame */
	_templateId?: TemplateId
	/** True if this is a prototype object (not a regular view object) */
	_isPrototype?: boolean
}
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
	getTemplateIdForPrototype,
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
	duplicateObject,
	duplicateView,
	deleteView,
	getViewsUsingTemplate,
	createTemplate,
	// Stacked object queries for sticky movement
	getStackedObjects,
	// Document consistency/maintenance
	checkDocumentConsistency,
	fixDocumentIssues
} from './crdt'

import type { DocumentConsistencyReport } from './crdt'
import { downloadPDF } from './export'
import { measureTextHeight } from './utils'

//////////////
// Main App //
//////////////
export function PrezilloApp() {
	const prezillo = usePrezilloDocument()
	// Debug helper - access via window.prezillo in browser console
	;(window as any).prezillo = prezillo
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

	// Templates for the templates row
	const { templates: templatesWithUsage, getTemplateObjects } = useTemplates(prezillo.doc)

	// Dialog for confirmations
	const dialog = useDialog()

	const [toolEvent, setToolEvent] = React.useState<ToolEvent | undefined>()

	// Toast for notifications
	const { toast } = useToast()

	// Presentation mode (extracted hook)
	const {
		isPresentationMode,
		isFullscreenFollowing,
		followedPresenter,
		handleStartPresenting,
		handleStopPresenting,
		handleExitFullscreenFollowing
	} = usePresentationMode({
		activePresenters: prezillo.activePresenters,
		followingClientId: prezillo.followingClientId,
		localClientId: prezillo.awareness?.clientID,
		startPresenting: prezillo.startPresenting,
		stopPresenting: prezillo.stopPresenting,
		followPresenter: prezillo.followPresenter,
		unfollowPresenter: prezillo.unfollowPresenter,
		toast
	})

	// Mobile detection
	const isMobile = useIsMobile()

	// Properties panel visibility (desktop)
	const [isPanelVisible, setIsPanelVisible] = React.useState(true)

	// PDF export state
	const [isExportingPDF, setIsExportingPDF] = React.useState(false)

	// Mobile bottom sheet state
	const [mobileSnapPoint, setMobileSnapPoint] = React.useState<BottomSheetSnapPoint>('closed')
	const userCollapsedRef = React.useRef(false)

	// Text editing (extracted hook)
	const {
		editingTextId,
		setEditingTextId,
		editingTextRef,
		selectedTextObject,
		selectedTextStyle,
		handleTextEditSave,
		handleTextEditCancel
	} = useTextEditing({
		yDoc: prezillo.yDoc,
		doc: prezillo.doc,
		selectedIds: prezillo.selectedIds
	})

	// Text styling (extracted hook)
	const {
		handleTextAlignChange,
		handleVerticalAlignChange,
		handleFontSizeChange,
		handleBoldToggle,
		handleItalicToggle,
		handleUnderlineToggle
	} = useTextStyling({
		yDoc: prezillo.yDoc,
		doc: prezillo.doc,
		selectedTextObject,
		selectedTextStyle
	})

	// Hover state - which object is being hovered (only active when nothing selected)
	const [hoveredObjectId, setHoveredObjectId] = React.useState<ObjectId | null>(null)

	// Calculate stacked objects for hover or selection (for sticky movement visual feedback)
	React.useEffect(() => {
		const allStacked = new Set<ObjectId>()

		// If hovering (and nothing selected), show stacked for hovered object
		if (hoveredObjectId && prezillo.selectedIds.size === 0) {
			const stackedIds = getStackedObjects(prezillo.doc, hoveredObjectId)
			stackedIds.forEach((id) => allStacked.add(id))
		}

		// If objects are selected, show stacked for all selected objects
		if (prezillo.selectedIds.size > 0) {
			for (const selectedId of prezillo.selectedIds) {
				const stackedIds = getStackedObjects(prezillo.doc, selectedId)
				stackedIds.forEach((id) => allStacked.add(id))
			}
		}

		prezillo.setStackedHighlightIds(allStacked)
	}, [hoveredObjectId, prezillo.selectedIds, prezillo.doc])

	// Property preview state for live feedback during property scrubbing (doesn't persist)
	const [propertyPreview, setPropertyPreview] = React.useState<PropertyPreview | null>(null)

	// Selected container (layer) for creating objects inside
	const [selectedContainerId, setSelectedContainerId] = React.useState<string | null>(null)

	// Context menu state for object actions (Duplicate/Delete)
	const [objectMenu, setObjectMenu] = React.useState<{ x: number; y: number } | null>(null)

	// Temporary object state during drag/resize/rotate (local visual only, not persisted)
	const [tempObjectState, setTempObjectState] = React.useState<TempObjectState | null>(null)

	// Track grab point for snap weighting
	const grabPointRef = React.useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 })

	// Store SvgCanvas context for coordinate transformations (zoom-aware)
	const canvasContextRef = React.useRef<SvgCanvasContext | null>(null)
	const canvasRef = React.useRef<SvgCanvasHandle | null>(null)
	// Container ref for viewport bounds calculation
	const canvasContainerRef = React.useRef<HTMLDivElement | null>(null)
	// Ref for context menu (to check if click is inside)
	const objectMenuRef = React.useRef<HTMLDivElement | null>(null)

	// Track if we just finished an interaction (resize/rotate/pivot) to prevent canvas click from clearing selection
	const justFinishedInteractionRef = React.useRef(false)

	// Track if page zoom was triggered from ViewPicker (explicit navigation should always zoom)
	const forceZoomRef = React.useRef(false)

	// Track if template zoom was triggered from explicit selection
	const forceZoomTemplateRef = React.useRef(false)

	// View navigation (extracted hook)
	const {
		handlePrevView,
		handleNextView,
		handleAddView,
		handleDuplicate,
		handleReorderView,
		handleDuplicateView,
		handleDeleteView
	} = useViewNavigation({
		yDoc: prezillo.yDoc,
		doc: prezillo.doc,
		activeViewId: prezillo.activeViewId,
		setActiveViewId: prezillo.setActiveViewId,
		selectedIds: prezillo.selectedIds,
		selectObjects: prezillo.selectObjects,
		viewsLength: views.length,
		isReadOnly,
		forceZoomRef
	})

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

	// Calculate template frame positions (above the views)
	const templateLayoutResult = useTemplateLayout(views, templatesWithUsage)
	const {
		layouts: templateLayouts,
		dividerY,
		viewBounds: templateZoneBounds,
		emptyStatePosition
	} = templateLayoutResult

	// Compute which views are highlighted when a template is selected
	const highlightedViewIds = React.useMemo(() => {
		if (!prezillo.selectedTemplateId) return new Set<ViewId>()
		return new Set(getViewsUsingTemplate(prezillo.doc, prezillo.selectedTemplateId))
	}, [prezillo.selectedTemplateId, prezillo.doc])

	// Render view objects AND template prototype objects (offset to template positions)
	const canvasObjects: CanvasObject[] = React.useMemo(() => {
		// Start with view objects
		const objects: CanvasObject[] = [...visibleViewObjects]
		const seenIds = new Set(objects.map((o) => o.id))

		// Add prototype objects from each template, offset to template position
		for (const template of templatesWithUsage) {
			const layout = templateLayouts.get(template.id)
			if (!layout) continue

			const prototypeObjects = getTemplateObjects(template.id)
			for (const proto of prototypeObjects) {
				// Skip if already in canvasObjects (avoid duplicate keys)
				if (seenIds.has(proto.id)) continue
				seenIds.add(proto.id)

				objects.push({
					...proto,
					// Offset to template frame position on canvas
					x: proto.x + layout.x,
					y: proto.y + layout.y,
					// Track which template this belongs to for click handling and offset conversion
					_templateId: template.id,
					_isPrototype: true
				})
			}
		}

		return objects
	}, [visibleViewObjects, templatesWithUsage, templateLayouts, getTemplateObjects])

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
			// If we're on a template page, convert to template-relative coords and add to template
			if (prezillo.selectedTemplateId) {
				const layout = templateLayouts.get(prezillo.selectedTemplateId)
				if (layout) {
					// Get current object position and convert to template-relative
					const obj = prezillo.doc.o.get(id)
					if (obj?.xy) {
						const relX = obj.xy[0] - layout.x
						const relY = obj.xy[1] - layout.y
						updateObjectPosition(prezillo.yDoc, prezillo.doc, id, relX, relY)
					}
				}
				addObjectToTemplate(prezillo.yDoc, prezillo.doc, prezillo.selectedTemplateId, id)
			}
			// selectObject automatically handles template/page selection
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
		if (prezillo.activeTool === 'image' && !imageHandler.isInserting) {
			// If on a template page, use template frame center
			if (prezillo.selectedTemplateId) {
				const layout = templateLayouts.get(prezillo.selectedTemplateId)
				if (layout) {
					const centerX = layout.x + layout.width / 2
					const centerY = layout.y + layout.height / 2
					imageHandler.insertImage(centerX, centerY)
					return
				}
			}
			// Otherwise use active view center
			if (activeView) {
				const centerX = activeView.x + activeView.width / 2
				const centerY = activeView.y + activeView.height / 2
				imageHandler.insertImage(centerX, centerY)
			}
		}
	}, [
		prezillo.activeTool,
		activeView,
		prezillo.selectedTemplateId,
		templateLayouts,
		imageHandler
	])

	// Center on active view when it changes (smart zoom - only if page is off-screen or explicit navigation)
	React.useEffect(() => {
		if (activeView && canvasRef.current) {
			const isInView = canvasRef.current.isRectInView(
				activeView.x,
				activeView.y,
				activeView.width,
				activeView.height
			)

			// Zoom if: explicit navigation (ViewPicker click) OR page center is off-screen
			const shouldZoom = forceZoomRef.current || !isInView
			forceZoomRef.current = false // Reset flag

			if (shouldZoom) {
				canvasRef.current.centerOnRectAnimated(
					activeView.x,
					activeView.y,
					activeView.width,
					activeView.height,
					{ duration: 350, zoomOutFactor: 0.15 }
				)
			}
		}
	}, [prezillo.activeViewId])

	// Center on selected template (template frames above views)
	React.useEffect(() => {
		if (!prezillo.selectedTemplateId || !canvasRef.current) return

		const layout = templateLayouts.get(prezillo.selectedTemplateId)
		if (!layout) return

		const isInView = canvasRef.current.isRectInView(
			layout.x,
			layout.y,
			layout.width,
			layout.height
		)

		// Zoom if: explicit selection OR template center is off-screen
		const shouldZoom = forceZoomTemplateRef.current || !isInView
		forceZoomTemplateRef.current = false

		if (shouldZoom) {
			canvasRef.current.centerOnRectAnimated(
				layout.x,
				layout.y,
				layout.width,
				layout.height,
				{ duration: 350, zoomOutFactor: 0.15 }
			)
		}
	}, [prezillo.selectedTemplateId, templateLayouts])

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

	// Close object context menu on click outside or Escape key
	React.useEffect(() => {
		if (!objectMenu) return
		const handlePointerDown = (e: PointerEvent) => {
			// Don't close if clicking inside the menu
			if (objectMenuRef.current?.contains(e.target as Node)) return
			// Close menu and consume the click (don't let it select another object)
			e.stopPropagation()
			e.preventDefault()
			setObjectMenu(null)
		}
		const handleContextMenu = (e: MouseEvent) => {
			// Prevent new context menu from opening while closing this one
			if (objectMenuRef.current?.contains(e.target as Node)) return
			e.stopPropagation()
			e.preventDefault()
			setObjectMenu(null)
		}
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setObjectMenu(null)
		}
		// Use capture phase to catch events before they reach other elements
		// pointerdown is what triggers selection in ObjectShape
		document.addEventListener('pointerdown', handlePointerDown, true)
		document.addEventListener('contextmenu', handleContextMenu, true)
		document.addEventListener('keydown', handleKeyDown)
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown, true)
			document.removeEventListener('contextmenu', handleContextMenu, true)
			document.removeEventListener('keydown', handleKeyDown)
		}
	}, [objectMenu])

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
		return activeViewObjects.map((obj) => ({
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
	}, [activeViewObjects])

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

	// Filter table grid objects for snap target generation
	const tableGridObjects = React.useMemo<TableGridObject[]>(() => {
		return activeViewObjects.filter((obj): obj is TableGridObject => obj.type === 'tablegrid')
	}, [activeViewObjects])

	// Generate snap targets from table grid cells (edges + centers)
	const { targets: tableGridSnapTargets } = useTableGridSnaps(tableGridObjects)

	// Initialize snapping hook
	const { snapDrag, snapResize, activeSnaps, activeSnapEdges, allCandidates, clearSnaps } =
		useSnapping({
			objects: snapObjects,
			config: snapConfig,
			viewBounds,
			getParent,
			customTargets: tableGridSnapTargets
		})

	// Use refs to always get latest snap functions (avoids stale closure in drag/resize handlers)
	const snapDragRef = React.useRef(snapDrag)
	snapDragRef.current = snapDrag
	const snapResizeRef = React.useRef(snapResize)
	snapResizeRef.current = snapResize

	// Object drag hook
	const { dragState, setDragState, handleObjectPointerDown } = useObjectDrag({
		yDoc: prezillo.yDoc,
		doc: prezillo.doc,
		isReadOnly,
		activeTool: prezillo.activeTool,
		selectedIds: prezillo.selectedIds,
		selectObject: prezillo.selectObject,
		autoSwitchToObjectPage: prezillo.autoSwitchToObjectPage,
		canvasObjects,
		canvasContextRef,
		templateLayouts,
		awareness: prezillo.awareness,
		snapDragRef,
		clearSnaps,
		grabPointRef,
		justFinishedInteractionRef,
		setTempObjectState
	})

	// Ref to capture initial selection state at interaction start (prevents stale closure issues)
	const interactionStartRef = React.useRef<{
		id: ObjectId
		bounds: { x: number; y: number; width: number; height: number }
		rotation: number
		pivotX: number
		pivotY: number
		// Offsets for converting canvas coords back to stored coords when saving
		pageOffset?: { x: number; y: number }
		prototypeTemplateOffset?: { x: number; y: number }
	} | null>(null)

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

	// Handle object click
	function handleObjectClick(e: React.MouseEvent, objectId: ObjectId) {
		e.stopPropagation()
		const addToSelection = e.shiftKey || e.ctrlKey || e.metaKey

		// Single-click to edit: if clicking an already-selected text object, enter edit mode
		const obj = prezillo.doc.o.get(objectId)
		if (!isReadOnly && !addToSelection && prezillo.selectedIds.has(objectId)) {
			if (obj?.t === 'T') {
				setEditingTextId(objectId)
				return
			}
		}

		// selectObject automatically handles template/page selection based on the object
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

	// Handle canvas click (deselect)
	function handleCanvasClick(e: React.MouseEvent) {
		// Skip if click originated from inside the SVG (e.g., pivot handle, rotation handle)
		// These clicks should be handled by their own handlers, not trigger deselection
		const target = e.target as HTMLElement
		if (target.tagName === 'circle' || target.tagName === 'line' || target.tagName === 'path') {
			return
		}
		// Skip if we just finished a resize/rotate/pivot interaction or object selection
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
		console.log('[handleDelete] called, selectedIds:', [...prezillo.selectedIds])
		if (isReadOnly) return

		// Check if any selected objects are prototypes (in a template's tpo array)
		let totalInstances = 0
		const prototypesToDelete: ObjectId[] = []

		for (const id of prezillo.selectedIds) {
			// Check if this object is a prototype (belongs to a template)
			const templateId = getTemplateIdForPrototype(prezillo.doc, id)
			console.log('[handleDelete] checking id:', id, 'templateId:', templateId)
			if (templateId) {
				// It's a prototype - count its instances
				const instances = getInstancesOfPrototype(prezillo.doc, id)
				totalInstances += instances.length
				prototypesToDelete.push(id)
			}
		}

		console.log(
			'[handleDelete] prototypesToDelete:',
			prototypesToDelete,
			'totalInstances:',
			totalInstances
		)

		// Show confirmation dialog if deleting prototypes with instances
		if (totalInstances > 0) {
			console.log('[handleDelete] showing dialog for prototypes with instances')
			const confirmed = await dialog.confirm(
				'Delete Prototype Objects?',
				`This will also delete ${totalInstances} instance(s) that depend on these prototypes. Continue?`
			)
			if (!confirmed) return
		} else if (prototypesToDelete.length > 0) {
			// Prototypes without instances - still confirm
			console.log('[handleDelete] showing dialog for prototypes without instances')
			const confirmed = await dialog.confirm(
				'Delete Prototype Objects?',
				'Delete these prototype objects from the template?'
			)
			if (!confirmed) return
		}

		console.log('[handleDelete] proceeding with deletion')
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

	// Handle document consistency check
	async function handleCheckDocument() {
		const report = checkDocumentConsistency(prezillo.doc)

		if (report.summary.total === 0) {
			await dialog.tell('Document Check', 'No issues found. The document is consistent.')
			return
		}

		// Build summary message
		const lines: string[] = [`Found ${report.summary.total} issue(s):`]
		if (report.summary.orphanedInstances > 0) {
			lines.push(
				`• ${report.summary.orphanedInstances} orphaned instance(s) (missing prototype)`
			)
		}
		if (report.summary.orphanedChildRefs > 0) {
			lines.push(`• ${report.summary.orphanedChildRefs} orphaned child reference(s)`)
		}
		if (report.summary.missingViewRefs > 0) {
			lines.push(`• ${report.summary.missingViewRefs} invalid view reference(s)`)
		}
		lines.push('')
		lines.push('Would you like to fix these issues?')

		const confirmed = await dialog.confirm('Document Check', lines.join('\n'))
		if (confirmed) {
			const result = fixDocumentIssues(prezillo.yDoc, prezillo.doc, report)
			await dialog.tell('Document Fixed', `Fixed ${result.fixed} issue(s).`)
		}
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

	// Find template at canvas point (for direct template editing)
	function findTemplateAtPoint(canvasX: number, canvasY: number): TemplateId | null {
		for (const [templateId, layout] of templateLayouts) {
			if (
				canvasX >= layout.x &&
				canvasX <= layout.x + layout.width &&
				canvasY >= layout.y &&
				canvasY <= layout.y + layout.height
			) {
				return templateId
			}
		}
		return null
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

		// Check if creating on a template frame (direct template editing)
		const templateAtPoint = findTemplateAtPoint(toolEvent.startX, toolEvent.startY)
		if (templateAtPoint) {
			// Convert to template-relative coordinates
			const layout = templateLayouts.get(templateAtPoint)!
			const relX = x - layout.x
			const relY = y - layout.y

			// Create object without page association (prototype)
			const objectId = createObject(
				prezillo.yDoc,
				prezillo.doc,
				prezillo.activeTool as any,
				relX,
				relY,
				width,
				height,
				undefined, // No parent (template prototypes go to root)
				undefined,
				undefined // No pageId - prototype is not bound to any page
			)

			// Add to template's prototype tracking
			addObjectToTemplate(prezillo.yDoc, prezillo.doc, templateAtPoint, objectId)

			prezillo.setActiveTool(null)
			setToolEvent(undefined)
			// selectObject automatically handles template/page selection
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
		const hasModifier = evt.ctrlKey || evt.metaKey
		// Allow modifier key combinations from any element (Ctrl+D, Ctrl+Z, etc.)
		// but block regular keys (Delete, Escape) when focus is on child elements
		if (!hasModifier && evt.target !== evt.currentTarget) return

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
					// Select all objects in the active view
					if (prezillo.activeViewId) {
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

	// Handle context menu on canvas or object
	// If objectId is provided, select that object first (standard UX: right-click selects)
	function handleObjectContextMenu(evt: React.MouseEvent, objectId?: ObjectId) {
		evt.preventDefault()
		evt.stopPropagation() // Prevent canvas handler from firing
		if (isReadOnly) return

		// If clicking on an object, select it first (unless already in selection)
		if (objectId) {
			if (!prezillo.isSelected(objectId)) {
				// Object not selected - select it (replacing current selection)
				// Use Shift to add to selection instead
				const addToSelection = evt.shiftKey || evt.ctrlKey || evt.metaKey
				prezillo.selectObject(objectId, addToSelection)
			}
			// If already selected, keep current selection (might be multi-select)
		}

		// Only show menu if we have a selection now
		if (objectId || prezillo.selectedIds.size > 0) {
			setObjectMenu({ x: evt.clientX, y: evt.clientY })
		}
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
					// Check if this is a prototype object on a template frame
					const canvasObj = canvasObjects.find((o) => o.id === id)
					let offsetX = 0
					let offsetY = 0
					if (canvasObj?._isPrototype && canvasObj._templateId) {
						const layout = templateLayouts.get(canvasObj._templateId)
						if (layout) {
							offsetX = layout.x
							offsetY = layout.y
						}
					}

					minX = Math.min(minX, bounds.x + offsetX)
					minY = Math.min(minY, bounds.y + offsetY)
					maxX = Math.max(maxX, bounds.x + bounds.width + offsetX)
					maxY = Math.max(maxY, bounds.y + bounds.height + offsetY)
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
	}, [prezillo.selectedIds, prezillo.doc.o, canvasObjects, tempObjectState, templateLayouts])

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
					onDuplicate={handleDuplicate}
					canUndo={prezillo.canUndo}
					canRedo={prezillo.canRedo}
					onUndo={prezillo.undo}
					onRedo={prezillo.redo}
					onExport={() => {
						if (prezillo.yDoc && prezillo.doc) {
							downloadExport(prezillo.yDoc, prezillo.doc)
						}
					}}
					onExportPDF={async () => {
						if (prezillo.doc && views.length > 0) {
							setIsExportingPDF(true)
							try {
								await downloadPDF(prezillo.doc, views, prezillo.cloudillo.idTag)
							} catch (error) {
								console.error('PDF export failed:', error)
							} finally {
								setIsExportingPDF(false)
							}
						}
					}}
					isExportingPDF={isExportingPDF}
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
					onCheckDocument={handleCheckDocument}
				/>
			)}

			<div className="c-hbox flex-fill" style={{ overflow: 'hidden' }}>
				<div
					ref={canvasContainerRef}
					className="c-panel flex-fill"
					tabIndex={0}
					onKeyDown={handleKeyDown}
					onClick={handleCanvasClick}
					onContextMenu={handleObjectContextMenu}
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
											onPivotDragStart={(e) => {
												// Set flag immediately to prevent canvas click from clearing selection
												justFinishedInteractionRef.current = true
												hookPivotDragStart(e)
											}}
											isDragging={pivotState.isDragging}
											snapEnabled={snapSettings.settings.snapToObjects}
											snappedPoint={pivotState.snappedPoint}
										/>
									</>
								)}
							</>
						}
					>
						{/* Template zone: either empty state or template frames + divider */}
						{templatesWithUsage.length === 0 ? (
							/* Empty state when no templates */
							emptyStatePosition && (
								<TemplateZoneEmptyState
									x={emptyStatePosition.x}
									y={emptyStatePosition.y}
									width={emptyStatePosition.width}
									readOnly={isReadOnly}
									onCreateTemplate={() => {
										// Create a default template
										if (!isReadOnly) {
											const templateId = createTemplate(
												prezillo.yDoc,
												prezillo.doc,
												{
													name: 'Template 1',
													width: 1920,
													height: 1080,
													backgroundColor: '#ffffff'
												}
											)
											prezillo.selectTemplate(templateId)
										}
									}}
								/>
							)
						) : (
							/* Template frames (full-size, above views) */
							<>
								{templatesWithUsage.map((template) => {
									const layout = templateLayouts.get(template.id)
									if (!layout) return null
									return (
										<TemplateFrame
											key={template.id}
											template={template}
											layout={layout}
											isSelected={prezillo.selectedTemplateId === template.id}
											isEditing={false}
											onClick={(e) => {
												e.stopPropagation()
												prezillo.selectTemplate(template.id)
											}}
											onDoubleClick={(e) => {
												// Double-click just selects the template
												e.stopPropagation()
												prezillo.selectTemplate(template.id)
											}}
											readOnly={isReadOnly}
										/>
									)
								})}

								{/* Zone divider between templates and views */}
								{dividerY !== null && templateZoneBounds && (
									<ZoneDivider
										y={dividerY}
										leftX={templateZoneBounds.left}
										rightX={templateZoneBounds.right}
									/>
								)}
							</>
						)}

						{/* Render all views as frames */}
						{views.map((view) => (
							<ViewFrame
								key={view.id}
								view={view}
								isActive={view.id === prezillo.activeViewId}
								isSelected={
									prezillo.isViewFocused && view.id === prezillo.activeViewId
								}
								isHighlightedByTemplate={highlightedViewIds.has(view.id)}
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
							// Also check if this object is a stacked object being dragged with the primary
							const objectTempBounds =
								tempObjectState?.objectId === object.id
									? tempObjectState
									: tempObjectState?.stackedObjects?.find(
											(so) => so.objectId === object.id
										)

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
									isStackedHighlight={prezillo.stackedHighlightIds.has(
										object.id as ObjectId
									)}
									onClick={(e) => handleObjectClick(e, object.id)}
									onDoubleClick={(e) => handleObjectDoubleClick(e, object.id)}
									onContextMenu={(e) => handleObjectContextMenu(e, object.id)}
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
						<RemotePresenceOverlay
							remotePresence={prezillo.remotePresence}
							canvasObjects={canvasObjects}
						/>

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
						// Explicit ViewPicker navigation should always zoom to the page
						forceZoomRef.current = true
						prezillo.setActiveViewId(id)
						// Clear template selection when selecting a page
						prezillo.clearTemplateSelection()
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
					templates={templatesWithUsage}
					selectedTemplateId={prezillo.selectedTemplateId}
					onTemplateSelect={(id) => {
						// Explicit template selection should always zoom
						forceZoomTemplateRef.current = true
						prezillo.selectTemplate(id)
					}}
					onDuplicateView={handleDuplicateView}
					onDeleteView={handleDeleteView}
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
					awareness={prezillo.awareness}
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
					awareness={prezillo.awareness}
				/>
			)}

			{/* Object context menu */}
			{objectMenu && (
				<ContextMenu
					menuRef={objectMenuRef}
					position={objectMenu}
					onClose={() => setObjectMenu(null)}
					onDuplicate={handleDuplicate}
					onDelete={handleDelete}
					selectedIds={prezillo.selectedIds}
					doc={prezillo.doc}
					yDoc={prezillo.yDoc}
				/>
			)}

			{/* Toast container for notifications */}
			<ToastContainer position="top-right" />
			{/* Dialog container for confirmation dialogs */}
			<DialogContainer />
		</>
	)
}

// vim: ts=4

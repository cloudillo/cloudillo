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
	useSnapping,
	type SnapSpatialObject,
	type SvgCanvasContext,
	type SvgCanvasHandle
} from 'react-svg-canvas'

import {
	FixedSnapGuides,
	FixedSelectionBox,
	FixedRotationHandle,
	FixedPivotHandle,
	FixedTextEditHandle
} from './components/FixedLayerWrappers'

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
import { useCanvasViewport } from './hooks/useCanvasViewport'
import { useInteractionHooks } from './hooks/useInteractionHooks'
import { useToolHandlers } from './hooks/useToolHandlers'
import { useCanvasEventHandlers } from './hooks/useCanvasEventHandlers'
import { useViewObjects, useVisibleViewObjects } from './hooks/useViewObjects'
import { useVisibleViews } from './hooks/useVisibleViews'
import { useViews } from './hooks/useViews'
import { Toolbar } from './components/Toolbar'
import { ViewPicker } from './components/ViewPicker'
import { ViewFrame } from './components/ViewFrame'
import { RichTextEditor } from '@cloudillo/canvas-text'
import { getBulletIcon, migrateBullet } from './data/bullet-icons'
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

import type { ObjectId, ViewId, TemplateId, PrezilloObject, TableGridObject } from './crdt'

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
	updateObjectPosition,
	updateObjectRotation,
	getView,
	getAbsoluteBounds,
	resolveShapeStyle,
	resolveTextStyle,
	bringToFront,
	bringForward,
	sendBackward,
	sendToBack,
	downloadExport,
	addObjectToTemplate,
	getViewsUsingTemplate,
	createTemplate,
	getStackedObjects
} from './crdt'

import { downloadPDF } from './export'

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
	} = usePresentationMode({ prezillo, toast })

	// Mobile detection
	const isMobile = useIsMobile()

	// Properties panel visibility (desktop)
	const [isPanelVisible, setIsPanelVisible] = React.useState(true)

	// PDF export state
	const [isExportingPDF, setIsExportingPDF] = React.useState(false)

	// Symbol picker state
	const [selectedSymbolId, setSelectedSymbolId] = React.useState<string | null>(null)

	// Mobile bottom sheet state
	const [mobileSnapPoint, setMobileSnapPoint] = React.useState<BottomSheetSnapPoint>('closed')
	const userCollapsedRef = React.useRef(false)

	// Ref to track when handle bar drag is initiated (prevents blur from closing editor)
	const isDraggingFromHandleRef = React.useRef(false)
	// Ref to track when properties panel is clicked (prevents blur from closing editor)
	const isPanelClickRef = React.useRef(false)

	// Text editing (extracted hook)
	const {
		editingTextId,
		setEditingTextId,
		quillRef,
		selectedTextObject,
		selectedTextStyle,
		handleTextEditSave,
		handleTextEditCancel
	} = useTextEditing({ prezillo })

	// Wrap handleTextEditSave to set justFinishedInteractionRef
	// This prevents canvas click from clearing selection after text edit blur
	const handleTextEditSaveWithFlag = React.useCallback(() => {
		if (editingTextId) {
			justFinishedInteractionRef.current = true
		}
		handleTextEditSave()
	}, [editingTextId, handleTextEditSave])

	// Close text editing on click outside editor
	// For middle-click: also prevents X11 paste on Linux
	// For left-click: ensures proper close before blur event
	React.useEffect(() => {
		if (!editingTextId) return
		const handleClickOutside = (e: PointerEvent) => {
			const target = e.target as Element

			// Don't close when clicking on the text edit handle bar (for dragging)
			if (target.getAttribute?.('data-text-edit-handle') === 'true') return

			// Don't close when clicking inside the editor (Quill uses contenteditable div, not textarea)
			if (target.closest?.('[data-rich-text-editor]')) return

			// Don't close when clicking inside the properties panel (for inline formatting buttons)
			if (target.closest?.('[data-properties-panel]')) {
				// Set flag so the Quill blur handler also ignores this blur
				isPanelClickRef.current = true
				requestAnimationFrame(() => {
					isPanelClickRef.current = false
				})
				return
			}

			// Prevent middle-click paste on Linux
			if (e.button === 1) e.preventDefault()

			handleTextEditSaveWithFlag()
		}
		// Use capture phase to catch event before blur fires
		document.addEventListener('pointerdown', handleClickOutside, true)
		return () => document.removeEventListener('pointerdown', handleClickOutside, true)
	}, [editingTextId, handleTextEditSaveWithFlag])

	// Text styling (extracted hook)
	const {
		handleTextAlignChange,
		handleVerticalAlignChange,
		handleFontSizeChange,
		handleBoldToggle,
		handleItalicToggle,
		handleUnderlineToggle
	} = useTextStyling({ prezillo, selectedTextObject, selectedTextStyle })

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
	} = useViewNavigation({ prezillo, viewsLength: views.length, isReadOnly, forceZoomRef })

	// Calculate template frame positions (above the views)
	const templateLayoutResult = useTemplateLayout(views, templatesWithUsage)
	const {
		layouts: templateLayouts,
		dividerY,
		viewBounds: templateZoneBounds,
		emptyStatePosition
	} = templateLayoutResult

	// Canvas viewport: scale, bounds calculation, auto-centering effects
	const { canvasScale, viewportBounds, handleCanvasContextReady } = useCanvasViewport({
		prezillo,
		canvasContextRef,
		canvasRef,
		canvasContainerRef,
		templateLayouts,
		forceZoomRef,
		forceZoomTemplateRef
	})

	// Multi-page rendering: get all visible views and their objects
	const visibleViews = useVisibleViews(prezillo.doc, viewportBounds)
	const visibleViewIds = React.useMemo(() => visibleViews.map((v) => v.id), [visibleViews])
	const visibleViewObjects = useVisibleViewObjects(prezillo.doc, visibleViewIds)

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
		prezillo,
		isReadOnly,
		canvasObjects,
		canvasContextRef,
		templateLayouts,
		snapDragRef,
		clearSnaps,
		grabPointRef,
		justFinishedInteractionRef,
		setTempObjectState
	})

	// Reset handle bar drag flag when drag ends
	React.useEffect(() => {
		if (!dragState) {
			isDraggingFromHandleRef.current = false
		}
	}, [dragState])

	// Resize/rotate/pivot interaction hooks
	const {
		storedSelection,
		isResizing,
		handleResizeStart,
		rotationState,
		hookRotateStart,
		pivotState,
		hookPivotDragStart
	} = useInteractionHooks({
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
	})

	// Tool handlers (shape creation via drawing tools)
	const { toolEvent, handleToolStart, handleToolMove, handleToolEnd } = useToolHandlers({
		prezillo,
		templateLayouts,
		isResizing,
		dragState,
		setDragState,
		selectedContainerId,
		selectedSymbolId,
		isReadOnly,
		setEditingTextId
	})

	// Canvas event handlers (click, keyboard, context menu, delete, document check)
	const {
		handleObjectClick,
		handleObjectDoubleClick,
		handleCanvasClick,
		handleDelete,
		handleCheckDocument,
		handleKeyDown,
		handleObjectContextMenu,
		objectMenu,
		setObjectMenu
	} = useCanvasEventHandlers({
		prezillo,
		canvasObjects,
		isReadOnly,
		dialog,
		handleDuplicate,
		setEditingTextId,
		justFinishedInteractionRef,
		objectMenuRef
	})

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
					canUndo={prezillo.canUndo}
					canRedo={prezillo.canRedo}
					isExportingPDF={isExportingPDF}
					cmds={{
						onDelete: handleDelete,
						onDuplicate: handleDuplicate,
						onUndo: prezillo.undo,
						onRedo: prezillo.redo,
						onExport: () => {
							if (prezillo.yDoc && prezillo.doc) {
								downloadExport(prezillo.yDoc, prezillo.doc)
							}
						},
						onExportPDF: async () => {
							if (prezillo.doc && views.length > 0) {
								setIsExportingPDF(true)
								try {
									await downloadPDF(
										prezillo.doc,
										views,
										prezillo.cloudillo.ownerTag
									)
								} catch (error) {
									console.error('PDF export failed:', error)
								} finally {
									setIsExportingPDF(false)
								}
							}
						},
						onCheckDocument: handleCheckDocument
					}}
					zCmds={{
						onBringToFront: () => {
							prezillo.selectedIds.forEach((id) =>
								bringToFront(prezillo.yDoc, prezillo.doc, id)
							)
						},
						onBringForward: () => {
							prezillo.selectedIds.forEach((id) =>
								bringForward(prezillo.yDoc, prezillo.doc, id)
							)
						},
						onSendBackward: () => {
							Array.from(prezillo.selectedIds)
								.reverse()
								.forEach((id) => sendBackward(prezillo.yDoc, prezillo.doc, id))
						},
						onSendToBack: () => {
							Array.from(prezillo.selectedIds)
								.reverse()
								.forEach((id) => sendToBack(prezillo.yDoc, prezillo.doc, id))
						}
					}}
					snap={snapSettings}
					textStyle={
						selectedTextObject
							? {
									hasSelection: true,
									align: selectedTextStyle?.textAlign,
									verticalAlign: selectedTextStyle?.verticalAlign,
									fontSize: selectedTextStyle?.fontSize,
									bold: selectedTextStyle?.fontWeight === 'bold',
									italic: selectedTextStyle?.fontItalic,
									underline: selectedTextStyle?.textDecoration === 'underline'
								}
							: null
					}
					textCmds={{
						onAlignChange: handleTextAlignChange,
						onVerticalAlignChange: handleVerticalAlignChange,
						onFontSizeChange: handleFontSizeChange,
						onBoldToggle: handleBoldToggle,
						onItalicToggle: handleItalicToggle,
						onUnderlineToggle: handleUnderlineToggle
					}}
					isPanelVisible={isPanelVisible}
					onTogglePanel={() => setIsPanelVisible((v) => !v)}
					selectedSymbolId={selectedSymbolId}
					onSelectSymbol={setSelectedSymbolId}
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
								{/* Text edit handle - fixed layer for constant screen size during drag */}
								{editingTextId &&
									(() => {
										const editingObject = canvasObjects.find(
											(o) => o.id === editingTextId
										)
										if (!editingObject || editingObject.type !== 'text')
											return null
										// Use temp bounds during drag for visual feedback
										const editTempBounds =
											tempObjectState?.objectId === editingTextId
												? tempObjectState
												: undefined
										return (
											<FixedTextEditHandle
												canvasBounds={{
													x: editTempBounds?.x ?? editingObject.x,
													y: editTempBounds?.y ?? editingObject.y,
													width:
														editTempBounds?.width ??
														editingObject.width,
													height:
														editTempBounds?.height ??
														editingObject.height
												}}
												rotation={editingObject.rotation}
												onDragStart={(e, grabPoint) => {
													// Set flag to prevent blur from closing editor
													isDraggingFromHandleRef.current = true
													handleObjectPointerDown(e, editingTextId, {
														grabPointOverride: grabPoint,
														forceStartDrag: true
													})
												}}
											/>
										)
									})()}
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

							// Pass temp bounds if this object is being dragged/resized
							// Also check if this object is a stacked object being dragged with the primary
							const objectTempBounds =
								tempObjectState?.objectId === object.id
									? tempObjectState
									: tempObjectState?.stackedObjects?.find(
											(so) => so.objectId === object.id
										)

							// If this object is being text-edited, render the overlay instead
							if (editingTextId === object.id) {
								// Get or create Y.Text for this object
								const editYText = prezillo.doc.rt.get(object.id)
								if (!editYText) {
									// Should not happen after migration, but handle gracefully
									setEditingTextId(null)
									return null
								}

								// Apply temp bounds during drag for visual feedback
								const editObject = objectTempBounds
									? {
											...object,
											x: objectTempBounds.x,
											y: objectTempBounds.y,
											width: objectTempBounds.width,
											height: objectTempBounds.height
										}
									: object

								// Build rotation transform for the editor
								const editRotation = editObject.rotation ?? 0
								const editPivotX = editObject.pivotX ?? 0.5
								const editPivotY = editObject.pivotY ?? 0.5
								const editCX = editObject.x + editObject.width * editPivotX
								const editCY = editObject.y + editObject.height * editPivotY
								const editRotationTransform =
									editRotation !== 0
										? `rotate(${editRotation}, ${editCX}, ${editCY})`
										: undefined

								// Build bullet icon URL for custom list markers
								const editBulletIconUrl = (() => {
									const lb = textStyle.listBullet
									if (!lb) return undefined
									const bulletId = migrateBullet(lb)
									if (!bulletId) return undefined
									const icon = getBulletIcon(bulletId)
									if (!icon) return undefined
									const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${icon.viewBox.join(' ')}'><path d='${icon.pathData}' fill='black'/></svg>`
									return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
								})()

								return (
									<RichTextEditor
										key={object.id}
										x={editObject.x}
										y={editObject.y}
										width={editObject.width}
										height={editObject.height}
										yText={editYText}
										baseStyle={textStyle}
										bulletIconUrl={editBulletIconUrl}
										onSave={handleTextEditSaveWithFlag}
										onCancel={handleTextEditCancel}
										quillRef={quillRef}
										onDragStart={(
											e: React.PointerEvent,
											options?: {
												grabPointOverride?: { x: number; y: number }
												forceStartDrag?: boolean
											}
										) => handleObjectPointerDown(e, object.id, options)}
										shouldIgnoreBlur={() =>
											isDraggingFromHandleRef.current ||
											isPanelClickRef.current
										}
										onSetDragFlag={() => {
											isDraggingFromHandleRef.current = true
										}}
										rotationTransform={editRotationTransform}
									/>
								)
							}

							// Apply property preview if this object is being scrubbed
							const displayObject =
								propertyPreview?.objectId === object.id
									? {
											...object,
											opacity: propertyPreview.opacity ?? object.opacity
										}
									: object

							// Apply text style preview (lineHeight) if this object is being scrubbed
							const displayTextStyle =
								propertyPreview?.objectId === object.id &&
								propertyPreview.lineHeight !== undefined
									? {
											...textStyle,
											lineHeight: propertyPreview.lineHeight
										}
									: textStyle

							// Only show hover when nothing is selected
							const hasSelection = prezillo.selectedIds.size > 0
							const isThisHovered = hoveredObjectId === object.id

							return (
								<ObjectShape
									key={object.id}
									object={displayObject}
									doc={prezillo.doc}
									style={style}
									textStyle={displayTextStyle}
									isSelected={prezillo.isSelected(object.id)}
									isHovered={!hasSelection && isThisHovered}
									isStackedHighlight={prezillo.stackedHighlightIds.has(
										object.id as ObjectId
									)}
									onClick={(e) => handleObjectClick(e, object.id)}
									onDoubleClick={(e) => handleObjectDoubleClick(e, object.id)}
									onContextMenu={(e) => handleObjectContextMenu(e, object.id)}
									onPointerDown={(e) => handleObjectPointerDown(e, object.id)}
									onPointerEnter={() => setHoveredObjectId(object.id as ObjectId)}
									onPointerLeave={() => setHoveredObjectId(null)}
									tempBounds={objectTempBounds}
									ownerTag={prezillo.cloudillo.ownerTag}
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
						{toolEvent &&
							prezillo.activeTool &&
							(() => {
								let previewWidth = Math.abs(toolEvent.x - toolEvent.startX)
								let previewHeight = Math.abs(toolEvent.y - toolEvent.startY)
								// Enforce square for symbol and qrcode tools
								if (
									prezillo.activeTool === 'symbol' ||
									prezillo.activeTool === 'qrcode'
								) {
									const maxDim = Math.max(previewWidth, previewHeight)
									previewWidth = maxDim
									previewHeight = maxDim
								}
								return (
									<rect
										x={Math.min(toolEvent.startX, toolEvent.x)}
										y={Math.min(toolEvent.startY, toolEvent.y)}
										width={previewWidth}
										height={previewHeight}
										stroke="#0066ff"
										strokeWidth={2}
										strokeDasharray="4,4"
										fill="rgba(0, 102, 255, 0.1)"
										pointerEvents="none"
									/>
								)
							})()}
					</SvgCanvas>
				</div>

				{/* Desktop: Sidebar panel */}
				{!isMobile && isPanelVisible && !isReadOnly && (
					<PrezilloPropertiesPanel
						prezillo={prezillo}
						onPreview={setPropertyPreview}
						selectedContainerId={selectedContainerId as any}
						onSelectContainer={setSelectedContainerId as any}
						quillRef={quillRef}
						editingTextId={editingTextId}
					/>
				)}
			</div>

			{/* Mobile: Bottom sheet panel */}
			{isMobile && !isReadOnly && (
				<MobilePropertyPanel
					prezillo={prezillo}
					snapPoint={mobileSnapPoint}
					onSnapChange={handleMobileSnapChange}
					onPreview={setPropertyPreview}
				/>
			)}

			<div className="c-nav-container c-hbox">
				<ViewPicker
					prezillo={prezillo}
					views={views}
					cmds={{
						onViewSelect: (id) => {
							// When following and user clicks a view, stop following
							if (prezillo.followingClientId) {
								prezillo.unfollowPresenter()
							}
							// Explicit ViewPicker navigation should always zoom to the page
							forceZoomRef.current = true
							prezillo.setActiveViewId(id)
							// Clear template selection when selecting a page
							prezillo.clearTemplateSelection()
						},
						onAddView: handleAddView,
						onPrevView: handlePrevView,
						onNextView: handleNextView,
						onReorderView: handleReorderView,
						onDuplicateView: handleDuplicateView,
						onDeleteView: handleDeleteView
					}}
					presentCmds={{
						onPresent: handleStartPresenting,
						onStopPresenting: handleStopPresenting,
						onFollow: prezillo.followPresenter,
						onUnfollow: prezillo.unfollowPresenter
					}}
					readOnly={isReadOnly}
					isMobile={isMobile}
					templates={templatesWithUsage}
					onTemplateSelect={(id) => {
						// Explicit template selection should always zoom
						forceZoomTemplateRef.current = true
						prezillo.selectTemplate(id)
					}}
				/>
			</div>

			{/* Presentation mode - local presenting */}
			{isPresentationMode && (
				<PresentationMode
					prezillo={prezillo}
					views={views}
					initialViewId={prezillo.activeViewId}
					onExit={handleStopPresenting}
					ownerTag={prezillo.cloudillo.ownerTag}
					onViewChange={(viewIndex, viewId) => {
						prezillo.setActiveViewId(viewId)
					}}
				/>
			)}

			{/* Fullscreen following mode */}
			{isFullscreenFollowing && followedPresenter && (
				<PresentationMode
					prezillo={prezillo}
					views={views}
					initialViewId={followedPresenter.viewId}
					onExit={handleExitFullscreenFollowing}
					ownerTag={prezillo.cloudillo.ownerTag}
					isFollowing={true}
					followingViewIndex={followedPresenter.viewIndex}
					followingPresenterClientId={followedPresenter.clientId}
				/>
			)}

			{/* Object context menu */}
			{objectMenu && (
				<ContextMenu
					prezillo={prezillo}
					menuRef={objectMenuRef}
					position={objectMenu}
					onClose={() => setObjectMenu(null)}
					onDuplicate={handleDuplicate}
					onDelete={handleDelete}
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

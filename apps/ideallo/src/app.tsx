// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Main Ideallo application component
 * Milestone E: UI Polish
 */

const CURSOR_BROADCAST_THROTTLE_MS = 50

import * as React from 'react'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
// The @font-face rules behind the PropertyBar's font picker. Ideallo runs in a sandboxed iframe,
// so it cannot rely on the shell having loaded them - see prezillo's app.tsx, which does the same.
import '@cloudillo/fonts/fonts.css'
import '@cloudillo/react/components.css'
import './style.css'

import { calculateArcRadius } from '@cloudillo/canvas-tools'
import { getAppBus } from '@cloudillo/core'
import { useIsMobile } from '@cloudillo/react'
import type Quill from 'quill'
import {
	type ResizeHandle,
	type SvgCanvasContext,
	type Point as SvgPoint,
	useResizable,
	useRotatable
} from 'react-svg-canvas'

import {
	Canvas,
	type CanvasHandle,
	PropertyBar,
	Toolbar,
	ZoomControls
} from './components/index.js'
import type { ConnectorEndpointPreview, GeometryOverrides } from './connectors/index.js'
import { isBoundConnector } from './connectors/index.js'
import { bindEndpoint } from './connectors/lifecycle.js'
import type { Bounds, IdealloObject, ObjectId } from './crdt/index.js'
import {
	bringForward,
	bringToFront,
	compactAnchorPoint,
	connectObjects,
	DEFAULT_STYLE,
	deletableObjectIds,
	deleteObjectsWithBindingCleanup,
	downloadExport,
	duplicateObject,
	getAllResolvedObjects,
	getObject,
	isTextBearing,
	LAYOUT_ORIGIN,
	replaceGeometryPoints,
	sendBackward,
	sendToBack,
	translateObject,
	updateDocumentNavState,
	updateObjectFields
} from './crdt/index.js'
import {
	useConnectorEndpointDrag,
	useDocumentHandler,
	useDrawingHandler,
	useEraserHandler,
	useIdealloDocument,
	useImageHandler,
	useLatestRef,
	useObjectTextEditor,
	useSelectHandler,
	useShapeHandler,
	useStickyHandler,
	useTextHandler
} from './hooks/index.js'
import type { MorphAnimationState } from './smart-ink/index.js'
import {
	isDragShapeTool,
	isOneShotTool,
	nextToolAfterUse,
	shouldSelectAfterUse,
	TOOL_BY_KEY,
	TOOL_LABELS
} from './tools/index.js'
import { getObjectBounds, getRotatedObjectBounds } from './utils/bounds.js'
import { isEditableTarget, isPopoverOpen } from './utils/editable-target.js'
import { normalizeAngle, scaleConnectorTerminals, scalePointsIntoBounds } from './utils/geometry.js'
import { scalePathData } from './utils/path-scaling.js'

export function IdealloApp() {
	const ideallo = useIdealloDocument()
	const canvasRef = React.useRef<CanvasHandle>(null)

	const isMobile = useIsMobile()

	// Zoom state
	const [scale, setScale] = React.useState(1)

	// Mirrored from Canvas via onMatrixChange (same initial value, so the two never disagree). Lets
	// screen-space selection bounds be derived during render, not through a per-pointermove effect.
	//
	// The STATE is written only while something is selected - liveScreenSelectionBounds is its one
	// consumer and returns null otherwise - so a pan with an empty selection does not re-render this
	// component. The ref is always current, for the resync below.
	//
	// Canvas dropped the same trick in favour of CanvasScene's memo boundary; this gate stays because
	// THIS render is the expensive one: three yData.toJSON() + equalityDeep passes over the whole
	// document (useY, via useIdealloDocument) plus a Toolbar/PropertyBar reconcile - and a per-frame
	// Toolbar render is what produced the "Maximum update depth exceeded" bug documented in
	// ToolPopover.tsx's itemsKey comment. Known gap: no test renders IdealloApp, so this is uncovered.
	const [canvasMatrix, setCanvasMatrix] = React.useState<
		[number, number, number, number, number, number]
	>([1, 0, 0, 1, 0, 0])
	const canvasMatrixRef = React.useRef<[number, number, number, number, number, number]>([
		1, 0, 0, 1, 0, 0
	])

	// Smart Ink morph animation state
	const [morphAnimations, setMorphAnimations] = React.useState<Map<string, MorphAnimationState>>(
		new Map()
	)

	// Recently snapped objects for undo hint (objectId -> timestamp)
	const [snappedHints, setSnappedHints] = React.useState<
		Map<ObjectId, { bounds: Bounds; timestamp: number }>
	>(new Map())

	// Active document embed (interactive iframe)
	const [activeDocumentId, setActiveDocumentIdRaw] = React.useState<ObjectId | null>(null)
	const isReadOnly = ideallo.cloudillo.access !== 'write'

	// Force select tool in read-only mode
	React.useEffect(() => {
		if (isReadOnly) ideallo.setActiveTool('select')
	}, [isReadOnly])

	// Cache pending navState changes per document embed objectId
	const pendingNavStateRef = React.useRef<
		Map<string, { viewState: string; aspectRatio?: [number, number] }>
	>(new Map())

	// Flush cached navState to CRDT for a given objectId
	const flushNavState = React.useCallback(
		(objectId: ObjectId) => {
			if (isReadOnly) return
			const pending = pendingNavStateRef.current.get(objectId)
			if (!pending) return
			pendingNavStateRef.current.delete(objectId)
			updateDocumentNavState(
				ideallo.yDoc,
				ideallo.doc,
				objectId,
				pending.viewState,
				pending.aspectRatio
			)
		},
		[isReadOnly, ideallo.yDoc, ideallo.doc]
	)

	// Wrap setActiveDocumentId to flush on deactivate
	const setActiveDocumentId = React.useCallback(
		(id: ObjectId | null) => {
			setActiveDocumentIdRaw((prev) => {
				if (prev && prev !== id) {
					flushNavState(prev)
				}
				return id
			})
		},
		[flushNavState]
	)

	// Callback for embedded document view state changes (cache only)
	const handleDocumentViewStateChange = React.useCallback(
		(
			objectId: string,
			viewState: string,
			aspectRatio?: [number, number],
			_aspectFixed?: boolean
		) => {
			pendingNavStateRef.current.set(objectId, { viewState, aspectRatio })
		},
		[]
	)

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

	const selectObjects = React.useCallback((ids: ObjectId[], addToSelection: boolean = false) => {
		setSelectedIds((prev) => {
			if (!addToSelection) return new Set(ids)
			const next = new Set(prev)
			ids.forEach((id) => {
				next.add(id)
			})
			return next
		})
	}, [])

	// Read from handleMatrixChange, which Canvas calls from an effect - never during render
	const hasSelectionRef = useLatestRef(selectedIds.size > 0)

	// The matrix mirror is skipped while nothing is selected, so a selection arriving after a pan
	// has to pick up whatever the matrix reached meanwhile
	React.useEffect(() => {
		if (selectedIds.size) setCanvasMatrix(canvasMatrixRef.current)
	}, [selectedIds])

	/*
	 * setActiveDocumentId is in the deps and must stay there. It closes over flushNavState, which
	 * closes over `isReadOnly` - and on the first render `cloudillo.access` is still undefined
	 * (the app bus has not finished its handshake), so isReadOnly is true. Pinning this callback
	 * with [] froze that render-0 closure forever: Escape or a click on empty canvas after panning
	 * inside an embedded document hit `if (isReadOnly) return` and threw the cached viewport away.
	 * Switching straight from one embed to another still worked, which is what hid it.
	 */
	const clearSelection = React.useCallback(() => {
		setSelectedIds(new Set())
		setActiveDocumentId(null)
	}, [setActiveDocumentId])

	/** An object that stopped existing must not stay selected - the handles would point at air. */
	const deselectObject = React.useCallback((id: ObjectId) => {
		setSelectedIds((prev) => {
			if (!prev.has(id)) return prev
			const next = new Set(prev)
			next.delete(id)
			return next
		})
	}, [])

	/*
	 * Live tool + lock, so the completion callbacks below never capture a stale value and never
	 * churn identity - they are handed to handler hooks that memoize on them.
	 */
	const activeToolRef = useLatestRef(ideallo.activeTool)
	const toolLockedRef = useLatestRef(ideallo.toolLocked)

	/**
	 * One placement is done: one-shot tools hand the pointer back to Select with the new object
	 * selected; the lock opts out of that for repeat placement. Called with no id when the gesture
	 * produced nothing (a cancelled picker).
	 */
	const finishToolUse = React.useCallback(
		(objectId?: ObjectId) => {
			const tool = activeToolRef.current
			const locked = toolLockedRef.current
			if (objectId && shouldSelectAfterUse(tool, locked)) selectObject(objectId)
			const next = nextToolAfterUse(tool, locked)
			if (next !== tool) ideallo.setActiveTool(next)
		},
		[selectObject, ideallo.setActiveTool]
	)

	/** Handler-facing form: every `onObjectCreated` requires the id to be mandatory. */
	const handleToolUseComplete = React.useCallback(
		(objectId: ObjectId) => {
			finishToolUse(objectId)
		},
		[finishToolUse]
	)

	// Undo/redo drop the selection: it may well be pointing at an object that is about to
	// stop existing, and an orphan selection box is worse than no selection.
	const handleUndo = React.useCallback(() => {
		clearSelection()
		ideallo.undo()
	}, [clearSelection, ideallo.undo])

	const handleRedo = React.useCallback(() => {
		clearSelection()
		ideallo.redo()
	}, [clearSelection, ideallo.redo])

	// Canvas context ref for coordinate transforms
	const canvasContextRef = React.useRef<SvgCanvasContext | null>(null)

	// Stable callback for context updates (prevents infinite re-render loop)
	const handleContextReady = React.useCallback((ctx: SvgCanvasContext) => {
		canvasContextRef.current = ctx
	}, [])

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
	// Use ref + RAF to avoid re-render cascade on every pointer move
	type TempObjectState = {
		objectId: ObjectId
		x: number
		y: number
		width: number
		height: number
		/**
		 * The box the resize started from. Only a RESIZE sets it; Canvas needs it to scale a
		 * connector's terminals out of the same source box onResizeEnd will.
		 */
		originalBounds?: Bounds
		rotation?: number
		pivotX?: number
		pivotY?: number
	}
	const tempObjectStateRef = React.useRef<TempObjectState | null>(null)
	const [tempObjectState, setTempObjectStateInternal] = React.useState<TempObjectState | null>(
		null
	)
	const rafIdRef = React.useRef<number | null>(null)

	// Batched update via RAF to prevent cascading re-renders
	const setTempObjectState = React.useCallback((value: TempObjectState | null) => {
		tempObjectStateRef.current = value
		if (value === null) {
			// Immediate update on clear (interaction end)
			if (rafIdRef.current) {
				cancelAnimationFrame(rafIdRef.current)
				rafIdRef.current = null
			}
			setTempObjectStateInternal(null)
		} else if (!rafIdRef.current) {
			// Batch updates via RAF during interaction
			rafIdRef.current = requestAnimationFrame(() => {
				rafIdRef.current = null
				setTempObjectStateInternal(tempObjectStateRef.current)
			})
		}
	}, [])

	// Cleanup RAF on unmount
	React.useEffect(() => {
		return () => {
			if (rafIdRef.current) {
				cancelAnimationFrame(rafIdRef.current)
			}
		}
	}, [])

	// Locked bounds during resize/rotate to prevent prop changes from re-triggering hooks
	const [lockedHookState, setLockedHookState] = React.useState<{
		bounds: Bounds
		rotation: number
		pivotX: number
		pivotY: number
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

	/**
	 * Live Alt state, for free anchor placement.
	 *
	 * Pointer-move events do not carry modifiers through the canvas's tool event plumbing, and
	 * the modifier has to be readable mid-drag, so it is tracked on the window instead.
	 */
	const altKeyRef = React.useRef(false)
	React.useEffect(() => {
		const update = (e: KeyboardEvent) => {
			altKeyRef.current = e.altKey
		}
		const clear = () => {
			altKeyRef.current = false
		}
		window.addEventListener('keydown', update)
		window.addEventListener('keyup', update)
		window.addEventListener('blur', clear)
		return () => {
			window.removeEventListener('keydown', update)
			window.removeEventListener('keyup', update)
			window.removeEventListener('blur', clear)
		}
	}, [])

	/**
	 * One resolve pass per document revision, shared by every pointer-driven lookup: hit testing,
	 * hover highlighting and bind-target lookup all run on pointermove and would otherwise expand
	 * every stored object and rebuild a ConnectorContext each. The route cache covers the routing,
	 * not the expand.
	 *
	 * Deliberately NOT Canvas's objectsToRender: that one has pending drag/resize geometry applied,
	 * which hit testing must not see.
	 */
	const resolvedObjects = React.useMemo(
		() => (ideallo.doc ? getAllResolvedObjects(ideallo.doc) : []),
		[ideallo.doc, ideallo.objects, ideallo.order, ideallo.textContent]
	)
	/**
	 * The same pass, keyed by id, for the by-id lookups that measure the selection.
	 *
	 * They must NOT use getObject(): that is expandObject with no route resolution, so a connector
	 * comes back without `route` and getObjectBounds falls back to the bare endpoint box - which is
	 * exactly the case the fallback exists to avoid. An elbow route that detours around an obstacle
	 * would then get a selection frame and transform handles covering only its endpoints.
	 *
	 * Derived from the memo above rather than resolving a second time: one pass per revision.
	 */
	const resolvedObjectsById = React.useMemo(
		() => new Map(resolvedObjects.map((obj) => [obj.id, obj])),
		[resolvedObjects]
	)

	// Via a ref so the getter's identity is stable and the handler hooks' memos do not churn -
	// the same trick translateToRef uses below.
	const resolvedObjectsRef = useLatestRef(resolvedObjects)
	const getResolvedObjects = React.useCallback(() => resolvedObjectsRef.current, [])

	const shapeHandler = useShapeHandler({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		awareness: ideallo.awareness,
		currentStyle: ideallo.currentStyle,
		activeTool: ideallo.activeTool,
		scale,
		getResolvedObjects,
		onObjectCreated: handleToolUseComplete
	})

	// The ONE editing slot. Sticky, text label and shape captions all open into it, and there is
	// one close rule for all of them.
	const textEditor = useObjectTextEditor({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		onObjectDeleted: deselectObject
	})

	// Text handler - creation only; re-editing goes straight to textEditor.startEditing
	const textHandler = useTextHandler({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		currentStyle: ideallo.currentStyle,
		enabled: ideallo.activeTool === 'text',
		startEditing: textEditor.startEditing,
		onObjectCreated: handleToolUseComplete
	})

	// The tool revert happens at CREATION, not at edit end: the click that ends an edit is routed
	// by the active tool, so reverting on save would leave that click making a second sticky.
	const stickyHandler = useStickyHandler({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		currentStyle: ideallo.currentStyle,
		enabled: ideallo.activeTool === 'sticky',
		startEditing: textEditor.startEditing,
		onObjectCreated: handleToolUseComplete
	})

	// Quill ref for formatting from PropertyBar
	const quillRef = React.useRef<Quill | null>(null)

	// Shared ref for editor content height (used to persist auto-grown height on save)
	const editContentHeightRef = React.useRef<number | null>(null)

	// Named, not inline: this reaches the memoised CanvasScene, and a fresh arrow per render would
	// re-render the whole scene on every app render
	const handleEditHeightChange = React.useCallback((height: number) => {
		editContentHeightRef.current = height
	}, [])

	/*
	 * A mousedown inside the property bar is the user styling what they are editing.
	 *
	 * Quill blurs before the click lands, and blur closes the editor - so recolouring a sticky
	 * mid-edit would shut the editor and take the format buttons away with it. Set on the way down
	 * and cleared a frame later, exactly when the blur handler needs to read it.
	 *
	 * `.c-font-picker__menu` counts as part of the bar: FontPicker portals its menu to
	 * #popper-container, so a click on a font name is outside the bar in the DOM only.
	 */
	const isPropertyBarClickRef = React.useRef(false)

	React.useEffect(() => {
		const onPointerDown = (evt: PointerEvent) => {
			const target = evt.target as HTMLElement | null
			if (!target?.closest?.('.ideallo-property-bar, .c-font-picker__menu')) return
			isPropertyBarClickRef.current = true
			requestAnimationFrame(() => {
				isPropertyBarClickRef.current = false
			})
		}
		window.addEventListener('pointerdown', onPointerDown, true)
		return () => window.removeEventListener('pointerdown', onPointerDown, true)
	}, [])

	const shouldIgnoreEditorBlur = React.useCallback(() => isPropertyBarClickRef.current, [])

	const handleObjectDoubleClick = React.useCallback(
		(objectId: ObjectId, evt: React.MouseEvent) => {
			const obj = ideallo.doc && getObject(ideallo.doc, objectId)
			if (obj && isTextBearing(obj.type)) {
				textEditor.startEditing(obj, { clientX: evt.clientX, clientY: evt.clientY })
			}
		},
		[ideallo.doc, textEditor.startEditing]
	)

	/**
	 * Persist a height the editor grew to while typing.
	 *
	 * Written with LAYOUT_ORIGIN so it stays off the undo stack: the height is a consequence of
	 * the text, and a Ctrl+Z that only un-grows a box is a step the user never took.
	 */
	const commitGrownHeight = React.useCallback(
		(objectId: ObjectId | undefined) => {
			const grownHeight = editContentHeightRef.current
			editContentHeightRef.current = null
			if (!objectId || !grownHeight || !ideallo.yDoc || !ideallo.doc) return
			const obj = getObject(ideallo.doc, objectId)
			if (!obj || !('height' in obj) || grownHeight <= obj.height) return
			updateObjectFields(
				ideallo.yDoc,
				ideallo.doc,
				objectId,
				{ height: grownHeight },
				LAYOUT_ORIGIN
			)
		},
		[ideallo.yDoc, ideallo.doc]
	)

	/**
	 * Close whichever editor is open, keeping any height it grew to. Drops the object if it was
	 * left empty and would be invisible without text.
	 */
	const endTextEdit = React.useCallback(() => {
		const editId = textEditor.editing?.id
		textEditor.endEditing()
		commitGrownHeight(editId)
	}, [textEditor, commitGrownHeight])

	// Select handler for select tool
	const selectHandler = useSelectHandler({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		awareness: ideallo.awareness,
		selectedIds,
		selectObject,
		clearSelection,
		enabled: ideallo.activeTool === 'select' && !isReadOnly,
		objects: ideallo.objects,
		getResolvedObjects,
		scale
	})

	// Eraser handler for eraser tool
	const eraserHandler = useEraserHandler({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		awareness: ideallo.awareness,
		objects: ideallo.objects,
		enabled: ideallo.activeTool === 'eraser',
		scale,
		getResolvedObjects
	})

	// Image handler for image tool
	const imageHandler = useImageHandler({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		enabled: ideallo.activeTool === 'image',
		documentFileId: ideallo.cloudillo.fileId,
		onObjectCreated: (id) => {
			// Select the newly created image
			selectObject(id)
		},
		// Also fires when the picker is cancelled, which is exactly when the tool must be put
		// away: its picker is opened from an effect keyed on the active tool, so a tool left on
		// 'image' could never be re-triggered.
		onInsertComplete: () => {
			finishToolUse()
		}
	})

	// Trigger image picker when image tool is activated
	// Use a ref to avoid re-triggering when imageHandler changes
	const imageHandlerRef = React.useRef(imageHandler)
	imageHandlerRef.current = imageHandler

	// Document handler for document tool
	const documentHandler = useDocumentHandler({
		yDoc: ideallo.yDoc,
		doc: ideallo.doc,
		enabled: ideallo.activeTool === 'document',
		documentFileId: ideallo.cloudillo.fileId,
		onObjectCreated: (id) => {
			selectObject(id)
		},
		onInsertComplete: () => {
			finishToolUse()
		}
	})

	const documentHandlerRef = React.useRef(documentHandler)
	documentHandlerRef.current = documentHandler

	React.useEffect(() => {
		if (ideallo.activeTool === 'image') {
			imageHandlerRef.current.insertImage()
		} else if (ideallo.activeTool === 'document') {
			documentHandlerRef.current.insertDocument()
		}
	}, [ideallo.activeTool])

	// We need selectionBounds before we can initialize resize handler
	// Compute basic selection bounds first (without offsets)
	const _baseSelectionBounds = React.useMemo<Bounds | null>(() => {
		if (selectedIds.size === 0 || !ideallo.doc) return null

		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity

		// A SINGLE selection keeps its unrotated box: SelectionBox is handed the object's rotation
		// and turns the frame itself, so a rotated box here would be rotated twice. With 2+ objects
		// there is no one rotation to hand it, so the frame has to enclose the rotated shapes.
		const measure = selectedIds.size > 1 ? getRotatedObjectBounds : getObjectBounds

		selectedIds.forEach((id) => {
			// Resolved, not getObject: a connector must be measured on its ROUTE - see
			// resolvedObjectsById
			const obj = resolvedObjectsById.get(id)
			if (obj) {
				const bounds = measure(obj)
				minX = Math.min(minX, bounds.x)
				minY = Math.min(minY, bounds.y)
				maxX = Math.max(maxX, bounds.x + bounds.width)
				maxY = Math.max(maxY, bounds.y + bounds.height)
			}
		})

		if (minX === Infinity) return null
		return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
	}, [selectedIds, ideallo.doc, resolvedObjectsById])

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
		// Resolved, not getObject: the transform hooks must measure a connector on its ROUTE, the
		// same box SelectionBox is drawn from - see resolvedObjectsById.
		const obj = resolvedObjectsById.get(id)
		if (!obj) return null
		return {
			id,
			bounds: getObjectBounds(obj),
			rotation: obj.rotation ?? 0,
			pivotX: obj.pivotX ?? 0.5,
			pivotY: obj.pivotY ?? 0.5
		}
	}, [selectedIds, ideallo.doc, resolvedObjectsById])

	// Keep a ref for callbacks to avoid stale closures
	const storedSelectionRef = useLatestRef(storedSelection)

	/**
	 * The selected connector, and whether it is bound at both ends.
	 *
	 * A fully bound connector has no user-editable geometry - both terminals are derived - so
	 * resize and rotate are switched off for it and Canvas hides the SelectionBox entirely.
	 * A half-bound one keeps its free terminal, which is edited through the endpoint handle.
	 */
	const selectedArrow = React.useMemo(() => {
		if (selectedIds.size !== 1 || !ideallo.doc) return null
		const id = Array.from(selectedIds)[0]
		const obj = getObject(ideallo.doc, id)
		return obj?.type === 'connector' ? obj : null
	}, [selectedIds, ideallo.doc, ideallo.objects])

	const isFullyBoundConnector = Boolean(
		selectedArrow?.startObjectId && selectedArrow?.endObjectId
	)
	/** Rotation is wrong for ANY bound connector - see isBoundConnector for why */
	const isBoundConnectorSelected = selectedArrow ? isBoundConnector(selectedArrow) : false

	// Compute aspect ratio for single image selection
	// This is used by useResizable for aspect-locked resize
	const selectionAspectRatio = React.useMemo(() => {
		if (selectedIds.size !== 1 || !ideallo.doc) return undefined
		const id = Array.from(selectedIds)[0]
		const obj = getObject(ideallo.doc, id)
		if (obj?.type !== 'image') return undefined
		return obj.width / obj.height
	}, [selectedIds, ideallo.doc, ideallo.objects])

	// Compute corner aspect lock for drawn shapes (not images which have explicit ratio)
	const cornerAspectLock = React.useMemo(() => {
		if (selectedIds.size !== 1 || !ideallo.doc) return false
		const id = Array.from(selectedIds)[0]
		const obj = getObject(ideallo.doc, id)
		if (!obj) return false
		const drawnTypes = new Set(['rect', 'ellipse', 'freehand', 'polygon'])
		return drawnTypes.has(obj.type)
	}, [selectedIds, ideallo.doc, ideallo.objects])

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
			action: 'drag' | 'resize' | 'rotate' | 'connector' | null,
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

	/**
	 * Dragging a terminal of the selected connector: bind, rebind, re-anchor or unbind.
	 *
	 * Gated the same way the pivot drag is (isPivotDraggingRef at the pointer routers), so the
	 * select handler does not start moving the object underneath the handle.
	 */
	const isEndpointDraggingRef = React.useRef(false)

	const connectorDrag = useConnectorEndpointDrag({
		arrowId: selectedArrow?.id ?? null,
		translateTo: translateToRef,
		// Resolved objects are a superset of the expanded ones, and binding only reads shape
		// geometry - findBindTargetShape skips connectors via isBindable.
		getObjects: getResolvedObjects,
		scale,
		// selectedArrow is the raw object, so it still carries the bindings the resolver consumes
		getOppositeBoundId: (terminal) =>
			terminal === 'start' ? selectedArrow?.endObjectId : selectedArrow?.startObjectId,
		disabled: isReadOnly || ideallo.activeTool !== 'select' || !selectedArrow,
		onDragStart: () => {
			isEndpointDraggingRef.current = true
		},
		onDrag: (state) => {
			if (selectedArrow) {
				broadcastEditing(selectedArrow.id, 'connector', state.point[0], state.point[1])
			}
		},
		onDragEnd: (terminal, bind, point) => {
			isEndpointDraggingRef.current = false
			clearEditingState()
			if (!selectedArrow || !ideallo.yDoc || !ideallo.doc) return
			bindEndpoint(
				ideallo.yDoc,
				ideallo.doc,
				selectedArrow.id,
				terminal,
				bind?.objectId ?? null,
				bind ? compactAnchorPoint(bind.anchor) : undefined,
				point
			)
		},
		onCancel: () => {
			isEndpointDraggingRef.current = false
			clearEditingState()
		}
	})

	// Stable fallback bounds to avoid creating new object on every render
	const emptyBounds = React.useMemo(() => ({ x: 0, y: 0, width: 0, height: 0 }), [])

	// Refs for resize/rotate callbacks to avoid recreating on every render
	// This prevents useResizable/useRotatable from re-triggering effects
	const selectedIdsRef = React.useRef(selectedIds)
	selectedIdsRef.current = selectedIds
	const idealloRef = React.useRef(ideallo)
	idealloRef.current = ideallo
	const broadcastEditingRef = React.useRef(broadcastEditing)
	broadcastEditingRef.current = broadcastEditing
	const clearEditingStateRef = React.useRef(clearEditingState)
	clearEditingStateRef.current = clearEditingState

	// Stable resize callbacks using refs
	const onResizeStart = React.useCallback(
		({ bounds }: { handle: ResizeHandle; bounds: Bounds }) => {
			const current = storedSelectionRef.current
			const doc = idealloRef.current.doc
			if (!current || !doc) return
			// Lock the hook state to prevent prop changes during resize
			setLockedHookState({
				bounds: current.bounds,
				rotation: current.rotation,
				pivotX: current.pivotX,
				pivotY: current.pivotY
			})
			// Store all selected objects for multi-object resize
			const originalObjects = new Map<ObjectId, IdealloObject>()
			selectedIdsRef.current.forEach((id) => {
				const obj = getObject(doc, id)
				if (obj) originalObjects.set(id, obj)
			})
			interactionStartRef.current = { ...current, originalObjects }
			setTempObjectState({
				objectId: current.id,
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: bounds.height,
				originalBounds: current.bounds
			})
		},
		[]
	)

	const onResize = React.useCallback(({ bounds }: { handle: ResizeHandle; bounds: Bounds }) => {
		const initial = interactionStartRef.current
		if (!initial) return
		setTempObjectState({
			objectId: initial.id,
			x: bounds.x,
			y: bounds.y,
			width: bounds.width,
			height: bounds.height,
			originalBounds: initial.bounds
		})
		broadcastEditingRef.current(
			initial.id,
			'resize',
			bounds.x,
			bounds.y,
			bounds.width,
			bounds.height
		)
	}, [])

	const onResizeEnd = React.useCallback(
		({
			bounds,
			originalBounds
		}: {
			handle: ResizeHandle
			bounds: Bounds
			originalBounds: Bounds
		}) => {
			const initial = interactionStartRef.current
			const { yDoc, doc } = idealloRef.current
			if (!initial || !yDoc || !doc) return

			// Calculate scale factors
			const scaleX = bounds.width / originalBounds.width
			const scaleY = bounds.height / originalBounds.height
			const dx = bounds.x - originalBounds.x
			const dy = bounds.y - originalBounds.y

			if (dx !== 0 || dy !== 0 || scaleX !== 1 || scaleY !== 1) {
				// Origin on the OUTER transaction: Yjs discards a nested one's, so the object and
				// geometry writes below would otherwise land untracked and a resize would not undo.
				yDoc.transact(() => {
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
							updateObjectFields(yDoc, doc, objectId, {
								x: objNewX,
								y: objNewY,
								width: Math.max(10, objNewWidth),
								height: Math.max(10, objNewHeight)
							})
						} else if (origObj.type === 'connector') {
							// Shared with the resize PREVIEW (applyBoundsOverride in Canvas.tsx) so
							// the two cannot map out of different source boxes and snap on release.
							// Null means fully bound: both terminals are derived, nothing to write.
							const patch = scaleConnectorTerminals(origObj, originalBounds, bounds)
							if (!patch) return
							updateObjectFields(yDoc, doc, objectId, patch)
						} else if (origObj.type === 'polygon') {
							// The preview scales the vertices (applyBoundsOverride in Canvas.tsx);
							// the commit has to WRITE them, or the shape snaps back to its original
							// outline on pointer-up. Same shape of fix as freehand below.
							updateObjectFields(yDoc, doc, objectId, {
								x: objNewX,
								y: objNewY
							})
							replaceGeometryPoints(
								yDoc,
								doc,
								objectId,
								scalePointsIntoBounds(origObj.vertices, originalBounds, bounds)
							)
						} else if (origObj.type === 'freehand') {
							const scaledPathData = scalePathData(origObj.pathData, scaleX, scaleY)
							updateObjectFields(yDoc, doc, objectId, {
								x: objNewX,
								y: objNewY,
								width: origObj.width * scaleX,
								height: origObj.height * scaleY
							})
							const stored = doc.o.get(objectId)
							if (stored && stored.t === 'F') {
								const pathKey = stored.pid ?? objectId
								doc.paths.set(pathKey, scaledPathData)
							}
						} else if (origObj.type === 'image') {
							// For single image selection, bounds are already aspect-constrained by hook
							// For multi-selection, use the dominant scale to maintain aspect ratio
							const origAspectRatio = origObj.width / origObj.height
							// Use the scale factor that had more proportional change
							const propChangeX = Math.abs(scaleX - 1)
							const propChangeY = Math.abs(scaleY - 1)
							const uniformScale = propChangeX >= propChangeY ? scaleX : scaleY
							const objNewWidth = origObj.width * uniformScale
							const objNewHeight = objNewWidth / origAspectRatio
							updateObjectFields(yDoc, doc, objectId, {
								x: objNewX,
								y: objNewY,
								width: Math.max(20, objNewWidth),
								height: Math.max(20, objNewHeight)
							})
						}
					})
				}, yDoc.clientID)
			}

			clearEditingStateRef.current()
			setTempObjectState(null)
			setLockedHookState(null)
			interactionStartRef.current = null
		},
		[]
	)

	// Resize hook - provides rotation-aware resize
	// Use lockedHookState during active interactions to prevent prop changes from re-triggering
	const { handleResizeStart: hookResizeStart } = useResizable({
		bounds: lockedHookState?.bounds ?? storedSelection?.bounds ?? emptyBounds,
		rotation: lockedHookState?.rotation ?? storedSelection?.rotation ?? 0,
		pivotX: lockedHookState?.pivotX ?? storedSelection?.pivotX ?? 0.5,
		pivotY: lockedHookState?.pivotY ?? storedSelection?.pivotY ?? 0.5,
		objectId: storedSelection?.id,
		transformCoordinates: resizeTransformCoordinates,
		// A fully bound connector's geometry is entirely derived, so there is nothing to resize. A
		// half-bound one keeps its free terminal, and onResizeEnd scales only that.
		disabled:
			isReadOnly ||
			ideallo.activeTool !== 'select' ||
			!storedSelection ||
			isFullyBoundConnector,
		aspectRatio: selectionAspectRatio,
		cornerAspectLock,
		onResizeStart,
		onResize,
		onResizeEnd
	})

	// Stable rotation callbacks using refs
	const onRotateStart = React.useCallback((_angle: number) => {
		const current = storedSelectionRef.current
		const doc = idealloRef.current.doc
		if (!current || !doc) return
		// Lock the hook state to prevent prop changes during rotation
		setLockedHookState({
			bounds: current.bounds,
			rotation: current.rotation,
			pivotX: current.pivotX,
			pivotY: current.pivotY
		})
		// Store all selected objects for multi-object rotation
		const originalObjects = new Map<ObjectId, IdealloObject>()
		selectedIdsRef.current.forEach((id) => {
			const obj = getObject(doc, id)
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
	}, [])

	const onRotate = React.useCallback((newRotation: number, _isSnapped: boolean) => {
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
		broadcastEditingRef.current(
			initial.id,
			'rotate',
			initial.bounds.x,
			initial.bounds.y,
			initial.bounds.width,
			initial.bounds.height,
			newRotation
		)
	}, [])

	const onRotateEnd = React.useCallback((finalRotation: number) => {
		const initial = interactionStartRef.current
		const { yDoc, doc } = idealloRef.current
		if (!initial || !yDoc || !doc) return

		const normalizedRotation = normalizeAngle(finalRotation)

		if (
			Math.abs(normalizedRotation - initial.rotation) > 0.5 ||
			normalizedRotation !== initial.rotation
		) {
			// Origin on the OUTER transaction, as for move and resize: Yjs discards a nested one's,
			// leaving the rotation absent from the undo stack.
			yDoc.transact(() => {
				initial.originalObjects.forEach((_origObj, objectId) => {
					updateObjectFields(yDoc, doc, objectId, {
						rotation: normalizedRotation === 0 ? undefined : normalizedRotation
					})
				})
			}, yDoc.clientID)
		}

		clearEditingStateRef.current()
		setTempObjectState(null)
		setLockedHookState(null)
		interactionStartRef.current = null
	}, [])

	// Rotation hook - provides rotation with snap zone
	// Use lockedHookState during active interactions to prevent prop changes from re-triggering
	const currentBounds = lockedHookState?.bounds ?? storedSelection?.bounds ?? emptyBounds
	const {
		rotationState,
		handleRotateStart: hookRotateStart,
		arcRadius,
		pivotPosition
	} = useRotatable({
		bounds: currentBounds,
		rotation: lockedHookState?.rotation ?? storedSelection?.rotation ?? 0,
		// Calculate screen-space arc radius to match the visual RotationHandle exactly
		screenArcRadius: calculateArcRadius({
			bounds: {
				x: 0,
				y: 0, // Position doesn't matter for arc radius calculation
				width: currentBounds.width * scale,
				height: currentBounds.height * scale
			},
			scale: 1 // Screen space, no additional scaling
		}),
		pivotX: lockedHookState?.pivotX ?? storedSelection?.pivotX ?? 0.5,
		pivotY: lockedHookState?.pivotY ?? storedSelection?.pivotY ?? 0.5,
		translateTo: translateToRef,
		translateFrom: translateFromRef,
		screenSpaceSnapZone: true,
		// ANY binding rules out rotation, not just a full one - see isBoundConnector in
		// connectors/resolve.ts: rotating a half-bound connector swings its bound terminal off the
		// shape it is welded to.
		disabled:
			isReadOnly ||
			ideallo.activeTool !== 'select' ||
			!storedSelection ||
			isBoundConnectorSelected,
		onRotateStart,
		onRotate,
		onRotateEnd
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

		// Single selection: the unrotated box, which SelectionBox rotates itself. Multi: the
		// rotated boxes, since the frame is drawn upright and must still enclose everything.
		const measure = selectedIds.size > 1 ? getRotatedObjectBounds : getObjectBounds

		selectedIds.forEach((id) => {
			// Resolved, not getObject: a connector must be measured on its ROUTE - see
			// resolvedObjectsById
			const obj = resolvedObjectsById.get(id)
			if (obj) {
				const bounds = measure(obj)
				// Apply drag offset if this object is being dragged
				const dx = dragOffset?.objectIds.has(id) ? dragOffset.dx : 0
				const dy = dragOffset?.objectIds.has(id) ? dragOffset.dy : 0
				minX = Math.min(minX, bounds.x + dx)
				minY = Math.min(minY, bounds.y + dy)
				maxX = Math.max(maxX, bounds.x + bounds.width + dx)
				maxY = Math.max(maxY, bounds.y + bounds.height + dy)
			}
		})

		if (minX === Infinity) return null

		return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
	}, [selectedIds, ideallo.doc, resolvedObjectsById, selectHandler.dragOffset, tempObjectState])

	// Same transform Canvas applies for its own fixed overlay layer
	const liveScreenSelectionBounds = React.useMemo<Bounds | null>(() => {
		if (!selectionBounds) return null
		const [s, , , , tx, ty] = canvasMatrix
		return {
			x: selectionBounds.x * s + tx,
			y: selectionBounds.y * s + ty,
			width: selectionBounds.width * s,
			height: selectionBounds.height * s
		}
	}, [selectionBounds, canvasMatrix])

	/**
	 * Pending resize/rotate geometry, handed to Canvas so connectors bound to the object being
	 * manipulated reroute live. Canvas merges this with its own drag offset.
	 */
	const geometryOverrides = React.useMemo<GeometryOverrides>(() => {
		if (!tempObjectState) return null
		return new Map([
			[
				tempObjectState.objectId,
				{
					bounds: {
						x: tempObjectState.x,
						y: tempObjectState.y,
						width: tempObjectState.width,
						height: tempObjectState.height
					},
					// Resize only; Canvas maps connector terminals out of this box, as the commit does
					originalBounds: tempObjectState.originalBounds,
					rotation: tempObjectState.rotation,
					// A pivot drag pairs a compensating translation with the new pivot. Sending
					// only the translation would leave the preview turning about the OLD pivot,
					// and the shape would visibly jump for the length of the drag.
					pivotX: tempObjectState.pivotX,
					pivotY: tempObjectState.pivotY
				}
			]
		])
	}, [tempObjectState])

	// Was an object literal at the call site, i.e. a new reference per render - which is exactly what
	// turns CanvasScene's memo off. Two primitive deps, so this cannot go stale.
	const currentStrokeStyle = React.useMemo(
		() => ({
			color: ideallo.currentStyle.strokeColor,
			width: ideallo.currentStyle.strokeWidth
		}),
		[ideallo.currentStyle.strokeColor, ideallo.currentStyle.strokeWidth]
	)

	/**
	 * The in-flight terminal drag, handed to Canvas so the connector redraws through the real
	 * routers on every pointer move instead of sitting at its committed geometry until release.
	 */
	const connectorEndpointPreview = React.useMemo<ConnectorEndpointPreview | null>(() => {
		const state = connectorDrag.dragState
		if (!state || !selectedArrow) return null
		return {
			arrowId: selectedArrow.id,
			terminal: state.terminal,
			point: state.point,
			bind: state.bind
		}
	}, [connectorDrag.dragState, selectedArrow])

	// Ref to track pivot dragging state - prevents object movement during pivot drag
	const isPivotDraggingRef = React.useRef(false)

	// A pivot drag nudges tempObjectState, which selectionBounds reads, so the property bar would
	// slide under the pointer. Frozen as of the press: one state flip per gesture, not per frame.
	const [isPivotDragging, setIsPivotDragging] = React.useState(false)
	const pivotFrozenBoundsRef = React.useRef<Bounds | null>(null)
	const liveScreenBoundsRef = useLatestRef(liveScreenSelectionBounds)

	const screenSelectionBounds = isPivotDragging
		? pivotFrozenBoundsRef.current
		: liveScreenSelectionBounds

	// Unified pointer handlers that route to the right tool
	const handlePointerDown = React.useCallback(
		(x: number, y: number, shiftKey: boolean = false, altKey: boolean = false) => {
			// A click on the canvas finishes whichever editor is open
			if (textEditor.editing) endTextEdit()

			if (
				ideallo.activeTool === 'select' &&
				!isPivotDraggingRef.current &&
				!isEndpointDraggingRef.current
			) {
				selectHandler.handlePointerDown(x, y, shiftKey, altKey)
			} else if (ideallo.activeTool === 'pen') {
				drawingHandler.handlePointerDown(x, y)
			} else if (ideallo.activeTool === 'eraser') {
				eraserHandler.handlePointerDown(x, y)
			} else if (isDragShapeTool(ideallo.activeTool)) {
				shapeHandler.handlePointerDown(x, y, altKey || altKeyRef.current)
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
			stickyHandler,
			textEditor,
			endTextEdit
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
			} else if (isDragShapeTool(ideallo.activeTool)) {
				shapeHandler.handlePointerMove(x, y, altKeyRef.current)
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
		} else if (isDragShapeTool(ideallo.activeTool)) {
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

	// --- Embed navState: restore viewport on load, push on pan/zoom ---
	const initialNavAppliedRef = React.useRef(false)
	const navPushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

	// Register viewstate.set handler once when embedded
	React.useEffect(() => {
		const bus = getAppBus()
		if (!bus.embedded) return

		bus.onViewStateSet((viewState?: string) => {
			if (!viewState) return
			const params = Object.fromEntries(
				viewState.split(';').map((p) => p.split('=') as [string, string])
			)
			const center = params.c?.split(',').map(Number)
			const zoom = params.z ? Number(params.z) : undefined
			if (
				center &&
				center.length === 2 &&
				!Number.isNaN(center[0]) &&
				!Number.isNaN(center[1])
			) {
				canvasRef.current?.setViewport(center[0], center[1], zoom ?? 1)
			}
		})

		// AppBus has no off/unregister for this - `onViewStateSet` is a bare field assignment on a
		// SINGLETON - so overwriting it with a no-op is the only way from inside the app to stop the
		// bus retaining this closure, and `canvasRef` with it, past unmount. A real
		// `offViewStateSet` in libs/core is the proper follow-up.
		return () => {
			bus.onViewStateSet(() => {})
		}
	}, [])

	// Restore initial navState once when embedded and synced
	React.useEffect(() => {
		const bus = getAppBus()
		if (!bus.embedded) return

		if (!initialNavAppliedRef.current && ideallo.cloudillo.synced) {
			const initialNav = bus.getState().navState
			if (initialNav) {
				const params = Object.fromEntries(
					initialNav.split(';').map((p) => p.split('=') as [string, string])
				)
				const center = params.c?.split(',').map(Number)
				const zoom = params.z ? Number(params.z) : undefined
				if (
					center &&
					center.length === 2 &&
					!Number.isNaN(center[0]) &&
					!Number.isNaN(center[1])
				) {
					requestAnimationFrame(() => {
						canvasRef.current?.setViewport(center[0], center[1], zoom ?? 1)
					})
				}
			}
			initialNavAppliedRef.current = true
		}
	}, [ideallo.cloudillo.synced])

	// Push viewport changes to parent (debounced)
	const handleMatrixChange = React.useCallback(
		(matrix: [number, number, number, number, number, number]) => {
			// Above the embed check: that only gates the navState push, never the matrix mirror.
			// Canvas value-guards this callback, so it fires on real pan/zoom only.
			canvasMatrixRef.current = matrix
			// Only liveScreenSelectionBounds reads the state, and only when something is selected.
			// Skipping the write is what keeps an empty-selection pan from re-rendering the whole app.
			if (hasSelectionRef.current) setCanvasMatrix(matrix)

			const bus = getAppBus()
			if (!bus.embedded) return

			if (navPushTimerRef.current) clearTimeout(navPushTimerRef.current)
			navPushTimerRef.current = setTimeout(() => {
				const svg = document.querySelector('.ideallo-app svg')
				if (!svg) return
				const rect = svg.getBoundingClientRect()
				const zoom = matrix[0]
				const centerX = (rect.width / 2 - matrix[4]) / zoom
				const centerY = (rect.height / 2 - matrix[5]) / zoom
				const navState = `c=${centerX.toFixed(0)},${centerY.toFixed(0)};z=${zoom.toFixed(2)}`
				bus.pushViewState({ viewState: navState })
			}, 500)
		},
		[hasSelectionRef]
	)

	// Handle pivot drag start
	const handlePivotDragStart = React.useCallback(() => {
		isPivotDraggingRef.current = true
		pivotFrozenBoundsRef.current = liveScreenBoundsRef.current
		setIsPivotDragging(true)
	}, [liveScreenBoundsRef])

	// Handle pivot drag (update temp state for visual feedback)
	const handlePivotDrag = React.useCallback(
		(pivot: { x: number; y: number }, compensation: { x: number; y: number }) => {
			if (selectedIds.size !== 1 || !ideallo.doc) return
			const objectId = Array.from(selectedIds)[0]
			const obj = getObject(ideallo.doc, objectId)
			if (!obj) return

			const bounds = getObjectBounds(obj)
			if (!bounds) return

			setTempObjectState({
				objectId,
				x: bounds.x + compensation.x,
				y: bounds.y + compensation.y,
				width: bounds.width,
				height: bounds.height,
				rotation: obj.rotation,
				pivotX: pivot.x,
				pivotY: pivot.y
			})
		},
		[selectedIds, ideallo.doc, setTempObjectState]
	)

	// Handle pivot commit from usePivotDrag hook
	const handlePivotCommit = React.useCallback(
		(finalPivot: { x: number; y: number }, compensation: { x: number; y: number }) => {
			const { yDoc, doc } = ideallo
			if (selectedIds.size !== 1 || !yDoc || !doc) {
				isPivotDraggingRef.current = false
				setIsPivotDragging(false)
				setTempObjectState(null)
				return
			}
			const objectId = Array.from(selectedIds)[0]
			const obj = getObject(doc, objectId)
			if (!obj) {
				isPivotDraggingRef.current = false
				setIsPivotDragging(false)
				setTempObjectState(null)
				return
			}

			yDoc.transact(() => {
				// The compensation is a real MOVE - for a polygon that means the vertex array, not
				// the inert xy - so it goes through translateObject rather than being folded into
				// the pivot write. Kept as two writes because a fully bound connector's early
				// return inside translateObject would otherwise swallow the pivot too.
				translateObject(yDoc, doc, objectId, obj, compensation.x, compensation.y)
				updateObjectFields(yDoc, doc, objectId, {
					pivotX: finalPivot.x,
					pivotY: finalPivot.y
				})
			}, yDoc.clientID)
			isPivotDraggingRef.current = false
			setIsPivotDragging(false)
			setTempObjectState(null)
		},
		[selectedIds, ideallo, setTempObjectState]
	)

	/**
	 * "Connect selected" (C): make connectors between the selected shapes, pairwise in
	 * selection order. Sets are insertion-ordered, so selection order gives the direction.
	 */
	const connectSelected = React.useCallback(() => {
		if (isReadOnly || !ideallo.yDoc || !ideallo.doc || selectedIds.size < 2) return
		const created = connectObjects(ideallo.yDoc, ideallo.doc, Array.from(selectedIds), {
			style: {
				strokeColor: ideallo.currentStyle.strokeColor,
				fillColor: 'transparent',
				strokeWidth: ideallo.currentStyle.strokeWidth,
				strokeStyle: DEFAULT_STYLE.strokeStyle,
				opacity: DEFAULT_STYLE.opacity
			},
			routing: ideallo.currentStyle.routing,
			startArrow: ideallo.currentStyle.startArrow,
			endArrow: ideallo.currentStyle.endArrow
		})
		// Select what was made, so the PropertyBar is immediately about the new connector
		if (created.length) selectObjects(created)
	}, [isReadOnly, ideallo.yDoc, ideallo.doc, ideallo.currentStyle, selectObjects, selectedIds])

	/**
	 * The four z-order commands, in one transaction so reordering N objects is ONE undo - the same
	 * rule every other multi-object action follows (see PropertyBar's updateSelectedStyle).
	 *
	 * The backward/to-back directions iterate in reverse so the selection keeps its own relative
	 * z-order instead of being inverted by the walk.
	 */
	const applyZOrder = React.useCallback(
		(action: 'front' | 'forward' | 'backward' | 'back') => {
			const yDoc = ideallo.yDoc
			const doc = ideallo.doc
			if (isReadOnly || !yDoc || !doc || !selectedIds.size) return
			const ids = Array.from(selectedIds)
			const ordered = action === 'front' || action === 'forward' ? ids : ids.reverse()
			const op = {
				front: bringToFront,
				forward: bringForward,
				backward: sendBackward,
				back: sendToBack
			}[action]
			yDoc.transact(() => {
				ordered.forEach((id) => {
					op(yDoc, doc, id)
				})
			}, yDoc.clientID)
		},
		[isReadOnly, ideallo.yDoc, ideallo.doc, selectedIds]
	)

	/*
	 * Keyboard shortcuts, gated in two tiers (see utils/editable-target.ts).
	 *
	 * A keystroke aimed at a text field is never a shortcut, so `isEditableTarget` bails on
	 * everything. An open popover is narrower: it suppresses only what would act on the panel's own
	 * context - the tool letters, Enter/F2 and Escape - while undo, zoom, duplicate and delete stay
	 * live, since the width, opacity and radius pickers leave their panel open on purpose.
	 */
	const handleKeyDown = React.useCallback(
		(evt: KeyboardEvent) => {
			if (isEditableTarget(evt.target)) return
			const popoverOpen = isPopoverOpen()

			// Cmd/Ctrl+Z for undo
			if (!isReadOnly && (evt.ctrlKey || evt.metaKey) && evt.key === 'z' && !evt.shiftKey) {
				handleUndo()
				evt.preventDefault()
			}
			// Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y for redo
			if (
				!isReadOnly &&
				(evt.ctrlKey || evt.metaKey) &&
				(evt.key === 'y' || (evt.key === 'z' && evt.shiftKey))
			) {
				handleRedo()
				evt.preventDefault()
			}

			// Zoom shortcuts, unmodified only: Ctrl/Cmd +/-/0 are the browser's own zoom and must
			// reach it, and Alt is the precise-anchor modifier held during a connector gesture.
			if (!evt.ctrlKey && !evt.metaKey && !evt.altKey) {
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
			}

			// Tool shortcuts (disabled in read-only mode, and while a popover is open - arming a
			// tool out from under an open panel is never what the letter was meant for).
			// Alt and Shift are excluded too: Alt is the precise-anchor modifier held DURING a
			// connector gesture, and switching tools out from under that gesture is never wanted.
			// Caps Lock does not set shiftKey, so capitals-on users still match below.
			if (
				!isReadOnly &&
				!popoverOpen &&
				!evt.ctrlKey &&
				!evt.metaKey &&
				!evt.altKey &&
				!evt.shiftKey
			) {
				// The catalog owns the key bindings, so a new tool arrives here as a data edit
				const key = evt.key.toLowerCase()
				const keyed = TOOL_BY_KEY[key]
				if (keyed) {
					ideallo.setActiveTool(keyed)
				} else if (key === 'c') {
					// "Connect selected" - the keyboard path to a connector, and the non-dragging
					// alternative WCAG 2.2 SC 2.5.7 requires for creation. Not a tool.
					connectSelected()
				} else if (key === 'q') {
					// Keep the active tool armed - keyboard route to the same mode as the
					// double-click gesture, which misses the shapes behind the flyout.
					ideallo.setToolLocked((locked) => !locked)
				}
			}

			/*
			 * Ctrl+D duplicates the selection. There is no copy/paste anywhere in this app, so this
			 * is the ONLY keyboard route to a copy. Browsers bind Ctrl+D to "bookmark", hence the
			 * preventDefault.
			 */
			if (!isReadOnly && (evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'd') {
				// Unconditionally: the app has claimed this chord, so the browser's bookmark
				// dialog must not appear even when there is nothing to duplicate.
				evt.preventDefault()
				if (selectedIds.size > 0 && ideallo.yDoc && ideallo.doc) {
					const created: ObjectId[] = []
					ideallo.yDoc.transact(() => {
						selectedIds.forEach((id) => {
							const newId = duplicateObject(ideallo.yDoc, ideallo.doc, id)
							if (newId) created.push(newId)
						})
					}, ideallo.yDoc.clientID)
					if (created.length) selectObjects(created)
				}
			}

			// Z-order shortcuts: Ctrl+] / Ctrl+Shift+] / Ctrl+[ / Ctrl+Shift+[
			if (!isReadOnly && (evt.ctrlKey || evt.metaKey) && evt.key === ']') {
				if (selectedIds.size > 0 && ideallo.yDoc && ideallo.doc) {
					applyZOrder(evt.shiftKey ? 'front' : 'forward')
					evt.preventDefault()
				}
			}
			if (!isReadOnly && (evt.ctrlKey || evt.metaKey) && evt.key === '[') {
				if (selectedIds.size > 0 && ideallo.yDoc && ideallo.doc) {
					applyZOrder(evt.shiftKey ? 'back' : 'backward')
					evt.preventDefault()
				}
			}

			// Delete selected objects
			if (!isReadOnly && (evt.key === 'Delete' || evt.key === 'Backspace')) {
				if (
					selectedIds.size > 0 &&
					ideallo.activeTool === 'select' &&
					ideallo.yDoc &&
					ideallo.doc
				) {
					// Locked members are skipped, so an all-locked selection deletes nothing
					const deletable = deletableObjectIds(ideallo.doc, Array.from(selectedIds))
					if (deletable.length > 0) {
						deleteObjectsWithBindingCleanup(ideallo.yDoc, ideallo.doc, deletable)
						clearSelection()
					}
				}
				// Always swallow the key: Backspace must never navigate the iframe back
				evt.preventDefault()
			}

			/*
			 * Enter (or F2) steps INTO the selected text object or sticky, with the caret at the
			 * end - the mirror of the Escape that steps back out of it.
			 */
			if (!isReadOnly && !popoverOpen && (evt.key === 'Enter' || evt.key === 'F2')) {
				// Enter on a focused toolbar button is that button being pressed, not an edit. The
				// popover guard covers the rest of a panel: a row that is not a button would
				// otherwise drop the user into a text edit from inside an open picker.
				const target = evt.target as HTMLElement | null
				if (target?.closest?.('button, [role="button"], a[href]')) return
				if (selectedIds.size === 1 && ideallo.doc) {
					const obj = getObject(ideallo.doc, Array.from(selectedIds)[0])
					if (obj && isTextBearing(obj.type)) {
						textEditor.startEditing(obj)
						evt.preventDefault()
						return
					}
				}
			}

			/*
			 * Escape unwinds one level at a time: whatever is in flight first, then the tool,
			 * then the selection. First match wins.
			 */
			if (evt.key === 'Escape') {
				// An open popover closes itself through its own useEscapeKey. Unwinding the tool or
				// the selection here as well would skip two levels on one press.
				if (popoverOpen) return
				// An endpoint drag cancels itself via its own window listener, so Escape must
				// not also drop the selection out from under it
				if (connectorDrag.isDragging) return
				if (shapeHandler.shapePreview) {
					shapeHandler.cancelPreview()
					return
				}
				/*
				 * The fallback for when focus has drifted out of an open editor (inside Quill the
				 * editable guard above bails). It SAVES, matching the Escape inside the editor:
				 * every keystroke is already in the CRDT, so Ctrl+Z is the only coherent rollback.
				 */
				if (textEditor.editing) {
					endTextEdit()
					return
				}
				if (ideallo.activeTool !== 'select') {
					ideallo.setActiveTool('select')
					return
				}
				clearSelection()
			}
		},
		[
			isReadOnly,
			handleUndo,
			handleRedo,
			ideallo.setActiveTool,
			ideallo.setToolLocked,
			selectedIds,
			selectObjects,
			ideallo.yDoc,
			ideallo.activeTool,
			clearSelection,
			connectorDrag.isDragging,
			connectSelected,
			applyZOrder,
			handleZoomIn,
			handleZoomOut,
			handleZoomReset,
			shapeHandler.shapePreview,
			shapeHandler.cancelPreview,
			ideallo.doc,
			textEditor,
			endTextEdit
		]
	)

	/**
	 * Shortcuts live on the window, not on the app div: a div-scoped handler needs the div itself
	 * to be the event target, so every shortcut dies the moment a toolbar button takes focus.
	 *
	 * Registered once through a ref, not re-bound per render: listener order decides the Escape
	 * race against the connector drag's own listener, and it must be deterministic.
	 */
	const keyHandlerRef = useLatestRef(handleKeyDown)

	React.useEffect(() => {
		const onKey = (evt: KeyboardEvent) => keyHandlerRef.current(evt)
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	// Throttled cursor position broadcast
	const cursorThrottleRef = React.useRef<number | null>(null)
	const handleCursorMove = React.useCallback(
		(x: number, y: number) => {
			// Update hover state when select tool is active (skip during pivot drag)
			if (
				ideallo.activeTool === 'select' &&
				!isPivotDraggingRef.current &&
				!isEndpointDraggingRef.current
			) {
				selectHandler.handlePointerMove(x, y)
			}
			// Update eraser position on hover (not just during active erasing)
			if (ideallo.activeTool === 'eraser') {
				eraserHandler.handlePointerMove(x, y)
			}
			// Connector drop-target highlight. Deliberately ABOVE the throttle below: that
			// throttle is for the awareness broadcast, and running the local highlight at 20 Hz
			// feels laggy.
			if (ideallo.activeTool === 'connector') {
				shapeHandler.handleHover(x, y, altKeyRef.current)
			}

			if (!ideallo.awareness || cursorThrottleRef.current) return

			cursorThrottleRef.current = window.setTimeout(() => {
				cursorThrottleRef.current = null
				ideallo.awareness?.setLocalStateField('cursor', { x, y })
			}, CURSOR_BROADCAST_THROTTLE_MS)
		},
		[ideallo.awareness, ideallo.activeTool, selectHandler, eraserHandler, shapeHandler]
	)

	/**
	 * Putting a tool away abandons whatever that tool had in flight - a half-dragged shape (and
	 * the awareness ghost remotes are drawing from it), the connector drop-target highlight.
	 *
	 * Deliberately NOT the sticky / text editors: those belong to an object, are reachable by
	 * double-click under the Select tool, and are opened by the very tool change that a one-shot
	 * sticky or text placement performs.
	 */
	React.useEffect(() => {
		shapeHandler.cancelPreview()
		if (ideallo.activeTool !== 'connector') shapeHandler.clearHover()
	}, [ideallo.activeTool])

	/**
	 * Tool state for screen readers. A sighted user watches the toolbar highlight move when a
	 * one-shot tool hands itself back, so the revert is phrased explicitly rather than just naming
	 * the new tool.
	 */
	const [announcement, setAnnouncement] = React.useState('')
	const prevToolRef = React.useRef(ideallo.activeTool)

	React.useEffect(() => {
		const prev = prevToolRef.current
		const tool = ideallo.activeTool
		if (prev === tool) return
		prevToolRef.current = tool
		setAnnouncement(
			tool === 'select' && isOneShotTool(prev)
				? `${TOOL_LABELS[prev]} placed. Select tool active.`
				: `${TOOL_LABELS[tool]} tool active.`
		)
	}, [ideallo.activeTool])

	const lockAnnounceRef = React.useRef(false)
	React.useEffect(() => {
		if (!lockAnnounceRef.current) {
			lockAnnounceRef.current = true
			return
		}
		setAnnouncement(`Keep tool active: ${ideallo.toolLocked ? 'on' : 'off'}`)
	}, [ideallo.toolLocked])

	// Cleanup throttle on unmount
	React.useEffect(() => {
		return () => {
			if (cursorThrottleRef.current) {
				clearTimeout(cursorThrottleRef.current)
			}
		}
	}, [])

	// Same for the pan debounce: a pan followed by leaving the document inside 500ms would
	// otherwise push a view state for a document the user is no longer in.
	React.useEffect(() => {
		return () => {
			if (navPushTimerRef.current !== null) {
				clearTimeout(navPushTimerRef.current)
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
		<div className="ideallo-app" data-tool={ideallo.activeTool} tabIndex={0}>
			{/* Canvas */}
			{/* Every prop below must be a stable reference or a primitive: Canvas passes most of them
			    straight into the memoised CanvasScene, and one inline arrow or object literal here
			    silently turns that memo off for the whole board. See CanvasScene.tsx. */}
			<Canvas
				ref={canvasRef}
				doc={ideallo.doc}
				objects={ideallo.objects}
				order={ideallo.order}
				textContent={ideallo.textContent}
				activeStroke={drawingHandler.activeStroke}
				shapePreview={shapeHandler.shapePreview}
				connectorTarget={shapeHandler.connectorTarget ?? connectorDrag.dragState?.target}
				connectorDragTerminal={connectorDrag.dragState?.terminal ?? null}
				connectorEndpointPreview={connectorEndpointPreview}
				mobileHandles={isMobile}
				onConnectorEndpointPointerDown={
					isReadOnly ? undefined : connectorDrag.handlePointerDown
				}
				remotePresence={ideallo.remotePresence}
				activeTool={ideallo.activeTool}
				selectedIds={selectedIds}
				selectionBounds={selectionBounds}
				selectedObjectRotation={tempObjectState?.rotation ?? selectedObjectRotation}
				selectedObjectPivotX={tempObjectState?.pivotX ?? selectedObjectPivotX}
				selectedObjectPivotY={tempObjectState?.pivotY ?? selectedObjectPivotY}
				dragOffset={selectHandler.dragOffset}
				geometryOverrides={geometryOverrides}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onCursorMove={handleCursorMove}
				// Text editing - one slot for stickies, labels and shape captions alike
				editing={textEditor.editing}
				onEditSave={endTextEdit}
				onEditHeightChange={handleEditHeightChange}
				onObjectDoubleClick={!isReadOnly ? handleObjectDoubleClick : undefined}
				shouldIgnoreEditorBlur={shouldIgnoreEditorBlur}
				quillRef={quillRef}
				onScaleChange={setScale}
				onMatrixChange={handleMatrixChange}
				onContextReady={handleContextReady}
				// Pass hook handlers for resize/rotate
				onResizeStart={hookResizeStart}
				onRotateStart={hookRotateStart}
				isRotating={isRotating}
				isSnapActive={isSnapActive}
				rotationState={rotationState}
				arcRadius={arcRadius}
				pivotPosition={pivotPosition}
				pivotOriginalBounds={storedSelection?.bounds ?? null}
				onPivotDragStart={!isReadOnly ? handlePivotDragStart : undefined}
				onPivotDrag={!isReadOnly ? handlePivotDrag : undefined}
				onPivotCommit={!isReadOnly ? handlePivotCommit : undefined}
				// Smart Ink
				morphAnimations={morphAnimations}
				snappedHints={snappedHints}
				onUndoSnapped={handleUndoSnapped}
				currentStrokeStyle={currentStrokeStyle}
				// Eraser tool
				eraserPosition={eraserHandler.eraserPosition}
				eraserRadius={eraserHandler.canvasRadius}
				eraserHighlightedIds={eraserHandler.highlightedIds}
				isErasing={eraserHandler.isErasing}
				onEraserLeave={eraserHandler.handlePointerLeave}
				// Hover effect (use eraser's hover when eraser tool is active)
				hoveredId={
					ideallo.activeTool === 'eraser'
						? eraserHandler.hoveredId
						: selectHandler.hoveredId
				}
				onPointerLeave={selectHandler.handlePointerLeave}
				// Stacked move highlight
				stackedHighlightIds={selectHandler.stackedHighlightIds}
				// Image loading
				ownerTag={ideallo.cloudillo.ownerTag}
				token={ideallo.cloudillo.token}
				sourceFileId={ideallo.cloudillo.fileId}
				activeDocumentId={activeDocumentId}
				onDocumentActivate={
					ideallo.cloudillo.access !== 'read' ? setActiveDocumentId : undefined
				}
				onDocumentViewStateChange={!isReadOnly ? handleDocumentViewStateChange : undefined}
				readOnly={isReadOnly}
			/>

			{/* Toolbar */}
			{!isReadOnly && (
				<Toolbar
					activeTool={ideallo.activeTool}
					canUndo={ideallo.canUndo}
					canRedo={ideallo.canRedo}
					hasSelection={selectedIds.size > 0}
					toolLocked={ideallo.toolLocked}
					onToolChange={ideallo.setActiveTool}
					onToolLockChange={ideallo.setToolLocked}
					onUndo={handleUndo}
					onRedo={handleRedo}
					onExport={() => {
						if (ideallo.yDoc && ideallo.doc) {
							downloadExport(ideallo.yDoc, ideallo.doc)
						}
					}}
					onBringToFront={() => applyZOrder('front')}
					onBringForward={() => applyZOrder('forward')}
					onSendBackward={() => applyZOrder('backward')}
					onSendToBack={() => applyZOrder('back')}
				/>
			)}

			{/* Property bar for selection styling */}
			{!isReadOnly && ideallo.doc && (
				<PropertyBar
					yDoc={ideallo.yDoc}
					doc={ideallo.doc}
					objects={ideallo.objects}
					selectedIds={selectedIds}
					screenBounds={screenSelectionBounds}
					rotation={selectedObjectRotation}
					currentStyle={ideallo.currentStyle}
					onCurrentStyleChange={(updates) => {
						ideallo.setCurrentStyle((prev) => ({ ...prev, ...updates }))
					}}
					quillRef={quillRef}
					isTextEditing={!!textEditor.editing}
					resolvedObjects={resolvedObjects}
					onClearSelection={clearSelection}
					onSelectObjects={selectObjects}
				/>
			)}

			{/* Zoom controls */}
			<ZoomControls
				scale={scale}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onZoomReset={handleZoomReset}
			/>

			{/* Tool announcements. Lives outside the Toolbar, which read-only mode unmounts. */}
			<div className="ideallo-sr-only" role="status" aria-live="polite">
				{announcement}
			</div>

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

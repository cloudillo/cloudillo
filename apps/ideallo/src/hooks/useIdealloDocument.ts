// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Main hook for Ideallo document state
 * Simpler than prezillo - no views/containers, just a flat object list
 */

import { useCloudilloEditor } from '@cloudillo/react'
import * as React from 'react'
import { useY } from 'react-yjs'
import type { Awareness } from 'y-protocols/awareness'
import { QuillBinding } from 'y-quill'
import * as Y from 'yjs'

import type {
	ArrowStyle,
	Routing,
	StoredObject,
	TextAlign,
	VerticalAlign,
	YIdealloDocument
} from '../crdt/index.js'
import {
	DEFAULT_END_ARROW,
	DEFAULT_ROUTING,
	DEFAULT_START_ARROW,
	getOrCreateDocument
} from '../crdt/index.js'
import { canKeepActive } from '../tools/index.js'
import type { ShapePreview, ToolType } from '../tools/types.js'
import { str2color } from '../utils/index.js'

export interface IdealloPresence {
	user: {
		name: string
		color: string
	}
	cursor?: {
		x: number
		y: number
	}
	drawing?: {
		strokeId: string
		points: [number, number][]
		style: {
			color: string
			width: number
		}
	}
	shape?: ShapePreview
	editing?: {
		objectIds: string[]
		// 'connector' is a terminal being dragged on an existing arrow
		action: 'drag' | 'resize' | 'rotate' | 'connector'
		dx: number
		dy: number
	}
}

/**
 * Defaults applied to newly drawn objects.
 *
 * The connector and text fields ride along with the colours so the last-used routing mode,
 * arrowhead shapes, font, size and alignment persist across draws, exactly as the last-used
 * stroke colour does.
 *
 * The text fields start undefined rather than at a value: each creation site falls back to its
 * own per-type default (a sticky is 18px, a text label 16px), and only a deliberate pick in the
 * property bar overrides that.
 */
export interface CurrentStyle {
	strokeColor: string
	fillColor: string
	strokeWidth: number
	routing?: Routing
	startArrow?: ArrowStyle
	endArrow?: ArrowStyle
	fontFamily?: string
	fontSize?: number
	textAlign?: TextAlign
	verticalAlign?: VerticalAlign
}

export interface UseIdealloDocumentResult {
	// Cloudillo context
	cloudillo: ReturnType<typeof useCloudilloEditor>

	// CRDT document
	yDoc: Y.Doc
	doc: YIdealloDocument

	// Reactive data (re-renders on change)
	objects: Record<string, StoredObject> | null
	order: string[] | null // z-order array (backmost first)
	textContent: Record<string, string> | null // Text content (serialized), triggers re-render on changes

	// Canvas navigation
	canvasOffset: { x: number; y: number }
	setCanvasOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
	canvasZoom: number
	setCanvasZoom: React.Dispatch<React.SetStateAction<number>>

	// Tool state
	activeTool: ToolType
	setActiveTool: React.Dispatch<React.SetStateAction<ToolType>>
	/** Keep the active tool armed after a placement instead of reverting to Select */
	toolLocked: boolean
	setToolLocked: React.Dispatch<React.SetStateAction<boolean>>

	// Current style for new objects
	currentStyle: CurrentStyle
	setCurrentStyle: React.Dispatch<React.SetStateAction<CurrentStyle>>

	// Undo/redo
	undoManager: Y.UndoManager | null
	canUndo: boolean
	canRedo: boolean
	undo: () => void
	redo: () => void

	// Awareness/presence
	awareness: Awareness | null
	remotePresence: Map<number, IdealloPresence>
}

const APP_NAME = 'ideallo'

export function useIdealloDocument(): UseIdealloDocumentResult {
	const cloudillo = useCloudilloEditor(APP_NAME)

	// Get document structure (without initializing defaults)
	const doc = React.useMemo(() => getOrCreateDocument(cloudillo.yDoc, false), [cloudillo.yDoc])

	// Initialize document with defaults only after sync completes
	React.useEffect(() => {
		if (cloudillo.synced) {
			getOrCreateDocument(cloudillo.yDoc, true)
		}
	}, [cloudillo.yDoc, cloudillo.synced])

	// Observe reactive CRDT data
	// useY uses observeDeep, so it should trigger on nested Y.Text changes too
	const objects = useY(doc.o)
	const order = useY(doc.r)
	const textContent = useY(doc.txt)

	// Canvas navigation state
	const [canvasOffset, setCanvasOffset] = React.useState({ x: 0, y: 0 })
	const [canvasZoom, setCanvasZoom] = React.useState(1)

	// Tool state - default to select
	const [activeTool, setActiveTool] = React.useState<ToolType>('select')
	const [toolLocked, setToolLocked] = React.useState(false)

	/*
	 * The lock decays when it stops applying, so it can never sit on invisibly with no tool wearing
	 * its badge. Keyed on activeTool ALONE, deliberately: toggling the lock on while Select is armed
	 * is the "arm the mode, then pick a tool" flow and must survive - only a tool CHANGE clears it.
	 */
	React.useEffect(() => {
		if (!canKeepActive(activeTool)) setToolLocked(false)
	}, [activeTool])

	// Current style for new objects (using palette keys for theme support)
	const [currentStyle, setCurrentStyle] = React.useState<CurrentStyle>({
		strokeColor: 'n0', // Black/dark neutral
		fillColor: 'transparent',
		strokeWidth: 2,
		routing: DEFAULT_ROUTING,
		startArrow: { ...DEFAULT_START_ARROW },
		endArrow: { ...DEFAULT_END_ARROW }
	})

	/*
	 * Undo manager - tracks objects, order, text content, geometry, and paths.
	 *
	 * QuillBinding is in there as a CLASS: y-quill commits with the binding instance as the
	 * transaction origin, and UndoManager matches `trackedOrigins.has(origin.constructor)` as well
	 * as the origin itself. Without it, typing inside a sticky or a text label is invisible to
	 * Ctrl+Z - which, since Escape now commits rather than discards, would leave typed text with no
	 * way back at all. Remote edits are unaffected: they arrive with the network provider as
	 * origin, never a local binding.
	 *
	 * The default 500ms captureTimeout is what gives undo its word-sized granularity here.
	 */
	const undoManager = React.useMemo(() => {
		return new Y.UndoManager([doc.o, doc.r, doc.txt, doc.geo, doc.paths], {
			trackedOrigins: new Set<unknown>([cloudillo.yDoc.clientID, QuillBinding])
		})
	}, [cloudillo.yDoc, doc])

	/*
	 * Tear the manager down with the component - and with any yDoc/doc identity change, since the
	 * memo above then builds a replacement.
	 *
	 * A UndoManager registers an `afterTransaction` observer on the Y.Doc plus one observer per
	 * tracked type. Left alone, a discarded manager keeps observing a live document and keeps its
	 * whole undo/redo stack (every deleted object it could restore) reachable, for as long as the
	 * document lives. destroy() unregisters all of it and clears the stacks.
	 */
	React.useEffect(() => () => undoManager.destroy(), [undoManager])

	/*
	 * After sync, clientID may change (a reused clientId is assigned post-sync in openYDoc), so the
	 * new one has to be tracked or local edits stop landing on the undo stack.
	 *
	 * The PREVIOUS id is removed on cleanup. trackedOrigins is a plain Set that only ever grew:
	 * without this, a doc that re-synced repeatedly accumulated one dead clientID per sync, each of
	 * them a live match for any transaction a future peer happens to open under that id.
	 */
	React.useEffect(() => {
		if (!cloudillo.synced) return
		const clientID = cloudillo.yDoc.clientID
		if (undoManager.trackedOrigins.has(clientID)) return
		undoManager.trackedOrigins.add(clientID)
		return () => {
			undoManager.trackedOrigins.delete(clientID)
		}
	}, [cloudillo.synced, cloudillo.yDoc, undoManager])

	const [canUndo, setCanUndo] = React.useState(false)
	const [canRedo, setCanRedo] = React.useState(false)

	// Update undo/redo state
	React.useEffect(() => {
		const updateState = () => {
			setCanUndo(undoManager.undoStack.length > 0)
			setCanRedo(undoManager.redoStack.length > 0)
		}

		undoManager.on('stack-item-added', updateState)
		undoManager.on('stack-item-popped', updateState)
		undoManager.on('stack-cleared', updateState)

		return () => {
			undoManager.off('stack-item-added', updateState)
			undoManager.off('stack-item-popped', updateState)
			undoManager.off('stack-cleared', updateState)
		}
	}, [undoManager])

	const undo = React.useCallback(() => {
		undoManager.undo()
	}, [undoManager])

	const redo = React.useCallback(() => {
		undoManager.redo()
	}, [undoManager])

	// Remote presence state
	const [remotePresence, setRemotePresence] = React.useState<Map<number, IdealloPresence>>(
		new Map()
	)

	// Get awareness instance
	const awareness = cloudillo.provider?.awareness ?? null

	// Set up awareness with consistent user color
	React.useEffect(() => {
		if (!awareness || !cloudillo.idTag) return

		str2color(cloudillo.idTag).then((color) => {
			awareness.setLocalStateField('user', {
				name: cloudillo.displayName || cloudillo.idTag || 'Anonymous',
				color
			})
		})
	}, [awareness, cloudillo.idTag, cloudillo.displayName])

	// Listen for awareness changes from remote clients
	// IMPORTANT: Only update state when content actually changes to avoid
	// triggering re-renders during resize/rotate (which broadcast local awareness)
	// Note: We use JSON comparison because awareness.getStates() returns new object
	// references on every call, even when the content hasn't changed.
	const remotePresenceRef = React.useRef<string>('')

	React.useEffect(() => {
		if (!awareness) return

		const handler = () => {
			const states = awareness.getStates()
			const localClientId = awareness.clientID
			const newPresence = new Map<number, IdealloPresence>()

			states.forEach((state: Record<string, unknown>, clientId: number) => {
				if (clientId !== localClientId && state) {
					newPresence.set(clientId, state as unknown as IdealloPresence)
				}
			})

			// Serialize for comparison (awareness states are new objects each time)
			const serialized = JSON.stringify(Array.from(newPresence.entries()))
			if (serialized !== remotePresenceRef.current) {
				remotePresenceRef.current = serialized
				setRemotePresence(newPresence)
			}
		}

		// Initial state
		handler()

		awareness.on('change', handler)
		return () => awareness.off('change', handler)
	}, [awareness])

	return {
		cloudillo,
		yDoc: cloudillo.yDoc,
		doc,

		// Reactive data
		objects,
		order,
		textContent,

		// Canvas navigation
		canvasOffset,
		setCanvasOffset,
		canvasZoom,
		setCanvasZoom,

		// Tools
		activeTool,
		setActiveTool,
		toolLocked,
		setToolLocked,

		// Current style
		currentStyle,
		setCurrentStyle,

		// Undo/redo
		undoManager,
		canUndo,
		canRedo,
		undo,
		redo,

		// Awareness/presence
		awareness,
		remotePresence
	}
}

// vim: ts=4

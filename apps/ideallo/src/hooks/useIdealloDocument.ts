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
 * Main hook for Ideallo document state
 * Simpler than prezillo - no views/containers, just a flat object list
 */

import * as React from 'react'
import * as Y from 'yjs'
import { useY } from 'react-yjs'
import { useCloudilloEditor } from '@cloudillo/react'

import type { Awareness } from 'y-protocols/awareness'

import type { ObjectId, YIdealloDocument, StoredObject } from '../crdt/index.js'
import { getOrCreateDocument } from '../crdt/index.js'
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
	shape?: {
		type: 'rect' | 'ellipse' | 'line' | 'arrow'
		startX: number
		startY: number
		endX: number
		endY: number
		style: {
			strokeColor: string
			fillColor: string
			strokeWidth: number
		}
	}
	editing?: {
		objectIds: string[]
		action: 'drag' | 'resize' | 'rotate'
		dx: number
		dy: number
	}
}

export interface UseIdealloDocumentResult {
	// Cloudillo context
	cloudillo: ReturnType<typeof useCloudilloEditor>

	// CRDT document
	yDoc: Y.Doc
	doc: YIdealloDocument

	// Reactive data (re-renders on change)
	objects: Record<string, StoredObject> | null

	// Selection
	selectedIds: Set<ObjectId>
	setSelectedIds: React.Dispatch<React.SetStateAction<Set<ObjectId>>>
	selectObject: (id: ObjectId, addToSelection?: boolean) => void
	selectObjects: (ids: ObjectId[], addToSelection?: boolean) => void
	deselectObject: (id: ObjectId) => void
	clearSelection: () => void
	isSelected: (id: ObjectId) => boolean

	// Canvas navigation
	canvasOffset: { x: number; y: number }
	setCanvasOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
	canvasZoom: number
	setCanvasZoom: React.Dispatch<React.SetStateAction<number>>

	// Tool state
	activeTool: string
	setActiveTool: (tool: string) => void

	// Current style for new objects
	currentStyle: {
		strokeColor: string
		fillColor: string
		strokeWidth: number
	}
	setCurrentStyle: React.Dispatch<
		React.SetStateAction<{
			strokeColor: string
			fillColor: string
			strokeWidth: number
		}>
	>

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
	const objects = useY(doc.o)

	// Selection state
	const [selectedIds, setSelectedIds] = React.useState<Set<ObjectId>>(new Set())

	// Canvas navigation state
	const [canvasOffset, setCanvasOffset] = React.useState({ x: 0, y: 0 })
	const [canvasZoom, setCanvasZoom] = React.useState(1)

	// Tool state - default to select
	const [activeTool, setActiveTool] = React.useState<string>('select')

	// Current style for new objects (using palette keys for theme support)
	const [currentStyle, setCurrentStyle] = React.useState({
		strokeColor: 'n0', // Black/dark neutral
		fillColor: 'transparent',
		strokeWidth: 2
	})

	// Undo manager - tracks objects, text content, geometry, and paths
	const undoManager = React.useMemo(() => {
		return new Y.UndoManager([doc.o, doc.txt, doc.geo, doc.paths], {
			trackedOrigins: new Set([cloudillo.yDoc.clientID])
		})
	}, [cloudillo.yDoc, doc])

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
		setSelectedIds(new Set())
		undoManager.undo()
	}, [undoManager])

	const redo = React.useCallback(() => {
		setSelectedIds(new Set())
		undoManager.redo()
	}, [undoManager])

	// Selection helpers
	const selectObject = React.useCallback((id: ObjectId, addToSelection: boolean = false) => {
		setSelectedIds((prev) => {
			if (addToSelection) {
				const next = new Set(prev)
				next.add(id)
				return next
			}
			return new Set([id])
		})
	}, [])

	const selectObjects = React.useCallback((ids: ObjectId[], addToSelection: boolean = false) => {
		setSelectedIds((prev) => {
			if (addToSelection) {
				const next = new Set(prev)
				ids.forEach((id) => next.add(id))
				return next
			}
			return new Set(ids)
		})
	}, [])

	const deselectObject = React.useCallback((id: ObjectId) => {
		setSelectedIds((prev) => {
			const next = new Set(prev)
			next.delete(id)
			return next
		})
	}, [])

	const clearSelection = React.useCallback(() => {
		setSelectedIds(new Set())
	}, [])

	const isSelected = React.useCallback((id: ObjectId) => selectedIds.has(id), [selectedIds])

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

			states.forEach((state: any, clientId: number) => {
				if (clientId !== localClientId && state) {
					newPresence.set(clientId, state as IdealloPresence)
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

		// Selection
		selectedIds,
		setSelectedIds,
		selectObject,
		selectObjects,
		deselectObject,
		clearSelection,
		isSelected,

		// Canvas navigation
		canvasOffset,
		setCanvasOffset,
		canvasZoom,
		setCanvasZoom,

		// Tools
		activeTool,
		setActiveTool,

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

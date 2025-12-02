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
 * Main hook for Prello document state
 */

import * as React from 'react'
import * as Y from 'yjs'
import { useY } from 'react-yjs'
import { useCloudilloEditor } from '@cloudillo/react'

import type { Awareness } from 'y-protocols/awareness'

import type { ObjectId, ContainerId, ViewId, YPrelloDocument } from '../crdt'
import { getOrCreateDocument, toViewId } from '../crdt'
import type { PrelloPresence } from '../awareness'
import { getRemotePresenceStates, str2color } from '../awareness'

export interface UsePrelloDocumentResult {
	// Cloudillo context
	cloudillo: ReturnType<typeof useCloudilloEditor>

	// CRDT document
	yDoc: Y.Doc
	doc: YPrelloDocument

	// Reactive data (re-renders on change)
	// Note: useY returns plain objects, not Map instances
	objects: Record<string, any> | null
	containers: Record<string, any> | null
	rootChildren: any[] | null
	views: Record<string, any> | null
	viewOrder: string[] | null
	styles: Record<string, any> | null

	// UI state
	activeViewId: ViewId | null
	setActiveViewId: (id: ViewId | null) => void
	selectedIds: Set<ObjectId>
	setSelectedIds: React.Dispatch<React.SetStateAction<Set<ObjectId>>>
	activeContainerId: ContainerId | null
	setActiveContainerId: (id: ContainerId | null) => void

	// Canvas navigation
	canvasOffset: { x: number; y: number }
	setCanvasOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
	canvasZoom: number
	setCanvasZoom: React.Dispatch<React.SetStateAction<number>>

	// Tools
	activeTool: string | null
	setActiveTool: (tool: string | null) => void

	// Undo/redo
	undoManager: Y.UndoManager | null
	canUndo: boolean
	canRedo: boolean
	undo: () => void
	redo: () => void

	// Selection helpers
	selectObject: (id: ObjectId, addToSelection?: boolean) => void
	selectObjects: (ids: ObjectId[], addToSelection?: boolean) => void
	deselectObject: (id: ObjectId) => void
	clearSelection: () => void
	isSelected: (id: ObjectId) => boolean

	// Awareness/presence
	awareness: Awareness | null
	remotePresence: Map<number, PrelloPresence>
}

const APP_NAME = 'Prello'

export function usePrelloDocument(): UsePrelloDocumentResult {
	const cloudillo = useCloudilloEditor(APP_NAME)

	// Get document structure (without initializing defaults)
	const doc = React.useMemo(() => getOrCreateDocument(cloudillo.yDoc, false), [cloudillo.yDoc])

	// Initialize document with defaults only after sync completes
	// This ensures we don't overwrite server data
	React.useEffect(() => {
		if (cloudillo.synced) {
			getOrCreateDocument(cloudillo.yDoc, true)
		}
	}, [cloudillo.yDoc, cloudillo.synced])

	// Observe reactive CRDT data
	const objects = useY(doc.o)
	const containers = useY(doc.c)
	const rootChildren = useY(doc.r)
	const views = useY(doc.v)
	const viewOrder = useY(doc.vo)
	const styles = useY(doc.st)

	// UI state
	const [activeViewId, setActiveViewId] = React.useState<ViewId | null>(null)
	const [selectedIds, setSelectedIds] = React.useState<Set<ObjectId>>(new Set())
	const [activeContainerId, setActiveContainerId] = React.useState<ContainerId | null>(null)

	// Canvas navigation state
	const [canvasOffset, setCanvasOffset] = React.useState({ x: 0, y: 0 })
	const [canvasZoom, setCanvasZoom] = React.useState(1)

	// Tool state
	const [activeTool, setActiveTool] = React.useState<string | null>(null)

	// Initialize active view
	React.useEffect(() => {
		if (viewOrder && viewOrder.length > 0 && !activeViewId) {
			setActiveViewId(toViewId(viewOrder[0]))
		}
	}, [viewOrder, activeViewId])

	// Undo manager
	const undoManager = React.useMemo(() => {
		return new Y.UndoManager([doc.o, doc.c, doc.r, doc.v, doc.vo, doc.st, doc.ch], {
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

	const isSelected = React.useCallback(
		(id: ObjectId) => {
			return selectedIds.has(id)
		},
		[selectedIds]
	)

	// Remote presence state
	const [remotePresence, setRemotePresence] = React.useState<Map<number, PrelloPresence>>(
		new Map()
	)

	// Get awareness instance
	const awareness = cloudillo.provider?.awareness ?? null

	// Set up awareness with consistent user color
	React.useEffect(() => {
		if (!awareness || !cloudillo.idTag) return

		// Initialize with consistent color based on user ID
		str2color(cloudillo.idTag).then((color) => {
			awareness.setLocalStateField('user', {
				name: cloudillo.idTag,
				color
			})
		})
	}, [awareness, cloudillo.idTag])

	// Listen for awareness changes from remote clients
	React.useEffect(() => {
		if (!awareness) return

		const handler = () => {
			setRemotePresence(getRemotePresenceStates(awareness))
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
		containers,
		rootChildren,
		views,
		viewOrder,
		styles,

		// UI state
		activeViewId,
		setActiveViewId,
		selectedIds,
		setSelectedIds,
		activeContainerId,
		setActiveContainerId,

		// Canvas navigation
		canvasOffset,
		setCanvasOffset,
		canvasZoom,
		setCanvasZoom,

		// Tools
		activeTool,
		setActiveTool,

		// Undo/redo
		undoManager,
		canUndo,
		canRedo,
		undo,
		redo,

		// Selection helpers
		selectObject,
		selectObjects,
		deselectObject,
		clearSelection,
		isSelected,

		// Awareness/presence
		awareness,
		remotePresence
	}
}

// vim: ts=4

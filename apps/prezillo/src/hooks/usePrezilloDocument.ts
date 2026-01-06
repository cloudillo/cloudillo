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
 * Main hook for Prezillo document state
 */

import * as React from 'react'
import * as Y from 'yjs'
import { useY } from 'react-yjs'
import { useCloudilloEditor } from '@cloudillo/react'

import type { Awareness } from 'y-protocols/awareness'

import type { ObjectId, ContainerId, ViewId, TemplateId, YPrezilloDocument } from '../crdt'
import { getOrCreateDocument, toViewId, toTemplateId } from '../crdt'
import type { PrezilloPresence, PresenterInfo } from '../awareness'
import {
	getRemotePresenceStates,
	str2color,
	setPresenting,
	clearPresenting,
	updatePresentingView,
	getActivePresenters,
	isLocalPresenting
} from '../awareness'

export interface UsePrezilloDocumentResult {
	// Cloudillo context
	cloudillo: ReturnType<typeof useCloudilloEditor>

	// CRDT document
	yDoc: Y.Doc
	doc: YPrezilloDocument

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
	isViewFocused: boolean // True when view background is clicked (show view properties)
	selectView: (id: ViewId) => void // Select a view (also sets activeViewId, clears object selection)
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
	autoSwitchToObjectPage: (id: ObjectId) => void

	// Template editing mode
	editingTemplateId: TemplateId | null
	startEditingTemplate: (templateId: TemplateId) => void
	stopEditingTemplate: () => void

	// Template selection (for properties panel, not editing)
	selectedTemplateId: TemplateId | null
	selectTemplate: (templateId: TemplateId | null) => void
	clearTemplateSelection: () => void
	isTemplateFocused: boolean // True when template frame background is clicked (show template properties)

	// Awareness/presence
	awareness: Awareness | null
	remotePresence: Map<number, PrezilloPresence>

	// Remote presentation
	isPresenting: boolean
	followingClientId: number | null
	activePresenters: PresenterInfo[]
	startPresenting: () => void
	stopPresenting: () => void
	followPresenter: (clientId: number) => void
	unfollowPresenter: () => void
}

const APP_NAME = 'Prezillo'

export function usePrezilloDocument(): UsePrezilloDocumentResult {
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
	const [activeViewId, setActiveViewIdInternal] = React.useState<ViewId | null>(null)
	const [isViewFocused, setIsViewFocused] = React.useState(false)

	// Wrapper that clears isViewFocused when switching pages via navigation
	const setActiveViewId = React.useCallback((id: ViewId | null) => {
		setActiveViewIdInternal(id)
		setIsViewFocused(false)
	}, [])
	const [selectedIds, setSelectedIds] = React.useState<Set<ObjectId>>(new Set())
	const [activeContainerId, setActiveContainerId] = React.useState<ContainerId | null>(null)

	// Canvas navigation state
	const [canvasOffset, setCanvasOffset] = React.useState({ x: 0, y: 0 })
	const [canvasZoom, setCanvasZoom] = React.useState(1)

	// Tool state
	const [activeTool, setActiveTool] = React.useState<string | null>(null)

	// Initialize active view (use internal setter to avoid clearing isViewFocused on init)
	React.useEffect(() => {
		if (viewOrder && viewOrder.length > 0 && !activeViewId) {
			setActiveViewIdInternal(toViewId(viewOrder[0]))
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
		setIsViewFocused(false) // Clear view focus when selecting objects
		setIsTemplateFocused(false) // Clear template focus when selecting objects
		setSelectedTemplateId(null) // Clear template selection when selecting objects
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
		setIsViewFocused(false) // Clear view focus when selecting objects
		setIsTemplateFocused(false) // Clear template focus when selecting objects
		setSelectedTemplateId(null) // Clear template selection when selecting objects
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

	// Select a view (for showing view properties in sidebar)
	const selectView = React.useCallback((viewId: ViewId) => {
		setActiveViewIdInternal(viewId)
		setSelectedIds(new Set()) // Clear object selection
		setSelectedTemplateId(null) // Clear template selection
		setIsTemplateFocused(false) // Clear template focus
		setIsViewFocused(true) // Mark view as focused for properties panel
	}, [])

	// Auto-switch to object's page if clicking on an object from a different page
	const autoSwitchToObjectPage = React.useCallback(
		(objectId: ObjectId) => {
			const obj = doc.o.get(objectId)
			if (obj?.vi && obj.vi !== activeViewId) {
				setActiveViewId(obj.vi as ViewId)
			}
		},
		[doc, activeViewId, setActiveViewId]
	)

	const isSelected = React.useCallback(
		(id: ObjectId) => {
			return selectedIds.has(id)
		},
		[selectedIds]
	)

	// Template editing mode
	const [editingTemplateId, setEditingTemplateId] = React.useState<TemplateId | null>(null)

	const startEditingTemplate = React.useCallback((templateId: TemplateId) => {
		setEditingTemplateId(templateId)
		setSelectedTemplateId(templateId) // Also select the template
		setSelectedIds(new Set()) // Clear object selection
		setIsViewFocused(false) // Clear view focus
	}, [])

	const stopEditingTemplate = React.useCallback(() => {
		setEditingTemplateId(null)
		setSelectedIds(new Set()) // Clear selection
	}, [])

	// Template selection (for properties panel, not editing)
	const [selectedTemplateId, setSelectedTemplateId] = React.useState<TemplateId | null>(null)
	const [isTemplateFocused, setIsTemplateFocused] = React.useState(false)

	const selectTemplate = React.useCallback((templateId: TemplateId | null) => {
		setSelectedTemplateId(templateId)
		setIsTemplateFocused(templateId !== null) // Set template focus when selecting
		setSelectedIds(new Set()) // Clear object selection
		setIsViewFocused(false) // Clear view focus
	}, [])

	const clearTemplateSelection = React.useCallback(() => {
		setSelectedTemplateId(null)
		setIsTemplateFocused(false)
	}, [])

	// Remote presence state
	const [remotePresence, setRemotePresence] = React.useState<Map<number, PrezilloPresence>>(
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
				name: cloudillo.displayName || cloudillo.idTag || 'Anonymous',
				color
			})
		})
	}, [awareness, cloudillo.idTag, cloudillo.displayName])

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

	// Presenting state - track if local user is presenting
	const [isPresenting, setIsPresenting] = React.useState(false)

	// Following state - track which client we're following
	const [followingClientId, setFollowingClientId] = React.useState<number | null>(null)

	// Active presenters - computed from remote presence
	const [activePresenters, setActivePresenters] = React.useState<PresenterInfo[]>([])

	// Update active presenters when awareness changes
	React.useEffect(() => {
		if (!awareness) return

		const handler = () => {
			setActivePresenters(getActivePresenters(awareness))
			// Also update local presenting state
			setIsPresenting(isLocalPresenting(awareness))
		}

		// Initial state
		handler()

		awareness.on('change', handler)
		return () => awareness.off('change', handler)
	}, [awareness])

	// Start presenting - broadcast current view to other clients
	const startPresenting = React.useCallback(() => {
		if (!awareness || !activeViewId || !viewOrder) return

		const viewIndex = viewOrder.indexOf(activeViewId)
		// Check if user is the owner by comparing idTag with ownerTag
		const isOwner = cloudillo.idTag === cloudillo.ownerTag

		setPresenting(awareness, activeViewId, viewIndex, isOwner)
		setIsPresenting(true)
	}, [awareness, activeViewId, viewOrder, cloudillo.idTag, cloudillo.ownerTag])

	// Stop presenting
	const stopPresenting = React.useCallback(() => {
		if (!awareness) return

		clearPresenting(awareness)
		setIsPresenting(false)
	}, [awareness])

	// Update presenting view when activeViewId changes while presenting
	React.useEffect(() => {
		if (!awareness || !isPresenting || !activeViewId || !viewOrder) return

		const viewIndex = viewOrder.indexOf(activeViewId)
		updatePresentingView(awareness, activeViewId, viewIndex)
	}, [awareness, isPresenting, activeViewId, viewOrder])

	// Periodic awareness broadcast while presenting (every 2 seconds)
	// This ensures followers stay synchronized even without navigation events
	React.useEffect(() => {
		if (!awareness || !isPresenting || !activeViewId || !viewOrder) return

		const intervalId = setInterval(() => {
			const viewIndex = viewOrder.indexOf(activeViewId)
			updatePresentingView(awareness, activeViewId, viewIndex)
		}, 2000)

		return () => clearInterval(intervalId)
	}, [awareness, isPresenting, activeViewId, viewOrder])

	// Follow a presenter - sync view with their current slide
	const followPresenter = React.useCallback(
		(clientId: number) => {
			setFollowingClientId(clientId)

			// Find the presenter and navigate to their current view
			const presenter = activePresenters.find((p) => p.clientId === clientId)
			if (presenter) {
				setActiveViewId(presenter.viewId)
			}
		},
		[activePresenters, setActiveViewId]
	)

	// Unfollow presenter
	const unfollowPresenter = React.useCallback(() => {
		setFollowingClientId(null)
	}, [])

	// Sync view with followed presenter when they navigate
	React.useEffect(() => {
		if (!followingClientId) return

		const presenter = activePresenters.find((p) => p.clientId === followingClientId)
		if (!presenter) {
			// Presenter left - unfollow
			setFollowingClientId(null)
			return
		}

		// Navigate to presenter's current view
		if (presenter.viewId !== activeViewId) {
			setActiveViewId(presenter.viewId)
		}
	}, [followingClientId, activePresenters, activeViewId, setActiveViewId])

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
		isViewFocused,
		selectView,
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
		autoSwitchToObjectPage,

		// Template editing mode
		editingTemplateId,
		startEditingTemplate,
		stopEditingTemplate,

		// Template selection (for properties panel)
		selectedTemplateId,
		selectTemplate,
		clearTemplateSelection,
		isTemplateFocused,

		// Awareness/presence
		awareness,
		remotePresence,

		// Remote presentation
		isPresenting,
		followingClientId,
		activePresenters,
		startPresenting,
		stopPresenting,
		followPresenter,
		unfollowPresenter
	}
}

// vim: ts=4

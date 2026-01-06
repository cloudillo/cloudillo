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
 * Hook for view navigation operations (prev/next, add, duplicate, delete, reorder)
 */

import * as React from 'react'
import * as Y from 'yjs'

import type { ObjectId, ViewId, YPrezilloDocument } from '../crdt'
import {
	createView,
	getPreviousView,
	getNextView,
	moveViewInPresentation,
	duplicateObject,
	duplicateView,
	deleteView
} from '../crdt'

export interface UseViewNavigationOptions {
	yDoc: Y.Doc
	doc: YPrezilloDocument
	activeViewId: ViewId | null
	setActiveViewId: (id: ViewId | null) => void
	selectedIds: Set<ObjectId>
	selectObjects: (ids: ObjectId[], addToSelection?: boolean) => void
	viewsLength: number
	isReadOnly: boolean
	forceZoomRef: React.MutableRefObject<boolean>
}

export interface UseViewNavigationResult {
	handlePrevView: () => void
	handleNextView: () => void
	handleAddView: () => void
	handleDuplicate: () => void
	handleReorderView: (viewId: ViewId, newIndex: number) => void
	handleDuplicateView: (viewId: ViewId) => void
	handleDeleteView: (viewId: ViewId) => void
}

export function useViewNavigation({
	yDoc,
	doc,
	activeViewId,
	setActiveViewId,
	selectedIds,
	selectObjects,
	viewsLength,
	isReadOnly,
	forceZoomRef
}: UseViewNavigationOptions): UseViewNavigationResult {
	// Navigate to previous view
	const handlePrevView = React.useCallback(() => {
		if (activeViewId) {
			const prev = getPreviousView(doc, activeViewId)
			if (prev) {
				forceZoomRef.current = true
				setActiveViewId(prev)
			}
		}
	}, [activeViewId, doc, setActiveViewId, forceZoomRef])

	// Navigate to next view
	const handleNextView = React.useCallback(() => {
		if (activeViewId) {
			const next = getNextView(doc, activeViewId)
			if (next) {
				forceZoomRef.current = true
				setActiveViewId(next)
			}
		}
	}, [activeViewId, doc, setActiveViewId, forceZoomRef])

	// Add new view (copies template from current view)
	const handleAddView = React.useCallback(() => {
		const viewId = createView(yDoc, doc, {
			copyFromViewId: activeViewId || undefined
		})
		forceZoomRef.current = true
		setActiveViewId(viewId)
	}, [yDoc, doc, activeViewId, setActiveViewId, forceZoomRef])

	// Duplicate selected objects
	const handleDuplicate = React.useCallback(() => {
		if (isReadOnly) return
		if (selectedIds.size === 0) return

		const newIds: ObjectId[] = []
		selectedIds.forEach((id) => {
			// Pass activeViewId so prototype objects (templates) get placed on current page
			const newId = duplicateObject(yDoc, doc, id, 20, 20, activeViewId ?? undefined)
			if (newId) newIds.push(newId)
		})

		// Select the duplicated objects
		if (newIds.length > 0) {
			selectObjects(newIds)
		}
	}, [isReadOnly, selectedIds, yDoc, doc, activeViewId, selectObjects])

	// Reorder view in presentation
	const handleReorderView = React.useCallback(
		(viewId: ViewId, newIndex: number) => {
			moveViewInPresentation(yDoc, doc, viewId, newIndex)
		},
		[yDoc, doc]
	)

	// Duplicate a view
	const handleDuplicateView = React.useCallback(
		(viewId: ViewId) => {
			const newViewId = duplicateView(yDoc, doc, viewId)
			if (newViewId) {
				forceZoomRef.current = true
				setActiveViewId(newViewId)
			}
		},
		[yDoc, doc, setActiveViewId, forceZoomRef]
	)

	// Delete a view
	const handleDeleteView = React.useCallback(
		(viewId: ViewId) => {
			// Don't delete the last view
			if (viewsLength <= 1) return

			// If deleting current view, switch to previous or next first
			if (viewId === activeViewId) {
				const prev = getPreviousView(doc, viewId)
				const next = getNextView(doc, viewId)
				if (prev) {
					setActiveViewId(prev)
				} else if (next) {
					setActiveViewId(next)
				}
			}

			deleteView(yDoc, doc, viewId)
		},
		[viewsLength, activeViewId, doc, yDoc, setActiveViewId]
	)

	return {
		handlePrevView,
		handleNextView,
		handleAddView,
		handleDuplicate,
		handleReorderView,
		handleDuplicateView,
		handleDeleteView
	}
}

// vim: ts=4

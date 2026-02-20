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

import type { ObjectId, ViewId } from '../crdt'
import {
	createView,
	getPreviousView,
	getNextView,
	moveViewInPresentation,
	duplicateObject,
	duplicateView,
	deleteView
} from '../crdt'
import type { UsePrezilloDocumentResult } from './usePrezilloDocument'

export interface UseViewNavigationOptions {
	prezillo: UsePrezilloDocumentResult
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
	prezillo,
	viewsLength,
	isReadOnly,
	forceZoomRef
}: UseViewNavigationOptions): UseViewNavigationResult {
	// Navigate to previous view
	const handlePrevView = React.useCallback(() => {
		if (prezillo.activeViewId) {
			const prev = getPreviousView(prezillo.doc, prezillo.activeViewId)
			if (prev) {
				forceZoomRef.current = true
				prezillo.setActiveViewId(prev)
			}
		}
	}, [prezillo.activeViewId, prezillo.doc, prezillo.setActiveViewId, forceZoomRef])

	// Navigate to next view
	const handleNextView = React.useCallback(() => {
		if (prezillo.activeViewId) {
			const next = getNextView(prezillo.doc, prezillo.activeViewId)
			if (next) {
				forceZoomRef.current = true
				prezillo.setActiveViewId(next)
			}
		}
	}, [prezillo.activeViewId, prezillo.doc, prezillo.setActiveViewId, forceZoomRef])

	// Add new view (copies template from current view)
	const handleAddView = React.useCallback(() => {
		const viewId = createView(prezillo.yDoc, prezillo.doc, {
			copyFromViewId: prezillo.activeViewId || undefined
		})
		forceZoomRef.current = true
		prezillo.setActiveViewId(viewId)
	}, [prezillo.yDoc, prezillo.doc, prezillo.activeViewId, prezillo.setActiveViewId, forceZoomRef])

	// Duplicate selected objects
	const handleDuplicate = React.useCallback(() => {
		if (isReadOnly) return
		if (prezillo.selectedIds.size === 0) return

		const newIds: ObjectId[] = []
		prezillo.selectedIds.forEach((id) => {
			// Pass activeViewId so prototype objects (templates) get placed on current page
			const newId = duplicateObject(
				prezillo.yDoc,
				prezillo.doc,
				id,
				20,
				20,
				prezillo.activeViewId ?? undefined
			)
			if (newId) newIds.push(newId)
		})

		// Select the duplicated objects
		if (newIds.length > 0) {
			prezillo.selectObjects(newIds)
		}
	}, [
		isReadOnly,
		prezillo.selectedIds,
		prezillo.yDoc,
		prezillo.doc,
		prezillo.activeViewId,
		prezillo.selectObjects
	])

	// Reorder view in presentation
	const handleReorderView = React.useCallback(
		(viewId: ViewId, newIndex: number) => {
			moveViewInPresentation(prezillo.yDoc, prezillo.doc, viewId, newIndex)
		},
		[prezillo.yDoc, prezillo.doc]
	)

	// Duplicate a view
	const handleDuplicateView = React.useCallback(
		(viewId: ViewId) => {
			const newViewId = duplicateView(prezillo.yDoc, prezillo.doc, viewId)
			if (newViewId) {
				forceZoomRef.current = true
				prezillo.setActiveViewId(newViewId)
			}
		},
		[prezillo.yDoc, prezillo.doc, prezillo.setActiveViewId, forceZoomRef]
	)

	// Delete a view
	const handleDeleteView = React.useCallback(
		(viewId: ViewId) => {
			// Don't delete the last view
			if (viewsLength <= 1) return

			// If deleting current view, switch to previous or next first
			if (viewId === prezillo.activeViewId) {
				const prev = getPreviousView(prezillo.doc, viewId)
				const next = getNextView(prezillo.doc, viewId)
				if (prev) {
					prezillo.setActiveViewId(prev)
				} else if (next) {
					prezillo.setActiveViewId(next)
				}
			}

			deleteView(prezillo.yDoc, prezillo.doc, viewId)
		},
		[viewsLength, prezillo.activeViewId, prezillo.doc, prezillo.yDoc, prezillo.setActiveViewId]
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

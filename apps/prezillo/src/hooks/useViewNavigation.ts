// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Hook for view navigation operations (prev/next, add, duplicate, delete, reorder)
 */

import { useDialog } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { ObjectId, ViewId } from '../crdt'
import {
	createView,
	createViewAfter,
	deleteView,
	duplicateObject,
	duplicateView,
	getNextView,
	getPreviousView,
	getViewOrigin,
	reorderView,
	updateView
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
	/** New slide right after `viewId`, on its template; returns the new (now active) slide */
	handleAddViewAfter: (viewId: ViewId) => ViewId
	handleDuplicate: () => void
	handleReorderView: (viewId: ViewId, newIndex: number) => void
	/** Returns the new (now active) slide */
	handleDuplicateView: (viewId: ViewId) => ViewId
	/** Resolves false when nothing was deleted (last slide, or the user cancelled) */
	handleDeleteView: (viewId: ViewId) => Promise<boolean>
	/** Flips "skip in presentation" (`ViewNode.hidden`) */
	handleToggleSkip: (viewId: ViewId) => void
}

export function useViewNavigation({
	prezillo,
	viewsLength,
	isReadOnly,
	forceZoomRef
}: UseViewNavigationOptions): UseViewNavigationResult {
	const { t } = useTranslation()
	const dialog = useDialog()

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

	// New slide after `viewId`, using its template (one undo step)
	const handleAddViewAfter = React.useCallback(
		(viewId: ViewId) => {
			const newId = createViewAfter(prezillo.yDoc, prezillo.doc, viewId)
			forceZoomRef.current = true
			prezillo.setActiveViewId(newId)
			return newId
		},
		[prezillo.yDoc, prezillo.doc, prezillo.setActiveViewId, forceZoomRef]
	)

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
			// Only recentre when the active slide actually moved on the canvas
			const before = prezillo.activeViewId
				? getViewOrigin(prezillo.doc, prezillo.activeViewId)
				: undefined
			reorderView(prezillo.yDoc, prezillo.doc, viewId, newIndex)
			const after = prezillo.activeViewId
				? getViewOrigin(prezillo.doc, prezillo.activeViewId)
				: undefined
			if (before?.x !== after?.x || before?.y !== after?.y) forceZoomRef.current = true
		},
		[prezillo.yDoc, prezillo.doc, prezillo.activeViewId, forceZoomRef]
	)

	// Duplicate a view
	const handleDuplicateView = React.useCallback(
		(viewId: ViewId) => {
			const newViewId = duplicateView(prezillo.yDoc, prezillo.doc, viewId)
			forceZoomRef.current = true
			prezillo.setActiveViewId(newViewId)
			return newViewId
		},
		[prezillo.yDoc, prezillo.doc, prezillo.setActiveViewId, forceZoomRef]
	)

	const handleToggleSkip = React.useCallback(
		(viewId: ViewId) => {
			const hidden = prezillo.doc.v.get(viewId)?.hidden
			updateView(prezillo.yDoc, prezillo.doc, viewId, { hidden: !hidden })
		},
		[prezillo.yDoc, prezillo.doc]
	)

	const activeViewIdRef = React.useRef(prezillo.activeViewId)
	activeViewIdRef.current = prezillo.activeViewId

	// Delete a view
	const handleDeleteView = React.useCallback(
		async (viewId: ViewId) => {
			// Don't delete the last view
			if (viewsLength <= 1) return false

			// deleteView takes the slide's objects with it (one undo restores them): ask first
			if (
				Array.from(prezillo.doc.o.values()).some((obj) => obj.vi === viewId) &&
				!(await dialog.confirm(
					t('Delete slide?'),
					t('This slide has objects on it. They will be deleted with it.')
				))
			) {
				return false
			}
			// The confirm awaited: re-check the live doc
			if (prezillo.doc.vo.length <= 1 || !prezillo.doc.v.has(viewId)) return false

			// If deleting current view, switch to previous or next first
			if (viewId === activeViewIdRef.current) {
				const prev = getPreviousView(prezillo.doc, viewId)
				const next = getNextView(prezillo.doc, viewId)
				if (prev) {
					prezillo.setActiveViewId(prev)
				} else if (next) {
					prezillo.setActiveViewId(next)
				}
			}

			deleteView(prezillo.yDoc, prezillo.doc, viewId)
			return true
		},
		[viewsLength, prezillo.doc, prezillo.yDoc, prezillo.setActiveViewId, dialog, t]
	)

	return {
		handlePrevView,
		handleNextView,
		handleAddView,
		handleAddViewAfter,
		handleDuplicate,
		handleReorderView,
		handleDuplicateView,
		handleDeleteView,
		handleToggleSkip
	}
}

// vim: ts=4

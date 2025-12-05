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
 * View (page/slide) CRUD operations
 */

import * as Y from 'yjs'
import type { YPrezilloDocument, StoredView } from './stored-types'
import type { ViewId } from './ids'
import { generateViewId, toViewId } from './ids'
import type { ViewNode } from './runtime-types'
import { expandView, compactView } from './type-converters'
import { getDocumentMeta } from './document'

/**
 * Create a new view (page/slide)
 */
export function createView(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	options?: {
		name?: string
		x?: number
		y?: number
		width?: number
		height?: number
		insertIndex?: number
		copyFromViewId?: ViewId
	}
): ViewId {
	const viewId = generateViewId()
	const meta = getDocumentMeta(doc)

	// Calculate position for new view
	let x = options?.x
	let y = options?.y

	if (x === undefined && y === undefined) {
		// Auto-position: place after last view
		const viewIds = doc.vo.toArray()
		if (viewIds.length > 0) {
			const lastViewId = viewIds[viewIds.length - 1]
			const lastView = doc.v.get(lastViewId)
			if (lastView) {
				x = lastView.x + lastView.width + 100 // 100px gap
				y = lastView.y
			}
		}
	}

	x = x ?? 0
	y = y ?? 0

	yDoc.transact(() => {
		let view: StoredView = {
			name: options?.name || `Page ${doc.vo.length + 1}`,
			x,
			y,
			width: options?.width ?? meta.defaultViewWidth,
			height: options?.height ?? meta.defaultViewHeight,
			backgroundColor: '#ffffff',
			showBorder: true
		}

		// Copy properties from source view if specified
		if (options?.copyFromViewId) {
			const sourceView = doc.v.get(options.copyFromViewId)
			if (sourceView) {
				view = {
					...view,
					width: sourceView.width,
					height: sourceView.height,
					backgroundColor: sourceView.backgroundColor,
					backgroundImage: sourceView.backgroundImage,
					backgroundFit: sourceView.backgroundFit,
					transition: sourceView.transition ? { ...sourceView.transition } : undefined
				}
			}
		}

		doc.v.set(viewId, view)

		if (options?.insertIndex !== undefined && options.insertIndex < doc.vo.length) {
			doc.vo.insert(options.insertIndex, [viewId])
		} else {
			doc.vo.push([viewId])
		}
	})

	return viewId
}

/**
 * Get a view by ID (returns runtime type)
 */
export function getView(doc: YPrezilloDocument, viewId: ViewId): ViewNode | undefined {
	const stored = doc.v.get(viewId)
	if (!stored) return undefined
	return expandView(viewId, stored)
}

/**
 * Get all views in presentation order
 */
export function getAllViews(doc: YPrezilloDocument): ViewNode[] {
	const views: ViewNode[] = []

	doc.vo.toArray().forEach((id) => {
		const stored = doc.v.get(id)
		if (stored) {
			views.push(expandView(id, stored))
		}
	})

	return views
}

/**
 * Get view count
 */
export function getViewCount(doc: YPrezilloDocument): number {
	return doc.vo.length
}

/**
 * Update view properties
 */
export function updateView(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	updates: Partial<ViewNode>
): void {
	const existing = doc.v.get(viewId)
	if (!existing) return

	const expanded = expandView(viewId, existing)
	const updated = { ...expanded, ...updates, id: viewId }
	const compacted = compactView(updated)

	yDoc.transact(() => {
		doc.v.set(viewId, compacted)
	})
}

/**
 * Update view position
 */
export function updateViewPosition(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	x: number,
	y: number
): void {
	const existing = doc.v.get(viewId)
	if (!existing) return

	yDoc.transact(() => {
		doc.v.set(viewId, { ...existing, x, y })
	})
}

/**
 * Update view size
 */
export function updateViewSize(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	width: number,
	height: number
): void {
	const existing = doc.v.get(viewId)
	if (!existing) return

	yDoc.transact(() => {
		doc.v.set(viewId, { ...existing, width, height })
	})
}

/**
 * Update view bounds (position and size)
 */
export function updateViewBounds(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	x: number,
	y: number,
	width: number,
	height: number
): void {
	const existing = doc.v.get(viewId)
	if (!existing) return

	yDoc.transact(() => {
		doc.v.set(viewId, { ...existing, x, y, width, height })
	})
}

/**
 * Delete a view
 */
export function deleteView(yDoc: Y.Doc, doc: YPrezilloDocument, viewId: ViewId): void {
	if (doc.vo.length <= 1) {
		throw new Error('Cannot delete the last view')
	}

	yDoc.transact(() => {
		const idx = doc.vo.toArray().indexOf(viewId)
		if (idx >= 0) {
			doc.vo.delete(idx, 1)
		}
		doc.v.delete(viewId)
	})
}

/**
 * Reorder views (change presentation order)
 */
export function reorderView(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	newIndex: number
): void {
	yDoc.transact(() => {
		const currentIndex = doc.vo.toArray().indexOf(viewId)
		if (currentIndex >= 0 && currentIndex !== newIndex) {
			doc.vo.delete(currentIndex, 1)
			const adjustedIndex = newIndex > currentIndex ? newIndex - 1 : newIndex
			doc.vo.insert(Math.min(adjustedIndex, doc.vo.length), [viewId])
		}
	})
}

/**
 * Move view to new position and update canvas position
 */
export function moveViewInPresentation(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	newIndex: number
): void {
	// Reorder in presentation
	reorderView(yDoc, doc, viewId, newIndex)

	// Optionally: recalculate canvas positions for all views
	// This arranges views in a row on the canvas
	rearrangeViewsOnCanvas(yDoc, doc)
}

/**
 * Arrange all views in a row on the canvas
 */
export function rearrangeViewsOnCanvas(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	gap: number = 100
): void {
	yDoc.transact(() => {
		let x = 0
		const y = 0

		doc.vo.toArray().forEach((id) => {
			const view = doc.v.get(id)
			if (view) {
				doc.v.set(id, { ...view, x, y })
				x += view.width + gap
			}
		})
	})
}

/**
 * Duplicate a view
 */
export function duplicateView(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	options?: {
		name?: string
		insertAfter?: boolean
	}
): ViewId {
	const sourceView = doc.v.get(viewId)
	if (!sourceView) {
		throw new Error(`View ${viewId} not found`)
	}

	const currentIndex = doc.vo.toArray().indexOf(viewId)
	const insertIndex = options?.insertAfter !== false ? currentIndex + 1 : currentIndex

	return createView(yDoc, doc, {
		name: options?.name || `${sourceView.name} (copy)`,
		copyFromViewId: viewId,
		insertIndex
	})
}

/**
 * Get view at a canvas position
 */
export function getViewAtPosition(
	doc: YPrezilloDocument,
	canvasX: number,
	canvasY: number
): ViewNode | null {
	// Check in reverse order (later views are "on top")
	const viewIds = doc.vo.toArray().reverse()

	for (const id of viewIds) {
		const view = doc.v.get(id)
		if (view) {
			if (
				canvasX >= view.x &&
				canvasX <= view.x + view.width &&
				canvasY >= view.y &&
				canvasY <= view.y + view.height
			) {
				return expandView(id, view)
			}
		}
	}

	return null
}

/**
 * Get next view in presentation order
 */
export function getNextView(
	doc: YPrezilloDocument,
	currentViewId: ViewId,
	wrap: boolean = false
): ViewId | null {
	const viewIds = doc.vo.toArray()
	const currentIndex = viewIds.indexOf(currentViewId)

	if (currentIndex < 0) return null

	if (currentIndex < viewIds.length - 1) {
		return toViewId(viewIds[currentIndex + 1])
	}

	if (wrap && viewIds.length > 0) {
		return toViewId(viewIds[0])
	}

	return null
}

/**
 * Get previous view in presentation order
 */
export function getPreviousView(
	doc: YPrezilloDocument,
	currentViewId: ViewId,
	wrap: boolean = false
): ViewId | null {
	const viewIds = doc.vo.toArray()
	const currentIndex = viewIds.indexOf(currentViewId)

	if (currentIndex < 0) return null

	if (currentIndex > 0) {
		return toViewId(viewIds[currentIndex - 1])
	}

	if (wrap && viewIds.length > 0) {
		return toViewId(viewIds[viewIds.length - 1])
	}

	return null
}

/**
 * Get first view
 */
export function getFirstView(doc: YPrezilloDocument): ViewId | null {
	const viewIds = doc.vo.toArray()
	return viewIds.length > 0 ? toViewId(viewIds[0]) : null
}

/**
 * Get last view
 */
export function getLastView(doc: YPrezilloDocument): ViewId | null {
	const viewIds = doc.vo.toArray()
	return viewIds.length > 0 ? toViewId(viewIds[viewIds.length - 1]) : null
}

/**
 * Get view index in presentation order
 */
export function getViewIndex(doc: YPrezilloDocument, viewId: ViewId): number {
	return doc.vo.toArray().indexOf(viewId)
}

/**
 * Toggle view visibility (for skipping in presentation)
 */
export function toggleViewHidden(yDoc: Y.Doc, doc: YPrezilloDocument, viewId: ViewId): void {
	const view = doc.v.get(viewId)
	if (!view) return

	yDoc.transact(() => {
		if (view.hidden) {
			const updated = { ...view }
			delete updated.hidden
			doc.v.set(viewId, updated)
		} else {
			doc.v.set(viewId, { ...view, hidden: true })
		}
	})
}

/**
 * Set view transition
 */
export function setViewTransition(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	transition: ViewNode['transition'] | null
): void {
	const view = doc.v.get(viewId)
	if (!view) return

	yDoc.transact(() => {
		if (transition) {
			doc.v.set(viewId, { ...view, transition })
		} else {
			const updated = { ...view }
			delete updated.transition
			doc.v.set(viewId, updated)
		}
	})
}

/**
 * Set view notes (speaker notes)
 */
export function setViewNotes(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	notes: string | null
): void {
	const view = doc.v.get(viewId)
	if (!view) return

	yDoc.transact(() => {
		if (notes) {
			doc.v.set(viewId, { ...view, notes })
		} else {
			const updated = { ...view }
			delete updated.notes
			doc.v.set(viewId, updated)
		}
	})
}

// vim: ts=4

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
import type { YPrezilloDocument, StoredView, StoredBackgroundGradient } from './stored-types'
import type { ViewId, TemplateId, ObjectId } from './ids'
import { generateViewId, toViewId, toTemplateId, toObjectId } from './ids'
import type { ViewNode, ResolvedViewBackground, Template, SnapGuide } from './runtime-types'
import {
	expandView,
	compactView,
	expandBackgroundGradient,
	compactBackgroundGradient
} from './type-converters'
import { getDocumentMeta } from './document'
import type { Gradient } from '@cloudillo/canvas-tools'

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
	}, yDoc.clientID)

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
	}, yDoc.clientID)
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
	}, yDoc.clientID)
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
	}, yDoc.clientID)
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
	}, yDoc.clientID)
}

/**
 * Delete a view.
 * Objects associated with this view (page-relative) are converted to floating
 * with their global position preserved.
 */
export function deleteView(yDoc: Y.Doc, doc: YPrezilloDocument, viewId: ViewId): void {
	if (doc.vo.length <= 1) {
		throw new Error('Cannot delete the last view')
	}

	yDoc.transact(() => {
		const view = doc.v.get(viewId)

		// Convert page-relative objects to floating (preserve global position)
		if (view) {
			doc.o.forEach((obj, id) => {
				if (obj.vi === viewId) {
					// Convert to global coords and remove page association
					doc.o.set(id, {
						...obj,
						vi: undefined,
						xy: [view.x + obj.xy[0], view.y + obj.xy[1]] as [number, number]
					})
				}
			})
		}

		// Delete view from order and map
		const idx = doc.vo.toArray().indexOf(viewId)
		if (idx >= 0) {
			doc.vo.delete(idx, 1)
		}
		doc.v.delete(viewId)
	}, yDoc.clientID)
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
	}, yDoc.clientID)
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
	}, yDoc.clientID)
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
	}, yDoc.clientID)
}

// ============================================================================
// Template Integration
// ============================================================================

/**
 * Get the template assigned to a view
 */
export function getViewTemplate(doc: YPrezilloDocument, viewId: ViewId): TemplateId | undefined {
	const view = doc.v.get(viewId)
	return view?.tpl ? toTemplateId(view.tpl) : undefined
}

/**
 * Resolve view background with template inheritance
 * Returns the effective background properties and tracks which are overridden
 */
export function resolveViewBackground(
	doc: YPrezilloDocument,
	viewId: ViewId
): ResolvedViewBackground {
	const view = doc.v.get(viewId)
	if (!view) {
		return {
			overrides: {
				backgroundColor: false,
				backgroundGradient: false,
				backgroundImage: false,
				backgroundFit: false
			}
		}
	}

	const result: ResolvedViewBackground = {
		overrides: {
			backgroundColor: false,
			backgroundGradient: false,
			backgroundImage: false,
			backgroundFit: false
		}
	}

	// Start with template values if referenced
	if (view.tpl) {
		const template = doc.tpl.get(view.tpl)
		if (template) {
			result.inheritedFrom = toTemplateId(view.tpl)

			// Template provides base values
			if (template.bc) result.backgroundColor = template.bc
			if (template.bg) result.backgroundGradient = expandBackgroundGradient(template.bg)
			if (template.bi) result.backgroundImage = template.bi
			if (template.bf) result.backgroundFit = template.bf
		}
	}

	// Apply view-level overrides
	// Check for override fields (bco, bgo, bio, bfo) when template is set
	if (view.tpl) {
		if (view.bco !== undefined) {
			result.backgroundColor = view.bco
			result.overrides.backgroundColor = true
		}
		if (view.bgo !== undefined) {
			result.backgroundGradient = expandBackgroundGradient(view.bgo)
			result.overrides.backgroundGradient = true
		}
		if (view.bio !== undefined) {
			result.backgroundImage = view.bio
			result.overrides.backgroundImage = true
		}
		if (view.bfo !== undefined) {
			result.backgroundFit = view.bfo
			result.overrides.backgroundFit = true
		}
	} else {
		// No template: use view's own values (stored in standard fields)
		if (view.backgroundColor) result.backgroundColor = view.backgroundColor
		if (view.backgroundGradient)
			result.backgroundGradient = expandBackgroundGradient(view.backgroundGradient)
		if (view.backgroundImage) result.backgroundImage = view.backgroundImage
		if (view.backgroundFit) result.backgroundFit = view.backgroundFit
	}

	return result
}

// Background property field mappings (property -> [overrideField, standardField])
const BACKGROUND_FIELD_MAP = {
	backgroundColor: ['bco', 'backgroundColor'],
	backgroundGradient: ['bgo', 'backgroundGradient'],
	backgroundImage: ['bio', 'backgroundImage'],
	backgroundFit: ['bfo', 'backgroundFit']
} as const

type BackgroundProperty = keyof typeof BACKGROUND_FIELD_MAP

/**
 * Set a background override on a view (when view has a template)
 */
export function setViewBackgroundOverride(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	property: BackgroundProperty,
	value: string | Gradient | 'contain' | 'cover' | 'fill' | 'tile' | null
): void {
	const view = doc.v.get(viewId)
	if (!view) return

	yDoc.transact(() => {
		// Use type assertion to allow dynamic field access
		const updated = { ...view } as unknown as Record<string, unknown>

		// Choose field based on whether view has a template
		const [overrideField, standardField] = BACKGROUND_FIELD_MAP[property]
		const field = view.tpl ? overrideField : standardField

		if (value === null) {
			delete updated[field]
		} else if (property === 'backgroundGradient') {
			updated[field] = compactBackgroundGradient(value as Gradient)
		} else {
			updated[field] = value
		}

		doc.v.set(viewId, updated as unknown as StoredView)
	}, yDoc.clientID)
}

/**
 * Reset a background property to inherit from template
 */
export function resetViewBackgroundToTemplate(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	property: 'backgroundColor' | 'backgroundGradient' | 'backgroundImage' | 'backgroundFit' | 'all'
): void {
	const view = doc.v.get(viewId)
	if (!view || !view.tpl) return

	yDoc.transact(() => {
		const updated = { ...view }

		if (property === 'all' || property === 'backgroundColor') {
			delete updated.bco
		}
		if (property === 'all' || property === 'backgroundGradient') {
			delete updated.bgo
		}
		if (property === 'all' || property === 'backgroundImage') {
			delete updated.bio
		}
		if (property === 'all' || property === 'backgroundFit') {
			delete updated.bfo
		}

		doc.v.set(viewId, updated)
	}, yDoc.clientID)
}

/**
 * Get template snap guides for a view (if view has a template)
 */
export function getViewSnapGuides(doc: YPrezilloDocument, viewId: ViewId): SnapGuide[] {
	const view = doc.v.get(viewId)
	if (!view?.tpl) return []

	const template = doc.tpl.get(view.tpl)
	if (!template?.sg) return []

	return template.sg.map((sg) => ({
		direction: sg.d === 'h' ? 'horizontal' : 'vertical',
		position: sg.p,
		absolute: sg.a
	}))
}

/**
 * Get instance objects on a view (objects that reference template prototypes)
 */
export function getViewInstanceObjects(doc: YPrezilloDocument, viewId: ViewId): ObjectId[] {
	const view = doc.v.get(viewId)
	if (!view?.tpl) return []

	const protoIds = doc.tpo.get(view.tpl)?.toArray() || []
	const instances: ObjectId[] = []

	doc.o.forEach((obj, id) => {
		if (obj.vi === viewId && obj.proto && protoIds.includes(obj.proto)) {
			instances.push(toObjectId(id))
		}
	})

	return instances
}

/**
 * Check if an object on a view is a template instance
 */
export function isTemplateInstance(
	doc: YPrezilloDocument,
	viewId: ViewId,
	objectId: ObjectId
): boolean {
	const view = doc.v.get(viewId)
	if (!view?.tpl) return false

	const obj = doc.o.get(objectId)
	if (!obj?.proto) return false

	const protoIds = doc.tpo.get(view.tpl)?.toArray() || []
	return protoIds.includes(obj.proto)
}

// vim: ts=4

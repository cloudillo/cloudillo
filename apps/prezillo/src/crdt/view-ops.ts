// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * View (page/slide) CRUD operations
 */

import type { Gradient } from '@cloudillo/canvas-tools'
import * as Y from 'yjs'

import { getContainerChildren, getDocumentMeta } from './document'
import type { TemplateId, ViewId } from './ids'
import {
	generateContainerId,
	generateObjectId,
	generateViewId,
	toContainerId,
	toTemplateId,
	toViewId
} from './ids'
import { removeChildRef } from './object-ops'
import type { ResolvedViewBackground, SnapGuide, ViewNode } from './runtime-types'
import type { ChildRef, LegacyStoredView, StoredView, YPrezilloDocument } from './stored-types'
import { getViewOrigin } from './view-layout'
import { applyTemplateToView } from './template-ops'
import {
	compactBackgroundGradient,
	compactView,
	expandBackgroundGradient,
	expandView
} from './type-converters'

/**
 * Create a new view (page/slide)
 */
export function createView(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	options?: {
		name?: string
		width?: number
		height?: number
		insertIndex?: number
		copyFromViewId?: ViewId
	}
): ViewId {
	const viewId = generateViewId()
	const meta = getDocumentMeta(doc)

	yDoc.transact(() => {
		let view: StoredView = {
			name: options?.name || `Page ${doc.vo.length + 1}`,
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
	return expandView(viewId, stored, getViewOrigin(doc, viewId) ?? { x: 0, y: 0 })
}

/**
 * Get all views in presentation order
 */
export function getAllViews(doc: YPrezilloDocument): ViewNode[] {
	const views: ViewNode[] = []

	for (const id of new Set(doc.vo.toArray())) {
		const stored = doc.v.get(id)
		if (stored) {
			views.push(expandView(id, stored, getViewOrigin(doc, id) ?? { x: 0, y: 0 }))
		}
	}

	return views
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

	const expanded = expandView(viewId, existing, { x: 0, y: 0 })
	const updated = { ...expanded, ...updates, id: viewId }
	const compacted = compactView(updated)

	yDoc.transact(() => {
		doc.v.set(viewId, compacted)
	}, yDoc.clientID)
}

/**
 * Delete a view.
 * Objects associated with this view (page-relative, incl. template instances) are deleted with it:
 * pages restack on delete, so anything left floating would land on the next page. Groups left
 * empty go too (layers stay).
 */
export function deleteView(yDoc: Y.Doc, doc: YPrezilloDocument, viewId: ViewId): void {
	if (doc.vo.length <= 1) {
		throw new Error('Cannot delete the last view')
	}

	yDoc.transact(() => {
		// Orphan rt entries are kept for undo; GC needs undo-stack awareness
		const doomed: Array<[string, string | undefined]> = []
		doc.o.forEach((obj, id) => {
			if (obj.vi === viewId) doomed.push([id, obj.p])
		})
		for (const [id, parent] of doomed) {
			const children = parent ? doc.ch.get(parent) : doc.r
			if (children) removeChildRef(children, [0, id])
			doc.o.delete(id)
		}
		// Remove groups left empty, walking up (layers are never removed)
		const visited = new Set<string>()
		for (const [, parent] of doomed) {
			let p = parent
			while (p && !visited.has(p)) {
				visited.add(p)
				const c = doc.c.get(p)
				if (c?.t !== 'G' || (doc.ch.get(p)?.length ?? 0) > 0) break
				const siblings = c.p ? doc.ch.get(c.p) : doc.r
				if (siblings) removeChildRef(siblings, [1, p])
				doc.c.delete(p)
				doc.ch.delete(p)
				p = c.p
			}
		}

		// Delete view from order and map
		const idx = doc.vo.toArray().indexOf(viewId)
		if (idx >= 0) {
			doc.vo.delete(idx, 1)
		}
		doc.v.delete(viewId)
		doc.vn.delete(viewId)
	}, yDoc.clientID)
}

/**
 * Convert a final index (`arrayMove` semantics, as `SortableList.onReorder` passes) into the
 * insert-before index `reorderView` takes: forward moves insert one past the target.
 */
export function toInsertIndex(from: number, to: number): number {
	return to > from ? to + 1 : to
}

/**
 * Reorder views (change presentation order). `newIndex` is an insert-before index in the
 * current order (see `toInsertIndex`).
 */
export function reorderView(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	newIndex: number
): void {
	yDoc.transact(() => {
		const currentIndex = doc.vo.toArray().indexOf(viewId)
		// readers dedupe concurrent-move duplicates; repair vo in an observer if they spread
		if (currentIndex >= 0 && newIndex !== currentIndex && newIndex !== currentIndex + 1) {
			doc.vo.delete(currentIndex, 1)
			const adjustedIndex = newIndex > currentIndex ? newIndex - 1 : newIndex
			doc.vo.insert(Math.min(adjustedIndex, doc.vo.length), [viewId])
		}
	}, yDoc.clientID)
}

/**
 * Duplicate a view: copies the view record (template, background, border, ...), its
 * page-relative objects (incl. rich text and template instances) and speaker notes.
 * Floating objects (no `vi`) only overlap the slide and are not copied.
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

	let newId!: ViewId
	// One outer transaction = one undo step; the nested createView transact merges into it
	yDoc.transact(() => {
		newId = createView(yDoc, doc, {
			name: options?.name || `${sourceView.name} (copy)`,
			copyFromViewId: viewId,
			insertIndex
		})
		// Copy speaker notes (only here: createView({copyFromViewId}) also backs "+" / "New slide after")
		const srcNotes = doc.vn.get(viewId)
		if (srcNotes && srcNotes.length > 0) {
			const notes = new Y.Text()
			notes.applyDelta(srcNotes.toDelta())
			doc.vn.set(newId, notes)
		}
		// Full view record, keeping only the name createView computed (and dropping legacy x/y)
		const { x: _x, y: _y, ...rest } = sourceView as LegacyStoredView
		doc.v.set(newId, { ...rest, name: doc.v.get(newId)!.name })

		// Page-relative objects: same xy lands in the same spot on the new slide
		const objMap = new Map<string, string>()
		doc.o.forEach((obj, id) => {
			if (obj.vi === viewId) objMap.set(id, generateObjectId())
		})
		// Groups holding copied objects are cloned too (a shared group would move both slides'
		// objects together); layers stay shared
		const groupMap = new Map<string, string>()
		const visited = new Set<string>()
		for (const id of objMap.keys()) {
			let p = doc.o.get(id)!.p
			while (p && !visited.has(p)) {
				visited.add(p)
				const c = doc.c.get(p)
				if (!c) break
				if (c.t === 'G') groupMap.set(p, generateContainerId())
				p = c.p
			}
		}
		const remap = (p: string) => groupMap.get(p) ?? p

		for (const [id, copyId] of objMap) {
			const obj = doc.o.get(id)!
			doc.o.set(
				copyId,
				obj.p ? { ...obj, vi: newId, p: remap(obj.p) } : { ...obj, vi: newId }
			)
			const text = doc.rt.get(id)
			if (text) {
				const copy = new Y.Text()
				copy.applyDelta(text.toDelta())
				doc.rt.set(copyId, copy)
			}
		}
		for (const [id, copyId] of groupMap) {
			const c = doc.c.get(id)!
			doc.c.set(copyId, c.p ? { ...c, p: remap(c.p) } : c)
			// Source order, copied children only
			const children = new Y.Array<ChildRef>()
			for (const [kind, childId] of doc.ch.get(id)?.toArray() ?? []) {
				const mapped = (kind === 0 ? objMap : groupMap).get(childId)
				if (mapped) children.push([[kind, mapped]])
			}
			doc.ch.set(copyId, children)
		}

		// The rest goes right above the original in the same parent to keep the slide's z-order
		const insertAbove = (kind: 0 | 1, id: string, copyId: string, parent?: string) => {
			if (parent && groupMap.has(parent)) return
			const refs = parent ? getContainerChildren(yDoc, doc, toContainerId(parent)) : doc.r
			const idx = refs.toArray().findIndex((r) => r[0] === kind && r[1] === id)
			refs.insert(idx + 1, [[kind, copyId]])
		}
		for (const [id, copyId] of objMap) insertAbove(0, id, copyId, doc.o.get(id)!.p)
		for (const [id, copyId] of groupMap) insertAbove(1, id, copyId, doc.c.get(id)!.p)
	}, yDoc.clientID)
	return newId
}

/** New slide right after `viewId`, using its template (one undo step) */
export function createViewAfter(yDoc: Y.Doc, doc: YPrezilloDocument, viewId: ViewId): ViewId {
	return yDoc.transact(() => {
		const id = createView(yDoc, doc, {
			copyFromViewId: viewId,
			insertIndex: doc.vo.toArray().indexOf(viewId) + 1
		})
		// Sets `tpl`, clears the white background override, creates prototype instances
		const tpl = doc.v.get(viewId)?.tpl
		if (tpl) applyTemplateToView(yDoc, doc, id, toTemplateId(tpl))
		return id
	}, yDoc.clientID)
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
 *
 * Resolution: template background → view's background fields (if present)
 * Standard fields (backgroundColor, etc.) act as overrides when template is set
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

	// Get base values from template if present
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

	// Apply view's own values (override template if present)
	if (view.backgroundColor !== undefined) {
		result.backgroundColor = view.backgroundColor
		if (view.tpl) result.overrides.backgroundColor = true
	}
	if (view.backgroundGradient !== undefined) {
		result.backgroundGradient = expandBackgroundGradient(view.backgroundGradient)
		if (view.tpl) result.overrides.backgroundGradient = true
	}
	if (view.backgroundImage !== undefined) {
		result.backgroundImage = view.backgroundImage
		if (view.tpl) result.overrides.backgroundImage = true
	}
	if (view.backgroundFit !== undefined) {
		result.backgroundFit = view.backgroundFit
		if (view.tpl) result.overrides.backgroundFit = true
	}

	return result
}

type BackgroundProperty =
	| 'backgroundColor'
	| 'backgroundGradient'
	| 'backgroundImage'
	| 'backgroundFit'

/**
 * Set a background property on a view
 * Always uses standard fields - resolution handles template inheritance
 */
function setViewBackground(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	property: BackgroundProperty,
	value: string | Gradient | 'contain' | 'cover' | 'fill' | 'tile' | null
): void {
	const view = doc.v.get(viewId)
	if (!view) return

	yDoc.transact(() => {
		const updated = { ...view } as Record<string, unknown>

		if (value === null) {
			delete updated[property]
		} else if (property === 'backgroundGradient') {
			updated[property] = compactBackgroundGradient(value as Gradient)
		} else {
			updated[property] = value
		}

		doc.v.set(viewId, updated as unknown as StoredView)
	}, yDoc.clientID)
}

// Keep old name as alias for backwards compatibility
export const setViewBackgroundOverride = setViewBackground

/**
 * Reset a background property to inherit from template
 * Deletes the standard field so resolution falls back to template value
 */
export function resetViewBackgroundToTemplate(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	property: BackgroundProperty | 'all'
): void {
	const view = doc.v.get(viewId)
	if (!view?.tpl) return

	yDoc.transact(() => {
		const updated = { ...view }

		if (property === 'all' || property === 'backgroundColor') {
			delete updated.backgroundColor
		}
		if (property === 'all' || property === 'backgroundGradient') {
			delete updated.backgroundGradient
		}
		if (property === 'all' || property === 'backgroundImage') {
			delete updated.backgroundImage
		}
		if (property === 'all' || property === 'backgroundFit') {
			delete updated.backgroundFit
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

// vim: ts=4

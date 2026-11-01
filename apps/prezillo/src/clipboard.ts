// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Copy / paste of slide objects through the system clipboard.
 *
 * Follows duplicateObject's rules (crdt/object-ops.ts): the object is expanded, loses its id,
 * prototype link and container, lands on the target view (x/y stay page-relative) and keeps its
 * rich text as a Quill delta. Style ids the target document does not have are dropped, so the
 * object falls back to the defaults plus its own inline style.
 */

import { type CanvasClipboardSource, hasValidFileRef } from '@cloudillo/canvas-tools'
import type * as Y from 'yjs'

import type { ObjectId, PrezilloObject, ViewId, YPrezilloDocument } from './crdt/index.js'
import { addObject, resolveObject } from './crdt/index.js'
import { OBJECT_TYPE_REVERSE } from './crdt/type-converters.js'

/** The app id the clipboard codec tags prezillo payloads with */
export const CLIPBOARD_APP = 'prezillo'

type Delta = ReturnType<Y.Text['toDelta']>

export interface ClipboardObject {
	object: Omit<PrezilloObject, 'id' | 'prototypeId' | 'parentId'>
	rt?: Delta
}

export interface PrezilloClipboard {
	/** Set by the copy handler; a paste into another document links its files first */
	source?: CanvasClipboardSource
	objects: ClipboardObject[]
	bounds: { x: number; y: number; width: number; height: number }
}

/** The file (image, embedded document) an item references, for the canvas-tools ref helpers */
export const clipboardFileRef = (item: ClipboardObject | undefined): unknown =>
	(item?.object as { fileId?: unknown } | undefined)?.fileId

/** The given objects in z-order of the selection, or null when none exist */
export function collectClipboard(
	doc: YPrezilloDocument,
	ids: Iterable<ObjectId>
): PrezilloClipboard | null {
	const objects: ClipboardObject[] = []
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	for (const id of ids) {
		const stored = doc.o.get(id)
		// Resolves template instances (stored without xy/wh) against their prototype
		const resolved = stored && resolveObject(doc, id)
		if (!stored || !resolved) continue
		const { id: _id, prototypeId: _p, parentId: _c, ...object } = resolved
		const item: ClipboardObject = { object }
		const text =
			stored.t === 'T'
				? (doc.rt.get(id) ?? (stored.proto ? doc.rt.get(stored.proto) : undefined))
				: undefined
		if (text) item.rt = text.toDelta()
		objects.push(item)

		minX = Math.min(minX, object.x)
		minY = Math.min(minY, object.y)
		maxX = Math.max(maxX, object.x + object.width)
		maxY = Math.max(maxY, object.y + object.height)
	}

	if (!objects.length) return null
	return { objects, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } }
}

/**
 * Write a payload onto `viewId` under fresh ids, moved by (dx, dy), in one undoable
 * transaction. Returns the new ids. Malformed items are skipped: anything could have written
 * the system clipboard.
 */
export function pasteClipboard(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	payload: PrezilloClipboard,
	dx: number,
	dy: number,
	viewId: ViewId
): ObjectId[] {
	const items = (Array.isArray(payload.objects) ? payload.objects : []).filter(
		(item) =>
			item &&
			typeof item.object?.type === 'string' &&
			Object.hasOwn(OBJECT_TYPE_REVERSE, item.object.type) &&
			Number.isFinite(item.object.x) &&
			Number.isFinite(item.object.y) &&
			Number.isFinite(item.object.width) &&
			Number.isFinite(item.object.height) &&
			hasValidFileRef((item.object as { fileId?: unknown }).fileId)
	)
	const ids: ObjectId[] = []

	yDoc.transact(() => {
		for (const { object, rt } of items) {
			const obj = { ...object, x: object.x + dx, y: object.y + dy, pageId: viewId }
			// The Omit is type-level only: a crafted payload could still carry these links
			const links = obj as { id?: unknown; prototypeId?: unknown; parentId?: unknown }
			delete links.id
			delete links.prototypeId
			delete links.parentId
			if (obj.shapeStyleId && !doc.st.has(obj.shapeStyleId)) delete obj.shapeStyleId
			if (obj.textStyleId && !doc.st.has(obj.textStyleId)) delete obj.textStyleId

			const id = addObject(yDoc, doc, obj as PrezilloObject, undefined, undefined, viewId)
			const text = doc.rt.get(id)
			if (text && Array.isArray(rt) && rt.length) {
				text.delete(0, text.length)
				text.applyDelta(rt)
			}
			ids.push(id)
		}
	}, yDoc.clientID)

	return ids
}

// vim: ts=4

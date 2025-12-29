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
 * Object CRUD operations
 */

import * as Y from 'yjs'
import type { YPrezilloDocument, ChildRef, StoredObject } from './stored-types'
import type { ObjectId, ContainerId, ViewId, RichTextId } from './ids'
import { generateObjectId, generateRichTextId } from './ids'
import type { PrezilloObject } from './runtime-types'
import { compactObject, expandObject } from './type-converters'
import { getContainerChildren } from './document'
import { getAbsolutePositionStored } from './transforms'

/**
 * Add a new object to the document.
 * @param pageId - If provided, object coordinates are page-relative
 */
export function addObject(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	object: PrezilloObject,
	parentId?: ContainerId,
	insertIndex?: number,
	pageId?: ViewId
): ObjectId {
	const objectId = object.id || generateObjectId()
	const stored = compactObject({ ...object, id: objectId, parentId, pageId })

	yDoc.transact(() => {
		// Store the object
		doc.o.set(objectId, stored)

		// Create child reference
		const childRef: ChildRef = [0, objectId]

		// Add to parent's children or root
		if (parentId) {
			const children = getContainerChildren(yDoc, doc, parentId)
			if (insertIndex !== undefined && insertIndex < children.length) {
				children.insert(insertIndex, [childRef])
			} else {
				children.push([childRef])
			}
		} else {
			if (insertIndex !== undefined && insertIndex < doc.r.length) {
				doc.r.insert(insertIndex, [childRef])
			} else {
				doc.r.push([childRef])
			}
		}

		// Handle textbox: create rich text entry
		if (object.type === 'textbox') {
			const textboxObj = object as any
			if (!textboxObj.textContentId) {
				const textId = generateRichTextId()
				const yText = new Y.Text()
				doc.rt.set(textId, yText)
				// Update stored object with textContentId
				const storedTextbox = stored as any
				storedTextbox.tid = textId
				doc.o.set(objectId, storedTextbox)
			}
		}
	}, yDoc.clientID)

	return objectId
}

/**
 * Create a new object with defaults.
 * @param pageId - If provided, x/y are page-relative coordinates
 */
export function createObject(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	type: PrezilloObject['type'],
	x: number,
	y: number,
	width: number,
	height: number,
	parentId?: ContainerId,
	insertIndex?: number,
	pageId?: ViewId
): ObjectId {
	const objectId = generateObjectId()

	const base: Partial<PrezilloObject> = {
		id: objectId,
		type,
		x,
		y,
		width,
		height,
		rotation: 0,
		opacity: 1,
		visible: true,
		locked: false
	}

	let object: PrezilloObject

	switch (type) {
		case 'rect':
			object = { ...base, type: 'rect' } as any
			break
		case 'ellipse':
			object = { ...base, type: 'ellipse' } as any
			break
		case 'line':
			object = {
				...base,
				type: 'line',
				points: [
					[0, height / 2],
					[width, height / 2]
				]
			} as any
			break
		case 'path':
			object = { ...base, type: 'path', pathData: '' } as any
			break
		case 'polygon':
			object = { ...base, type: 'polygon', points: [], closed: true } as any
			break
		case 'text':
			object = { ...base, type: 'text', text: '', minHeight: height } as any
			break
		case 'textbox':
			const textId = generateRichTextId()
			object = {
				...base,
				type: 'textbox',
				textContentId: textId
			} as any
			// Create the Y.Text
			yDoc.transact(() => {
				doc.rt.set(textId, new Y.Text())
			}, yDoc.clientID)
			break
		case 'image':
			object = { ...base, type: 'image', fileId: '' } as any
			break
		case 'embed':
			object = { ...base, type: 'embed', embedType: 'iframe', src: '' } as any
			break
		case 'connector':
			object = { ...base, type: 'connector' } as any
			break
		default:
			throw new Error(`Unknown object type: ${type}`)
	}

	return addObject(yDoc, doc, object, parentId, insertIndex, pageId)
}

/**
 * Get an object by ID (returns runtime type)
 */
export function getObject(doc: YPrezilloDocument, objectId: ObjectId): PrezilloObject | undefined {
	const stored = doc.o.get(objectId)
	if (!stored) return undefined
	return expandObject(objectId, stored)
}

/**
 * Update an existing object
 */
export function updateObject(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	updates: Partial<PrezilloObject>
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	const expanded = expandObject(objectId, existing)
	const updated = { ...expanded, ...updates, id: objectId }
	const compacted = compactObject(updated as PrezilloObject)

	yDoc.transact(() => {
		doc.o.set(objectId, compacted)
	}, yDoc.clientID)
}

/**
 * Update object position
 */
export function updateObjectPosition(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	x: number,
	y: number
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	yDoc.transact(() => {
		doc.o.set(objectId, {
			...existing,
			xy: [x, y]
		})
	}, yDoc.clientID)
}

/**
 * Update object size
 */
export function updateObjectSize(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	width: number,
	height: number
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	yDoc.transact(() => {
		doc.o.set(objectId, {
			...existing,
			wh: [width, height]
		})
	}, yDoc.clientID)
}

/**
 * Update object bounds (position and size)
 */
export function updateObjectBounds(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	x: number,
	y: number,
	width: number,
	height: number
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	yDoc.transact(() => {
		doc.o.set(objectId, {
			...existing,
			xy: [x, y],
			wh: [width, height]
		})
	}, yDoc.clientID)
}

/**
 * Update object rotation
 */
export function updateObjectRotation(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	rotation: number
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	yDoc.transact(() => {
		// Normalize rotation to 0-360 range
		const normalizedRotation = ((rotation % 360) + 360) % 360
		if (normalizedRotation === 0) {
			// Remove rotation field if 0 (default)
			const updated = { ...existing }
			delete updated.r
			doc.o.set(objectId, updated)
		} else {
			doc.o.set(objectId, {
				...existing,
				r: normalizedRotation
			})
		}
	}, yDoc.clientID)
}

/**
 * Update object pivot point
 * When the object has non-zero rotation, also adjusts position to keep the object
 * visually in the same place (compensates for the change in rotation center).
 * @param pivotX - X pivot (0-1), default 0.5 (center)
 * @param pivotY - Y pivot (0-1), default 0.5 (center)
 */
export function updateObjectPivot(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	pivotX: number,
	pivotY: number
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	yDoc.transact(() => {
		// Clamp to 0-1 range
		const newPx = Math.max(0, Math.min(1, pivotX))
		const newPy = Math.max(0, Math.min(1, pivotY))

		// Get current values
		const oldPx = existing.pv?.[0] ?? 0.5
		const oldPy = existing.pv?.[1] ?? 0.5
		const rotation = existing.r ?? 0
		const x = existing.xy[0]
		const y = existing.xy[1]
		const width = existing.wh[0]
		const height = existing.wh[1]

		// Calculate position compensation if rotated
		let newX = x
		let newY = y

		if (rotation !== 0) {
			// When pivot changes on a rotated object, we need to adjust position
			// to keep the visual appearance the same.
			// Formula derived from keeping the rotated visual position constant:
			const dpx = oldPx - newPx
			const dpy = oldPy - newPy
			const radians = rotation * (Math.PI / 180)
			const cos = Math.cos(radians)
			const sin = Math.sin(radians)

			newX = x + width * dpx * (1 - cos) + height * dpy * sin
			newY = y + height * dpy * (1 - cos) - width * dpx * sin
		}

		// Build updated object
		const updated = { ...existing, xy: [newX, newY] as [number, number] }

		if (newPx === 0.5 && newPy === 0.5) {
			// Remove pivot field if center (default)
			delete updated.pv
		} else {
			updated.pv = [newPx, newPy]
		}

		doc.o.set(objectId, updated)
	}, yDoc.clientID)
}

/**
 * Update an object's page association.
 * Converts coordinates between global and page-relative as needed.
 *
 * @param newPageId - Target page (null = make floating with global coords)
 * @param options.preserveGlobalPosition - If true (default), converts coords to keep visual position
 */
export function updateObjectPageAssociation(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	newPageId: ViewId | null,
	options?: { preserveGlobalPosition?: boolean }
): void {
	const object = doc.o.get(objectId)
	if (!object) return

	const currentPageId = object.vi
	// No change needed
	if (currentPageId === newPageId || (currentPageId === undefined && newPageId === null)) return

	const preserveGlobal = options?.preserveGlobalPosition !== false

	yDoc.transact(() => {
		let newX = object.xy[0]
		let newY = object.xy[1]

		if (preserveGlobal) {
			// Get current global position
			const globalPos = getAbsolutePositionStored(doc, object)

			if (newPageId) {
				// Converting to page-relative: subtract view origin
				const newPage = doc.v.get(newPageId)
				if (newPage) {
					newX = globalPos.x - newPage.x
					newY = globalPos.y - newPage.y
				}
			} else {
				// Becoming floating: use global coordinates
				newX = globalPos.x
				newY = globalPos.y
			}
		}

		// Build updated object
		const updated: StoredObject = {
			...object,
			xy: [newX, newY] as [number, number]
		}

		if (newPageId) {
			updated.vi = newPageId
		} else {
			delete updated.vi
		}

		doc.o.set(objectId, updated)
	}, yDoc.clientID)
}

/**
 * Update text style properties on an object
 * Pass null to delete a property (reset to default)
 */
export function updateObjectTextStyle(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	textStyleUpdates: {
		ta?: 'l' | 'c' | 'r' | 'j' | null // textAlign: left/center/right/justify
		va?: 't' | 'm' | 'b' | null // verticalAlign: top/middle/bottom
		ff?: string | null // fontFamily
		fs?: number | null // fontSize
		fw?: 'normal' | 'bold' | number | null // fontWeight
		fi?: boolean | null // fontItalic
		td?: 'u' | 's' | null // textDecoration: underline/strikethrough
		fc?: string | null // fill color
		lh?: number | null // lineHeight
		ls?: number | null // letterSpacing
		lb?: string | null // listBullet
	}
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	yDoc.transact(() => {
		// Merge with existing text style or create new
		const existingTs = existing.ts || {}
		const newTs = { ...existingTs }

		// Apply updates (null means delete the property)
		if (textStyleUpdates.ta !== undefined) {
			if (textStyleUpdates.ta === null) delete newTs.ta
			else newTs.ta = textStyleUpdates.ta
		}
		if (textStyleUpdates.va !== undefined) {
			if (textStyleUpdates.va === null) delete newTs.va
			else newTs.va = textStyleUpdates.va
		}
		if (textStyleUpdates.ff !== undefined) {
			if (textStyleUpdates.ff === null) delete newTs.ff
			else newTs.ff = textStyleUpdates.ff
		}
		if (textStyleUpdates.fs !== undefined) {
			if (textStyleUpdates.fs === null) delete newTs.fs
			else newTs.fs = textStyleUpdates.fs
		}
		if (textStyleUpdates.fw !== undefined) {
			if (textStyleUpdates.fw === null) delete newTs.fw
			else newTs.fw = textStyleUpdates.fw
		}
		if (textStyleUpdates.fi !== undefined) {
			if (textStyleUpdates.fi === null) delete newTs.fi
			else newTs.fi = textStyleUpdates.fi
		}
		if (textStyleUpdates.td !== undefined) {
			if (textStyleUpdates.td === null) delete newTs.td
			else newTs.td = textStyleUpdates.td
		}
		if (textStyleUpdates.fc !== undefined) {
			if (textStyleUpdates.fc === null) delete newTs.fc
			else newTs.fc = textStyleUpdates.fc
		}
		if (textStyleUpdates.lh !== undefined) {
			if (textStyleUpdates.lh === null) delete newTs.lh
			else newTs.lh = textStyleUpdates.lh
		}
		if (textStyleUpdates.ls !== undefined) {
			if (textStyleUpdates.ls === null) delete newTs.ls
			else newTs.ls = textStyleUpdates.ls
		}
		if (textStyleUpdates.lb !== undefined) {
			if (textStyleUpdates.lb === null) delete newTs.lb
			else newTs.lb = textStyleUpdates.lb
		}

		doc.o.set(objectId, {
			...existing,
			ts: newTs
		})
	}, yDoc.clientID)
}

/**
 * Delete an object
 */
export function deleteObject(yDoc: Y.Doc, doc: YPrezilloDocument, objectId: ObjectId): void {
	const object = doc.o.get(objectId)
	if (!object) return

	yDoc.transact(() => {
		// Remove from parent's children
		if (object.p) {
			const children = doc.ch.get(object.p)
			if (children) {
				removeChildRef(children, [0, objectId])
			}
		} else {
			removeChildRef(doc.r, [0, objectId])
		}

		// Delete object
		doc.o.delete(objectId)

		// Clean up rich text if textbox
		if (object.t === 'B' && (object as any).tid) {
			doc.rt.delete((object as any).tid)
		}
	}, yDoc.clientID)
}

/**
 * Delete multiple objects
 */
export function deleteObjects(yDoc: Y.Doc, doc: YPrezilloDocument, objectIds: ObjectId[]): void {
	yDoc.transact(() => {
		objectIds.forEach((id) => {
			const object = doc.o.get(id)
			if (!object) return

			// Remove from parent's children
			if (object.p) {
				const children = doc.ch.get(object.p)
				if (children) {
					removeChildRef(children, [0, id])
				}
			} else {
				removeChildRef(doc.r, [0, id])
			}

			// Delete object
			doc.o.delete(id)

			// Clean up rich text if textbox
			if (object.t === 'B' && (object as any).tid) {
				doc.rt.delete((object as any).tid)
			}
		})
	}, yDoc.clientID)
}

/**
 * Move object to different parent/position
 */
export function moveObject(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	newParentId: ContainerId | undefined,
	insertIndex?: number
): void {
	const object = doc.o.get(objectId)
	if (!object) return

	yDoc.transact(() => {
		const childRef: ChildRef = [0, objectId]

		// Remove from old parent
		if (object.p) {
			const oldChildren = doc.ch.get(object.p)
			if (oldChildren) {
				removeChildRef(oldChildren, childRef)
			}
		} else {
			removeChildRef(doc.r, childRef)
		}

		// Add to new parent
		if (newParentId) {
			const newChildren = getContainerChildren(yDoc, doc, newParentId)
			if (insertIndex !== undefined && insertIndex < newChildren.length) {
				newChildren.insert(insertIndex, [childRef])
			} else {
				newChildren.push([childRef])
			}
		} else {
			if (insertIndex !== undefined && insertIndex < doc.r.length) {
				doc.r.insert(insertIndex, [childRef])
			} else {
				doc.r.push([childRef])
			}
		}

		// Update object's parentId
		doc.o.set(objectId, { ...object, p: newParentId })
	}, yDoc.clientID)
}

/**
 * Reorder object within same parent (change z-index)
 */
export function reorderObject(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	newIndex: number
): void {
	const object = doc.o.get(objectId)
	if (!object) return

	const children = object.p ? doc.ch.get(object.p) : doc.r

	if (!children) return

	yDoc.transact(() => {
		const childRef: ChildRef = [0, objectId]
		const currentIndex = findChildRefIndex(children, childRef)

		if (currentIndex >= 0 && currentIndex !== newIndex) {
			children.delete(currentIndex, 1)
			const adjustedIndex = newIndex > currentIndex ? newIndex - 1 : newIndex
			children.insert(Math.min(adjustedIndex, children.length), [childRef])
		}
	}, yDoc.clientID)
}

/**
 * Z-index reorder operation types
 */
type ZIndexOperation = 'toFront' | 'toBack' | 'forward' | 'backward'

/**
 * Internal helper to reorder object within its container
 * Consolidates common z-index logic for all four operations
 */
function reorderInChildren(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	operation: ZIndexOperation
): void {
	const object = doc.o.get(objectId)
	if (!object) return

	const children = object.p ? doc.ch.get(object.p) : doc.r

	if (!children) return

	yDoc.transact(() => {
		const childRef: ChildRef = [0, objectId]
		const currentIndex = findChildRefIndex(children, childRef)
		if (currentIndex < 0) return

		// Calculate target index and check if move is needed
		let targetIndex: number
		let canMove: boolean

		switch (operation) {
			case 'toFront':
				targetIndex = children.length // push() equivalent
				canMove = currentIndex < children.length - 1
				break
			case 'toBack':
				targetIndex = 0
				canMove = currentIndex > 0
				break
			case 'forward':
				targetIndex = currentIndex + 1
				canMove = currentIndex < children.length - 1
				break
			case 'backward':
				targetIndex = currentIndex - 1
				canMove = currentIndex > 0
				break
		}

		if (canMove) {
			children.delete(currentIndex, 1)
			// For 'toFront', use push; for others use insert
			if (operation === 'toFront') {
				children.push([childRef])
			} else {
				children.insert(targetIndex, [childRef])
			}
			// Touch object to trigger observers
			doc.o.set(objectId, { ...object })
		}
	}, yDoc.clientID)
}

/**
 * Bring object to front (highest z-index in its container)
 */
export function bringToFront(yDoc: Y.Doc, doc: YPrezilloDocument, objectId: ObjectId): void {
	reorderInChildren(yDoc, doc, objectId, 'toFront')
}

/**
 * Send object to back (lowest z-index in its container)
 */
export function sendToBack(yDoc: Y.Doc, doc: YPrezilloDocument, objectId: ObjectId): void {
	reorderInChildren(yDoc, doc, objectId, 'toBack')
}

/**
 * Bring object forward one level (increase z-index by 1)
 */
export function bringForward(yDoc: Y.Doc, doc: YPrezilloDocument, objectId: ObjectId): void {
	reorderInChildren(yDoc, doc, objectId, 'forward')
}

/**
 * Send object backward one level (decrease z-index by 1)
 */
export function sendBackward(yDoc: Y.Doc, doc: YPrezilloDocument, objectId: ObjectId): void {
	reorderInChildren(yDoc, doc, objectId, 'backward')
}

/**
 * Toggle object visibility
 */
export function toggleObjectVisibility(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId
): void {
	const object = doc.o.get(objectId)
	if (!object) return

	yDoc.transact(() => {
		const isVisible = object.v !== false
		if (isVisible) {
			doc.o.set(objectId, { ...object, v: false })
		} else {
			const updated = { ...object }
			delete updated.v
			doc.o.set(objectId, updated)
		}
	}, yDoc.clientID)
}

/**
 * Toggle object locked state
 */
export function toggleObjectLock(yDoc: Y.Doc, doc: YPrezilloDocument, objectId: ObjectId): void {
	const object = doc.o.get(objectId)
	if (!object) return

	yDoc.transact(() => {
		const isLocked = object.k === true
		if (isLocked) {
			const updated = { ...object }
			delete updated.k
			doc.o.set(objectId, updated)
		} else {
			doc.o.set(objectId, { ...object, k: true })
		}
	}, yDoc.clientID)
}

/**
 * Duplicate an object
 */
export function duplicateObject(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	offsetX: number = 20,
	offsetY: number = 20
): ObjectId | undefined {
	const object = doc.o.get(objectId)
	if (!object) return undefined

	const expanded = expandObject(objectId, object)
	const newId = generateObjectId()
	const duplicated: PrezilloObject = {
		...expanded,
		id: newId,
		x: expanded.x + offsetX,
		y: expanded.y + offsetY,
		pageId: expanded.pageId, // Preserve page association
		name: expanded.name ? `${expanded.name} (copy)` : undefined
	}

	// Handle textbox duplication
	if (duplicated.type === 'textbox') {
		const originalTextId = (expanded as any).textContentId
		const originalText = doc.rt.get(originalTextId)
		if (originalText) {
			const newTextId = generateRichTextId()
			yDoc.transact(() => {
				const newText = new Y.Text()
				newText.insert(0, originalText.toString())
				doc.rt.set(newTextId, newText)
			}, yDoc.clientID)
			;(duplicated as any).textContentId = newTextId
		}
	}

	return addObject(yDoc, doc, duplicated, expanded.parentId)
}

// Helper functions

function removeChildRef(array: Y.Array<ChildRef>, ref: ChildRef): void {
	const idx = findChildRefIndex(array, ref)
	if (idx >= 0) {
		array.delete(idx, 1)
	}
}

function findChildRefIndex(array: Y.Array<ChildRef>, ref: ChildRef): number {
	const arr = array.toArray()
	return arr.findIndex((r) => r[0] === ref[0] && r[1] === ref[1])
}

// vim: ts=4

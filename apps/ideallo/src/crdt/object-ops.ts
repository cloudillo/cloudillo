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
 * CRUD operations for objects in the CRDT document
 * All mutations are wrapped in yDoc.transact() for batching
 */

import * as Y from 'yjs'
import type { YIdealloDocument } from './stored-types.js'
import type { ObjectId } from './ids.js'
import { generateObjectId } from './ids.js'
import type { IdealloObject } from './runtime-types.js'
import { compactObject, expandObject } from './type-converters.js'

/**
 * Add a new object to the document
 *
 * @returns The ObjectId of the created object
 */
export function addObject(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	object: Omit<IdealloObject, 'id'> & { id?: ObjectId }
): ObjectId {
	const objectId = object.id ?? generateObjectId()
	const objectWithId = { ...object, id: objectId } as IdealloObject
	const stored = compactObject(objectWithId)

	yDoc.transact(() => {
		doc.o.set(objectId, stored)
	}, yDoc.clientID)

	return objectId
}

/**
 * Get an object by ID
 */
export function getObject(doc: YIdealloDocument, objectId: ObjectId): IdealloObject | undefined {
	const stored = doc.o.get(objectId)
	if (!stored) return undefined
	return expandObject(objectId, stored)
}

/**
 * Get all objects in the document
 */
export function getAllObjects(doc: YIdealloDocument): IdealloObject[] {
	const objects: IdealloObject[] = []
	doc.o.forEach((stored, id) => {
		objects.push(expandObject(id as ObjectId, stored))
	})
	return objects
}

/**
 * Update an object with partial changes
 */
export function updateObject(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	updates: Partial<IdealloObject>
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	const expanded = expandObject(objectId, existing)
	const updated = {
		...expanded,
		...updates,
		id: objectId,
		// Deep merge style if provided
		style: updates.style ? { ...expanded.style, ...updates.style } : expanded.style
	} as IdealloObject
	const compacted = compactObject(updated)

	yDoc.transact(() => {
		doc.o.set(objectId, compacted)
	}, yDoc.clientID)
}

/**
 * Update object position
 */
export function updateObjectPosition(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	x: number,
	y: number
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	yDoc.transact(() => {
		doc.o.set(objectId, { ...existing, xy: [x, y] })
	}, yDoc.clientID)
}

/**
 * Update object bounds (position + size for shapes)
 */
export function updateObjectBounds(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	x: number,
	y: number,
	width: number,
	height: number
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	// Only apply wh to types that have it
	if ('wh' in existing) {
		yDoc.transact(() => {
			doc.o.set(objectId, {
				...existing,
				xy: [x, y],
				wh: [width, height]
			})
		}, yDoc.clientID)
	} else {
		yDoc.transact(() => {
			doc.o.set(objectId, { ...existing, xy: [x, y] })
		}, yDoc.clientID)
	}
}

/**
 * Update object rotation
 */
export function updateObjectRotation(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	rotation: number
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	yDoc.transact(() => {
		if (rotation === 0) {
			// Remove rotation field if 0
			const { r: _, ...rest } = existing as any
			doc.o.set(objectId, rest)
		} else {
			doc.o.set(objectId, { ...existing, r: rotation })
		}
	}, yDoc.clientID)
}

/**
 * Update object pivot point (with position compensation)
 *
 * @param pivotX - New pivot X (0-1 normalized)
 * @param pivotY - New pivot Y (0-1 normalized)
 * @param compensationX - X position compensation to keep object visually in place
 * @param compensationY - Y position compensation to keep object visually in place
 */
export function updateObjectPivot(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	pivotX: number,
	pivotY: number,
	compensationX: number = 0,
	compensationY: number = 0
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	yDoc.transact(() => {
		// Apply position compensation
		const newX = existing.xy[0] + compensationX
		const newY = existing.xy[1] + compensationY

		if (pivotX === 0.5 && pivotY === 0.5) {
			// Remove pivot field if center
			const { pv: _, ...rest } = existing as any
			doc.o.set(objectId, { ...rest, xy: [newX, newY] })
		} else {
			doc.o.set(objectId, {
				...existing,
				xy: [newX, newY],
				pv: [pivotX, pivotY]
			})
		}
	}, yDoc.clientID)
}

/**
 * Delete an object
 */
export function deleteObject(yDoc: Y.Doc, doc: YIdealloDocument, objectId: ObjectId): void {
	yDoc.transact(() => {
		doc.o.delete(objectId)
	}, yDoc.clientID)
}

/**
 * Delete multiple objects
 */
export function deleteObjects(yDoc: Y.Doc, doc: YIdealloDocument, objectIds: ObjectId[]): void {
	yDoc.transact(() => {
		objectIds.forEach((id) => doc.o.delete(id))
	}, yDoc.clientID)
}

/**
 * Duplicate an object with optional offset
 */
export function duplicateObject(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	offsetX: number = 20,
	offsetY: number = 20
): ObjectId | undefined {
	const existing = doc.o.get(objectId)
	if (!existing) return undefined

	const newId = generateObjectId()
	const duplicated = {
		...existing,
		xy: [existing.xy[0] + offsetX, existing.xy[1] + offsetY] as [number, number]
	}

	yDoc.transact(() => {
		doc.o.set(newId, duplicated)
	}, yDoc.clientID)

	return newId
}

/**
 * Toggle object locked state
 */
export function toggleObjectLock(yDoc: Y.Doc, doc: YIdealloDocument, objectId: ObjectId): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	yDoc.transact(() => {
		if (existing.lk) {
			const { lk: _, ...rest } = existing as any
			doc.o.set(objectId, rest)
		} else {
			doc.o.set(objectId, { ...existing, lk: true })
		}
	}, yDoc.clientID)
}

// vim: ts=4

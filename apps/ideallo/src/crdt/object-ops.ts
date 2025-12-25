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
import type {
	YIdealloDocument,
	StoredFreehand,
	StoredPolygon,
	StoredText,
	StoredSticky
} from './stored-types.js'
import type { ObjectId } from './ids.js'
import { generateObjectId, toObjectId } from './ids.js'
import type {
	IdealloObject,
	FreehandObject,
	PolygonObject,
	TextObject,
	StickyObject,
	ImageObject,
	RectObject,
	EllipseObject,
	LineObject,
	ArrowObject,
	Style
} from './runtime-types.js'
import { DEFAULT_STYLE } from './runtime-types.js'
import { compactObject, expandObject } from './type-converters.js'

/**
 * Input type for creating new freehand objects
 */
export type NewFreehandInput = Omit<FreehandObject, 'id' | 'pid'> & { id?: ObjectId }

/**
 * Input type for creating new polygon objects
 */
export type NewPolygonInput = Omit<PolygonObject, 'id' | 'gid'> & { id?: ObjectId }

/**
 * Input type for creating new text objects
 */
export type NewTextInput = Omit<TextObject, 'id' | 'tid'> & { id?: ObjectId }

/**
 * Input type for creating new sticky objects
 */
export type NewStickyInput = Omit<StickyObject, 'id' | 'tid'> & { id?: ObjectId }

/**
 * Input type for creating new image objects
 */
export type NewImageInput = Omit<ImageObject, 'id'> & { id?: ObjectId }

/**
 * Input type for creating new objects
 * Text/geometry fields use expanded names, tid/gid are generated internally
 */
export type NewObjectInput =
	| NewFreehandInput
	| NewPolygonInput
	| NewTextInput
	| NewStickyInput
	| NewImageInput
	| (Omit<RectObject, 'id'> & { id?: ObjectId })
	| (Omit<EllipseObject, 'id'> & { id?: ObjectId })
	| (Omit<LineObject, 'id'> & { id?: ObjectId })
	| (Omit<ArrowObject, 'id'> & { id?: ObjectId })

/**
 * Add a new object to the document
 * Creates Y.Text/Y.Array entries for text/geometry objects
 *
 * @returns The ObjectId of the created object
 */
export function addObject(yDoc: Y.Doc, doc: YIdealloDocument, input: NewObjectInput): ObjectId {
	const objectId = input.id ?? generateObjectId()

	yDoc.transact(() => {
		let objectWithId: IdealloObject

		switch (input.type) {
			case 'freehand': {
				const fh = input as Omit<FreehandObject, 'id' | 'pid'>
				// Store SVG path string in paths map using object ID as key
				doc.paths.set(objectId, fh.pathData)
				objectWithId = { ...fh, id: objectId } as FreehandObject
				break
			}
			case 'polygon': {
				const poly = input as Omit<PolygonObject, 'id' | 'gid'>
				// Create Y.Array for geometry using object ID as key
				const yArray = new Y.Array<number>()
				const flatVerts: number[] = []
				for (const [x, y] of poly.vertices) {
					flatVerts.push(x, y)
				}
				yArray.push(flatVerts)
				doc.geo.set(objectId, yArray) // Use object ID as key (no separate gid)
				objectWithId = { ...poly, id: objectId } as PolygonObject
				break
			}
			case 'text': {
				const txt = input as Omit<TextObject, 'id' | 'tid'>
				// Create Y.Text for content using object ID as key
				const yText = new Y.Text()
				if (txt.text) {
					yText.insert(0, txt.text)
				}
				doc.txt.set(objectId, yText) // Use object ID as key (no separate tid)
				objectWithId = { ...txt, id: objectId } as TextObject
				break
			}
			case 'sticky': {
				const sticky = input as Omit<StickyObject, 'id' | 'tid'>
				// Create Y.Text for content using object ID as key
				const yText = new Y.Text()
				if (sticky.text) {
					yText.insert(0, sticky.text)
				}
				doc.txt.set(objectId, yText) // Use object ID as key (no separate tid)
				objectWithId = { ...sticky, id: objectId } as StickyObject
				break
			}
			default: {
				// Other object types (rect, ellipse, line, arrow) don't need special handling
				objectWithId = { ...input, id: objectId } as IdealloObject
			}
		}

		const stored = compactObject(objectWithId)
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
	return expandObject(objectId, stored, doc)
}

/**
 * Get all objects in the document
 */
export function getAllObjects(doc: YIdealloDocument): IdealloObject[] {
	const objects: IdealloObject[] = []
	doc.o.forEach((stored, id) => {
		objects.push(expandObject(id as ObjectId, stored, doc))
	})
	return objects
}

/**
 * Update an object with partial changes
 * Note: For text/geometry content updates, use updateObjectText/updateObjectGeometry
 * This function only updates object metadata and style, not content
 */
export function updateObject(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	updates: Partial<IdealloObject>
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	const expanded = expandObject(objectId, existing, doc)
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
 * Delete an object from the document
 *
 * Note: We don't delete associated txt/geo entries because:
 * 1. CRDT delete creates tombstones anyway (no space reclaimed)
 * 2. Linked copies may still reference the same txt/geo data
 * 3. Future GC pass can clean orphaned entries on export/compaction
 */
export function deleteObject(yDoc: Y.Doc, doc: YIdealloDocument, objectId: ObjectId): void {
	yDoc.transact(() => {
		doc.o.delete(objectId)
	}, yDoc.clientID)
}

/**
 * Delete multiple objects from the document
 *
 * Note: We don't delete associated txt/geo entries (see deleteObject comment)
 */
export function deleteObjects(yDoc: Y.Doc, doc: YIdealloDocument, objectIds: ObjectId[]): void {
	yDoc.transact(() => {
		objectIds.forEach((id) => {
			doc.o.delete(id)
		})
	}, yDoc.clientID)
}

/**
 * Duplicate an object with optional offset (TRUE COPY)
 * Creates independent text/geometry data for the new object
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

	yDoc.transact(() => {
		// Base duplicated object with offset
		const duplicated = {
			...existing,
			xy: [existing.xy[0] + offsetX, existing.xy[1] + offsetY] as [number, number]
		}

		// Handle text duplication (Text/Sticky objects)
		if (existing.t === 'T' || existing.t === 'S') {
			// Find source text: use tid if set (linked copy), otherwise original objectId
			const sourceTxtKey = (existing as any).tid ?? objectId
			const sourceText = doc.txt.get(sourceTxtKey)
			if (sourceText) {
				const newText = new Y.Text()
				newText.insert(0, sourceText.toString())
				doc.txt.set(newId, newText) // Use new object ID as key
			}
			// Remove tid from duplicate (uses own ID)
			delete (duplicated as any).tid
		}

		// Handle path duplication (Freehand objects)
		if (existing.t === 'F') {
			// Find source path: use pid if set (linked copy), otherwise original objectId
			const sourcePathKey = (existing as any).pid ?? objectId
			const sourcePath = doc.paths.get(sourcePathKey)
			if (sourcePath) {
				doc.paths.set(newId, sourcePath) // Use new object ID as key
			}
			// Remove pid from duplicate (uses own ID)
			delete (duplicated as any).pid
		}

		// Handle geometry duplication (Polygon objects)
		if (existing.t === 'P') {
			// Find source geo: use gid if set (linked copy), otherwise original objectId
			const sourceGeoKey = (existing as any).gid ?? objectId
			const sourceGeo = doc.geo.get(sourceGeoKey)
			if (sourceGeo) {
				const newGeo = new Y.Array<number>()
				newGeo.push(sourceGeo.toArray())
				doc.geo.set(newId, newGeo) // Use new object ID as key
			}
			// Remove gid from duplicate (uses own ID)
			delete (duplicated as any).gid
		}

		doc.o.set(newId, duplicated)
	}, yDoc.clientID)

	return newId
}

/**
 * Duplicate an object as a LINKED COPY
 * Shares the same text/geometry data with the original (or original's source)
 * Only object metadata (position, style, etc.) is independent
 */
export function duplicateAsLinkedCopy(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	offsetX: number = 20,
	offsetY: number = 20
): ObjectId | undefined {
	const existing = doc.o.get(objectId)
	if (!existing) return undefined

	const newId = generateObjectId()

	yDoc.transact(() => {
		// Base duplicated object with offset
		const duplicated: any = {
			...existing,
			xy: [existing.xy[0] + offsetX, existing.xy[1] + offsetY] as [number, number]
		}

		// For Text/Sticky: set tid to point to original's source
		if (existing.t === 'T' || existing.t === 'S') {
			// Use original's tid if set, otherwise use original objectId
			duplicated.tid = (existing as any).tid ?? objectId
		}

		// For Freehand: set pid to point to original's source
		if (existing.t === 'F') {
			// Use original's pid if set, otherwise use original objectId
			duplicated.pid = (existing as any).pid ?? objectId
		}

		// For Polygon: set gid to point to original's source
		if (existing.t === 'P') {
			// Use original's gid if set, otherwise use original objectId
			duplicated.gid = (existing as any).gid ?? objectId
		}

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

/**
 * Get Y.Text for an object (Text or Sticky)
 * Uses tid if set (linked copy), otherwise uses object ID as key
 * Returns undefined if object doesn't have text or text not found
 */
export function getObjectYText(doc: YIdealloDocument, objectId: ObjectId): Y.Text | undefined {
	const stored = doc.o.get(objectId)
	if (!stored) return undefined
	if (stored.t !== 'T' && stored.t !== 'S') return undefined
	// Use tid if set (linked copy), otherwise use object ID
	const txtKey = (stored as any).tid ?? objectId
	return doc.txt.get(txtKey)
}

/**
 * Get Y.Array for an object (Polygon only - freehand uses paths map)
 * Uses gid if set (linked copy), otherwise uses object ID as key
 * Returns undefined if object doesn't have geometry or geometry not found
 */
export function getObjectYArray(
	doc: YIdealloDocument,
	objectId: ObjectId
): Y.Array<number> | undefined {
	const stored = doc.o.get(objectId)
	if (!stored) return undefined
	if (stored.t !== 'P') return undefined
	// Use gid if set (linked copy), otherwise use object ID
	const geoKey = (stored as any).gid ?? objectId
	return doc.geo.get(geoKey)
}

/**
 * Get path data for a freehand object
 * Uses pid if set (linked copy), otherwise uses object ID as key
 * Returns undefined if object is not freehand or path not found
 */
export function getObjectPathData(doc: YIdealloDocument, objectId: ObjectId): string | undefined {
	const stored = doc.o.get(objectId)
	if (!stored) return undefined
	if (stored.t !== 'F') return undefined
	// Use pid if set (linked copy), otherwise use object ID
	const pathKey = (stored as any).pid ?? objectId
	return doc.paths.get(pathKey)
}

/**
 * Append points to a polygon object's geometry
 * This is efficient for real-time drawing - only new points are synced
 * Note: Freehand objects use paths map (SVG strings), not geo map
 */
export function appendGeometryPoints(
	doc: YIdealloDocument,
	objectId: ObjectId,
	points: [number, number][]
): void {
	const yArray = getObjectYArray(doc, objectId)
	if (!yArray) return

	const flatPoints: number[] = []
	for (const [x, y] of points) {
		flatPoints.push(x, y)
	}
	yArray.push(flatPoints)
}

/**
 * Replace all geometry points for a polygon object
 * Note: Freehand objects use paths map (SVG strings), not geo map
 */
export function replaceGeometryPoints(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	points: [number, number][]
): void {
	const yArray = getObjectYArray(doc, objectId)
	if (!yArray) return

	yDoc.transact(() => {
		yArray.delete(0, yArray.length)
		const flatPoints: number[] = []
		for (const [x, y] of points) {
			flatPoints.push(x, y)
		}
		yArray.push(flatPoints)
	}, yDoc.clientID)
}

// vim: ts=4

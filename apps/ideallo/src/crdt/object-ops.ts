// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * CRUD operations for objects in the CRDT document
 * All mutations are wrapped in yDoc.transact() for batching
 */

import * as Y from 'yjs'

import {
	findIncidentArrows,
	freezeBindings,
	freezeStoredArrowForDuplicate,
	isStoredTerminalPair
} from '../connectors/lifecycle.js'
import {
	buildConnectorContext,
	isBindable,
	resolveConnectorRoutes,
	toShapeGeometry
} from '../connectors/resolve.js'
import { shapeBoundsCenter } from '../connectors/types.js'
import type { ObjectId } from './ids.js'
import { generateObjectId } from './ids.js'
import type {
	AnchorPoint,
	ArrowStyle,
	ConnectorObject,
	DocumentObject,
	EllipseObject,
	FreehandObject,
	IdealloObject,
	ImageObject,
	PolygonObject,
	RectObject,
	Routing,
	StickyObject,
	TextAlign,
	TextObject,
	VerticalAlign
} from './runtime-types.js'
import { DEFAULT_END_ARROW, DEFAULT_ROUTING, DEFAULT_START_ARROW } from './runtime-types.js'
import type {
	ObjectTypeCode,
	StoredDocument,
	StoredObject,
	YIdealloDocument
} from './stored-types.js'
import { compactObject, expandObject, retireUnknownCodes } from './type-converters.js'

/**
 * Fields that can be updated across all object variants.
 * This is the intersection of commonly updated properties from all IdealloObject subtypes.
 * Avoids needing `as any` at every updateObject() call site.
 */
export type ObjectUpdateFields = Partial<{
	x: number
	y: number
	width: number
	height: number
	rotation: number
	pivotX: number
	pivotY: number
	opacity: number
	startX: number
	startY: number
	endX: number
	endY: number
	// Connector fields. All accept `undefined` so a binding can be CLEARED without `as any`.
	startObjectId: ObjectId | undefined
	startAnchor: AnchorPoint | undefined
	endObjectId: ObjectId | undefined
	endAnchor: AnchorPoint | undefined
	routing: Routing
	startArrow: ArrowStyle
	endArrow: ArrowStyle
	// Text style fields, on every text-bearing type (labels, notes and now shapes). Writing them to
	// another type is harmless - compactObject drops what its branch does not know - but pointless.
	fontFamily: string
	fontSize: number
	textAlign: TextAlign
	verticalAlign: VerticalAlign
	// Rounded corners, on rect/image/document. An OBJECT field, not a style one, so it cannot ride
	// along with the rest of the style through updateObject.
	cornerRadius: number
	locked: boolean
	style: Partial<IdealloObject['style']>
}>

/**
 * Transaction origin for writes that FOLLOW from an edit rather than being one.
 *
 * Deliberately not the client id, so the UndoManager skips it: the auto-grown height of a note is
 * a consequence of typing, and making it a second undo step means one Ctrl+Z that only shrinks a
 * box the user never sized by hand.
 */
export const LAYOUT_ORIGIN = 'layout'

/**
 * Update an object with fields that may come from any variant.
 * Centralizes the Partial<IdealloObject> cast so callers don't need `as any`.
 */
export function updateObjectFields(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	updates: ObjectUpdateFields,
	origin?: unknown
): void {
	updateObject(yDoc, doc, objectId, updates as Partial<IdealloObject>, origin)
}

/**
 * Move an object by (dx, dy).
 *
 * The one place that knows how each type moves, because "where is this object" is not one field: a
 * polygon's outline lives in `doc.geo`, a connector's free terminals in its own fields, everything
 * else in `xy` alone. Move an object through this, never by writing `xy` at the call site.
 *
 * `from` is the object as the gesture STARTED, not as it is now: a drag snapshots its originals at
 * pointer-down and commits an absolute result, so re-reading the record here would apply the delta
 * to a version a remote peer may have moved underneath us.
 *
 * The origin rides on the outer transaction only - Yjs discards a nested transaction's origin - so
 * the inner writes deliberately do not pass one.
 */
export function translateObject(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	from: IdealloObject,
	dx: number,
	dy: number,
	origin: unknown = yDoc.clientID
): void {
	if (!dx && !dy) return

	yDoc.transact(() => {
		switch (from.type) {
			case 'connector': {
				// A connector's stored position IS its start terminal, with `wh` the signed delta
				// to the end (see StoredConnector), so both terminals have to be considered - a
				// plain xy write would drag the end along with the start.
				//
				// A bound terminal's position is DERIVED from its target, so moving the connector
				// must not write it - the route would just snap back, and the write would be pure
				// CRDT churn. With both ends bound there is nothing to move at all; with one end
				// bound only the free end moves, which compacts to a `wh` change alone.
				const startBound = !!from.startObjectId
				const endBound = !!from.endObjectId
				if (startBound && endBound) return
				updateObjectFields(yDoc, doc, objectId, {
					...(startBound
						? {}
						: {
								x: from.x + dx,
								y: from.y + dy,
								startX: from.startX + dx,
								startY: from.startY + dy
							}),
					...(endBound ? {} : { endX: from.endX + dx, endY: from.endY + dy })
				})
				break
			}
			case 'polygon':
				// The vertices are ABSOLUTE, and they are what every consumer measures from -
				// renderer, bounds, hit testing, connector outlines - so writing xy alone moves
				// nothing. xy is written anyway to keep it equal to the vertex bbox origin, which is
				// what lets a 0.8.x peer (which cannot know xy is inert) agree about where the
				// shape is.
				//
				// A shared `gid` is one vertex array behind several objects, so this moves every
				// sibling with it. No production path sets gid today; that has to be resolved
				// before linked polygon copies ship.
				updateObjectFields(yDoc, doc, objectId, { x: from.x + dx, y: from.y + dy })
				replaceGeometryPoints(
					yDoc,
					doc,
					objectId,
					from.vertices.map(([vx, vy]) => [vx + dx, vy + dy] as [number, number])
				)
				break
			default:
				// Everything else, freehand included: its `pathData` is RELATIVE to x/y and drawn
				// through a <g transform> in FreehandPath.tsx, so moving the origin is the whole
				// move.
				updateObjectFields(yDoc, doc, objectId, { x: from.x + dx, y: from.y + dy })
				break
		}
	}, origin)
}

/**
 * The stored codes whose objects can carry a label in the `txt` map.
 *
 * One named export rather than inline `t === 'T' || t === 'S'` checks: getObjectYText,
 * duplicateObject and duplicateAsLinkedCopy are exactly the places a new text-bearing type is
 * easiest to forget. Grep for this name to find all of them.
 */
export const TEXT_BEARING_CODES: ReadonlySet<ObjectTypeCode> = new Set<ObjectTypeCode>([
	'T',
	'S',
	'R',
	'E',
	'P'
])

/**
 * Input type for creating new freehand objects
 */
export type NewFreehandInput = Omit<FreehandObject, 'id' | 'pid'> & { id?: ObjectId }

/**
 * Input type for creating new polygon objects
 */
export type NewPolygonInput = Omit<PolygonObject, 'id' | 'gid' | 'tid'> & { id?: ObjectId }

/**
 * Input types for the two box shapes. They carry an optional label, so like text and sticky they
 * omit `tid` - the txt key is the object id unless a linked copy sets one.
 */
export type NewRectInput = Omit<RectObject, 'id' | 'tid'> & { id?: ObjectId }

export type NewEllipseInput = Omit<EllipseObject, 'id' | 'tid'> & { id?: ObjectId }

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
 * Input type for creating new document embed objects
 */
export type NewDocumentInput = Omit<DocumentObject, 'id'> & { id?: ObjectId }

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
	| NewDocumentInput
	| NewRectInput
	| NewEllipseInput
	| (Omit<ConnectorObject, 'id'> & { id?: ObjectId })

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
				objectWithId = { ...input, id: objectId } as IdealloObject
			}
		}

		const stored = compactObject(objectWithId)
		doc.o.set(objectId, stored)
		doc.r.push([objectId])
	}, yDoc.clientID)

	return objectId
}

/**
 * Get an object by ID
 */
export function getObject(doc: YIdealloDocument, objectId: ObjectId): IdealloObject | undefined {
	const stored = doc.o.get(objectId)
	if (!stored) return undefined
	// Never expandObject(): this is on eight render-time memos in app.tsx, and a peer rewriting a
	// SELECTED object with a type code this build cannot read would throw out of a useMemo and,
	// with no error boundary, blank the canvas.
	return tryExpandObject(objectId, stored, doc) ?? undefined
}

/** Logged once per id, so an unreadable object does not spam the console on every render */
const warnedUnreadable = new Set<string>()

/**
 * Expand one stored record, or null when this build cannot read its type.
 *
 * expandObject() throws on an unknown `t`, which is the right contract for a direct caller - it
 * means a programming error there. On a READ path it is the wrong one: a peer on a newer version
 * can write a record we do not understand, and one throw would blank the whole canvas instead of
 * hiding one object. The record is left untouched, so a peer that does understand it keeps
 * rendering it and an upgrade brings it back here.
 */
export function tryExpandObject(
	id: ObjectId,
	stored: StoredObject,
	doc: YIdealloDocument
): IdealloObject | null {
	try {
		return expandObject(id, stored, doc)
	} catch (err) {
		if (!warnedUnreadable.has(id)) {
			warnedUnreadable.add(id)
			console.warn(
				`[ideallo] skipping unreadable object ${id} (t: ${(stored as { t?: unknown }).t})`,
				err
			)
		}
		return null
	}
}

/**
 * Get all objects in the document (in z-order, backmost first)
 *
 * An object whose stored `t` this build does not understand is SKIPPED, not fatal - see
 * tryExpandObject.
 */
export function getAllObjects(doc: YIdealloDocument): IdealloObject[] {
	const objects: IdealloObject[] = []
	const order = doc.r.toArray()
	for (const id of order) {
		const stored = doc.o.get(id)
		if (!stored) continue
		const obj = tryExpandObject(id as ObjectId, stored, doc)
		if (obj) objects.push(obj)
	}
	return objects
}

/**
 * Get all objects with connector routes resolved.
 *
 * Use this for anything that reads a connector's GEOMETRY - hit testing, eraser sweeps, bounds
 * for display. Keep using getAllObjects/getObject for anything that will be written back:
 * mutation paths must start from the raw stored endpoints, never from derived ones.
 */
export function getAllResolvedObjects(doc: YIdealloDocument): IdealloObject[] {
	return resolveConnectorRoutes(getAllObjects(doc))
}

/**
 * Update an object with partial changes
 * Note: For text/geometry content updates, use updateObjectText/updateObjectGeometry
 * This function only updates object metadata and style, not content
 *
 * `origin` defaults to the client id, which is what the UndoManager tracks. Pass something else -
 * the auto-grow height write does - to keep a change off the undo stack: a size the user never
 * asked for should not be its own Ctrl+Z step.
 */
export function updateObject(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	updates: Partial<IdealloObject>,
	origin: unknown = yDoc.clientID
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	const expanded = expandObject(objectId, existing, doc)
	const updated = {
		...expanded,
		...updates,
		id: objectId,
		// Deep merge style if provided
		style: updates.style ? { ...expanded.style, ...updates.style } : expanded.style,
		// A field this update names has been chosen deliberately - even when the choice happens to
		// be the default, which compacts to an ABSENT key and would otherwise let the peer's
		// unrecognised code be restored over it. See retireUnknownCodes.
		unknownCodes: retireUnknownCodes(expanded.unknownCodes, updates)
	} as IdealloObject
	const compacted = compactObject(updated)

	yDoc.transact(() => {
		doc.o.set(objectId, compacted)
	}, origin)
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
			const { r: _, ...rest } = existing
			doc.o.set(objectId, rest as StoredObject)
		} else {
			doc.o.set(objectId, { ...existing, r: rotation })
		}
	}, yDoc.clientID)
}

/*
 * There is deliberately no plain deleteObject() here any more, and no export of one.
 *
 * Every removal has to freeze the connectors bound to the object first, or their so_/eo become
 * dangling refs that fall back to a stale bind-time snapshot instead of the position the arrow was
 * last drawn at. deleteObjectsWithBindingCleanup() below is the ONE way to remove an object; it
 * takes a list, so a single id is just `[id]`. Re-adding a plain delete would let a caller opt out
 * of the freeze by accident - which is exactly what happened to the Smart Ink undo path.
 *
 * Neither path deletes the associated txt/geo/paths entries, because:
 * 1. CRDT delete creates tombstones anyway (no space reclaimed)
 * 2. Linked copies may still reference the same txt/geo data
 * 3. Future GC pass can clean orphaned entries on export/compaction
 */

/**
 * Create connectors between the given shapes, in the order they were selected.
 *
 * This is the keyboard path to a connector - every other way of making one is a drag, which
 * WCAG 2.2 SC 2.5.7 requires an alternative to. It is also the keyboard-flowchart lever:
 * select two boxes, press C, get a connector, repeat.
 *
 * Both terminals get auto anchors, so the router keeps choosing sensible sides as the shapes
 * move. `pts` is seeded from the shape centres purely as the dangling-ref fallback.
 *
 * @returns the ids of the connectors created
 */
export function connectObjects(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectIds: ObjectId[],
	defaults: {
		style: IdealloObject['style']
		routing?: Routing
		startArrow?: ArrowStyle
		endArrow?: ArrowStyle
	}
): ObjectId[] {
	// Only shapes can be connected, and it takes two to make a connector
	const shapes = objectIds
		.map((id) => getObject(doc, id))
		.filter((obj): obj is IdealloObject => Boolean(obj) && isBindable(obj as IdealloObject))
	if (shapes.length < 2) return []

	const created: ObjectId[] = []
	yDoc.transact(() => {
		for (let i = 0; i < shapes.length - 1; i++) {
			const from = shapes[i]
			const to = shapes[i + 1]
			const a = shapeBoundsCenter(toShapeGeometry(from))
			const b = shapeBoundsCenter(toShapeGeometry(to))
			created.push(
				addObject(yDoc, doc, {
					type: 'connector',
					x: Math.min(a[0], b[0]),
					y: Math.min(a[1], b[1]),
					startX: a[0],
					startY: a[1],
					endX: b[0],
					endY: b[1],
					startObjectId: from.id,
					endObjectId: to.id,
					startAnchor: 'auto',
					endAnchor: 'auto',
					routing: defaults.routing ?? DEFAULT_ROUTING,
					startArrow: defaults.startArrow ?? { ...DEFAULT_START_ARROW },
					endArrow: defaults.endArrow ?? { ...DEFAULT_END_ARROW },
					rotation: 0,
					pivotX: 0.5,
					pivotY: 0.5,
					locked: false,
					style: { ...defaults.style, fillColor: 'transparent' }
				})
			)
		}
	}, yDoc.clientID)
	return created
}

/**
 * The subset of `objectIds` a delete may actually remove.
 *
 * A lock means "cannot be modified", and deletion is the most irreversible modification there
 * is - useSelectHandler already refuses to drag a locked object and the eraser already skips
 * one. Filtered rather than refused outright, so a mixed selection still deletes what it may,
 * the same way a mixed drag moves what it may.
 */
export function deletableObjectIds(doc: YIdealloDocument, objectIds: ObjectId[]): ObjectId[] {
	return objectIds.filter((id) => {
		const obj = doc.o.get(id)
		return !!obj && !obj.lk
	})
}

/**
 * Delete objects, first freezing any connector bound to them.
 *
 * The orphan policy: an arrow attached to a deleted shape SURVIVES, frozen at the position it
 * last resolved to. On a whiteboard an arrow is a drawing, and destroying the user's drawings
 * because they removed a box is surprising and destructive.
 *
 * Freeze and delete share one transaction, so a single Ctrl+Z restores both the shape and the
 * arrow's binding to it.
 *
 * Locked objects are skipped (see deletableObjectIds): a lock protects against deletion too. The
 * filter lives here rather than at the call sites so all five callers inherit it.
 *
 * This is the only multi-object delete: anything removing objects must freeze incident connectors
 * first, so do not reintroduce an unguarded plain deleteObjects().
 */
export function deleteObjectsWithBindingCleanup(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectIds: ObjectId[]
): void {
	const ids = deletableObjectIds(doc, objectIds)
	if (!ids.length) return

	yDoc.transact(() => {
		const doomed = new Set<string>(ids as string[])
		const incident = findIncidentArrows(doc, ids).filter(
			// An arrow being deleted alongside its shapes needs no freezing
			(inc) => !doomed.has(inc.arrowId)
		)
		if (incident.length) {
			// Resolve against PRE-delete geometry so the frozen point is where it looks now
			const ctx = buildConnectorContext(getAllObjects(doc))
			for (const inc of incident) {
				const which = inc.start && inc.end ? 'both' : inc.start ? 'start' : 'end'
				freezeBindings(doc, inc.arrowId, which, ctx)
			}
		}

		const orderArr = doc.r.toArray()
		const indicesToDelete: number[] = []
		for (let i = 0; i < orderArr.length; i++) {
			if (doomed.has(orderArr[i])) indicesToDelete.push(i)
		}
		for (let i = indicesToDelete.length - 1; i >= 0; i--) {
			doc.r.delete(indicesToDelete[i], 1)
		}
		ids.forEach((id) => {
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
		let duplicated = {
			...existing,
			xy: [existing.xy[0] + offsetX, existing.xy[1] + offsetY] as [number, number]
		}

		// EVERY terminal pair goes through the freeze, bound or not, because the generic xy offset
		// above cannot be trusted to move one: a legacy 'A' or 'L' (and a pre-release 'C') keeps
		// its geometry in `pts` with `xy` inert, so the copy would land exactly on top of the
		// original. The freeze reads the terminals whichever spelling they use, offsets both, and
		// writes xy/wh - which also migrates the record on the way.
		//
		// A bound copy additionally DETACHES, its terminals frozen at their resolved position.
		// Keeping the bindings would make the copy resolve to exactly the same route as the
		// original, so the user would see nothing happen. Taken wholesale rather than merged - the
		// freeze already applied the offset to both terminals, and restoring `duplicated.xy` on
		// top would put the copy back on the original's stale bind-time snapshot.
		if (isStoredTerminalPair(existing)) {
			const ctx = buildConnectorContext(getAllObjects(doc))
			duplicated = freezeStoredArrowForDuplicate(
				doc,
				objectId,
				existing,
				ctx,
				offsetX,
				offsetY
			)
		}

		// Handle text duplication (every text-bearing type, shapes included)
		if (TEXT_BEARING_CODES.has(existing.t)) {
			// Find source text: use tid if set (linked copy), otherwise original objectId
			const sourceTxtKey = (existing as { tid?: string }).tid ?? objectId
			const sourceText = doc.txt.get(sourceTxtKey)
			if (sourceText) {
				const newText = new Y.Text()
				newText.insert(0, sourceText.toString())
				doc.txt.set(newId, newText) // Use new object ID as key
			}
			delete (duplicated as Record<string, unknown>).tid
		}

		// Handle path duplication (Freehand objects)
		if (existing.t === 'F') {
			// Find source path: use pid if set (linked copy), otherwise original objectId
			const sourcePathKey = existing.pid ?? objectId
			const sourcePath = doc.paths.get(sourcePathKey)
			if (sourcePath) {
				doc.paths.set(newId, sourcePath) // Use new object ID as key
			}
			delete (duplicated as Record<string, unknown>).pid
		}

		// Handle geometry duplication (Polygon objects)
		if (existing.t === 'P') {
			// Find source geo: use gid if set (linked copy), otherwise original objectId
			const sourceGeoKey = existing.gid ?? objectId
			const sourceGeo = doc.geo.get(sourceGeoKey)
			if (sourceGeo) {
				const newGeo = new Y.Array<number>()
				// The vertices are absolute, so they have to carry the same offset as xy or the
				// copy lands exactly on the original and the user sees nothing happen. Flat array,
				// even index = x. Mapped into a new array: the source must not move.
				newGeo.push(
					sourceGeo.toArray().map((v, i) => (i % 2 === 0 ? v + offsetX : v + offsetY))
				)
				doc.geo.set(newId, newGeo) // Use new object ID as key
			}
			delete (duplicated as Record<string, unknown>).gid
		}

		doc.o.set(newId, duplicated)
		doc.r.push([newId])
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
		let duplicated: Record<string, unknown> = {
			...existing,
			xy: [existing.xy[0] + offsetX, existing.xy[1] + offsetY] as [number, number]
		}

		// A connector has no linkable payload - tid/pid/gid share text, path and geometry, and a
		// connector carries none of those - so a "linked" copy is just a copy, and detaches the
		// same way. Without this the copy would resolve to the original's route and be invisible.
		// Replaced wholesale rather than merged: the freeze DELETES so_/eo, which a merge cannot,
		// and it has already offset both terminals - see duplicateObject for why it runs for an
		// unbound connector (and a legacy 'L') too and why xy is not re-applied on top.
		if (isStoredTerminalPair(existing)) {
			const ctx = buildConnectorContext(getAllObjects(doc))
			duplicated = freezeStoredArrowForDuplicate(
				doc,
				objectId,
				existing,
				ctx,
				offsetX,
				offsetY
			) as unknown as Record<string, unknown>
		}

		// For every text-bearing type: set tid to point to original's source
		if (TEXT_BEARING_CODES.has(existing.t)) {
			duplicated.tid = (existing as { tid?: string }).tid ?? objectId
		}

		// For Freehand: set pid to point to original's source
		if (existing.t === 'F') {
			duplicated.pid = existing.pid ?? objectId
		}

		// For Polygon: set gid to point to original's source.
		//
		// KNOWN LIMITATION, no production caller: the shared vertex array is ABSOLUTE, so the copy
		// renders exactly on top of the original (xy is inert for a polygon) and translateObject on
		// either one moves both. "Linked polygon copy" has no defined semantics yet; whoever gives
		// it one has to decide whether the geo array becomes relative or the copy gets its own.
		if (existing.t === 'P') {
			duplicated.gid = existing.gid ?? objectId
		}

		doc.o.set(newId, duplicated as unknown as StoredObject)
		doc.r.push([newId])
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
			const { lk: _, ...rest } = existing
			doc.o.set(objectId, rest as StoredObject)
		} else {
			doc.o.set(objectId, { ...existing, lk: true })
		}
	}, yDoc.clientID)
}

/**
 * Get Y.Text for a text-bearing object
 * Uses tid if set (linked copy), otherwise uses object ID as key
 * Returns undefined if object can't have text, or has none yet
 */
export function getObjectYText(doc: YIdealloDocument, objectId: ObjectId): Y.Text | undefined {
	const stored = doc.o.get(objectId)
	if (!stored || !TEXT_BEARING_CODES.has(stored.t)) return undefined
	const txtKey = (stored as { tid?: string }).tid ?? objectId
	return doc.txt.get(txtKey)
}

/**
 * The Y.Text an editor is about to write into, created on demand.
 *
 * Lazy rather than made in addObject: a board full of empty Y.Texts is pure overhead, and a shape
 * is born without text. Returns the existing one for an object that already has a label, and
 * `undefined` when the object is gone - a peer may have deleted it between the double-click and
 * this call, and nothing GCs doc.txt, so a Y.Text written for a record that no longer exists is
 * an orphan forever.
 */
export function ensureObjectYText(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId
): Y.Text | undefined {
	const existing = getObjectYText(doc, objectId)
	if (existing) return existing
	const stored = doc.o.get(objectId)
	if (!stored) return undefined
	const txtKey = (stored as { tid?: string }).tid ?? objectId
	const yText = new Y.Text()
	yDoc.transact(() => {
		doc.txt.set(txtKey, yText)
	}, yDoc.clientID)
	return yText
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
	const geoKey = stored.gid ?? objectId
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
	const pathKey = stored.pid ?? objectId
	return doc.paths.get(pathKey)
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

// ---- Z-order operations ----

type ZIndexOperation = 'toFront' | 'toBack' | 'forward' | 'backward'

function reorderObject(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	operation: ZIndexOperation
): void {
	yDoc.transact(() => {
		const arr = doc.r.toArray()
		const currentIndex = arr.indexOf(objectId)
		if (currentIndex < 0) return

		let targetIndex: number
		let canMove: boolean

		switch (operation) {
			case 'toFront':
				targetIndex = arr.length
				canMove = currentIndex < arr.length - 1
				break
			case 'toBack':
				targetIndex = 0
				canMove = currentIndex > 0
				break
			case 'forward':
				targetIndex = currentIndex + 1
				canMove = currentIndex < arr.length - 1
				break
			case 'backward':
				targetIndex = currentIndex - 1
				canMove = currentIndex > 0
				break
		}

		if (canMove) {
			doc.r.delete(currentIndex, 1)
			if (operation === 'toFront') {
				doc.r.push([objectId])
			} else {
				doc.r.insert(targetIndex, [objectId])
			}
		}
	}, yDoc.clientID)
}

/**
 * Bring object to front (highest z-index)
 */
export function bringToFront(yDoc: Y.Doc, doc: YIdealloDocument, objectId: ObjectId): void {
	reorderObject(yDoc, doc, objectId, 'toFront')
}

/**
 * Send object to back (lowest z-index)
 */
export function sendToBack(yDoc: Y.Doc, doc: YIdealloDocument, objectId: ObjectId): void {
	reorderObject(yDoc, doc, objectId, 'toBack')
}

/**
 * Bring object forward one level
 */
export function bringForward(yDoc: Y.Doc, doc: YIdealloDocument, objectId: ObjectId): void {
	reorderObject(yDoc, doc, objectId, 'forward')
}

/**
 * Send object backward one level
 */
export function sendBackward(yDoc: Y.Doc, doc: YIdealloDocument, objectId: ObjectId): void {
	reorderObject(yDoc, doc, objectId, 'backward')
}

/**
 * Update the navigation state (and optional aspect ratio) of a document embed object.
 * Only writes to CRDT if the stored value actually differs.
 */
export function updateDocumentNavState(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	objectId: ObjectId,
	navState: string,
	aspectRatio?: [number, number]
): void {
	const existing = doc.o.get(objectId)
	if (existing?.t !== 'D') return

	const stored = existing as StoredDocument
	// Skip if nothing changed
	if (
		stored.ns === navState &&
		stored.ar?.[0] === aspectRatio?.[0] &&
		stored.ar?.[1] === aspectRatio?.[1]
	) {
		return
	}

	yDoc.transact(() => {
		const updated: StoredDocument = { ...stored, ns: navState }
		if (aspectRatio) {
			updated.ar = aspectRatio
		}
		doc.o.set(objectId, updated)
	}, yDoc.clientID)
}

// vim: ts=4

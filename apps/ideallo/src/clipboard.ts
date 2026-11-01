// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Copy / paste of whiteboard objects through the system clipboard.
 *
 * Follows duplicateObject's rules (crdt/object-ops.ts): linked text/path/geometry is resolved to
 * its source and copied as independent data, every terminal pair is normalised to a 'C' with
 * xy/wh, and a connector binding survives only when its target is copied along with it (paste
 * remaps it to the copy's new id); any other binding is frozen at its resolved position.
 */

import { type CanvasClipboardSource, hasValidFileRef } from '@cloudillo/canvas-tools'
import * as Y from 'yjs'

import { freezeStoredArrowForDuplicate, isStoredTerminalPair } from './connectors/lifecycle.js'
import { buildConnectorContext } from './connectors/resolve.js'
import type { ConnectorContext } from './connectors/types.js'
import type { Bounds, ObjectId, StoredObject, YIdealloDocument } from './crdt/index.js'
import { generateObjectId, getAllObjects, getAllResolvedObjects } from './crdt/index.js'
import { TEXT_BEARING_CODES } from './crdt/object-ops.js'
import { getObjectBounds } from './utils/bounds.js'

/** The app id the clipboard codec tags ideallo payloads with */
export const CLIPBOARD_APP = 'ideallo'

export interface ClipboardObject {
	/** Source id, only used to remap connector bindings inside the copy */
	id: string
	stored: StoredObject
	txt?: string
	path?: string
	geo?: number[]
}

export interface IdealloClipboard {
	/** Set by the copy handler; a paste into another document links its files first */
	source?: CanvasClipboardSource
	objects: ClipboardObject[]
	bounds: Bounds
}

/** The given objects in z-order, ready for encodeCanvasClipboard, or null when none exist */
export function collectClipboard(
	doc: YIdealloDocument,
	ids: Iterable<ObjectId>
): IdealloClipboard | null {
	const wanted = new Set<string>(ids as Iterable<string>)
	const order = doc.r.toArray().filter((id) => wanted.has(id) && doc.o.has(id))
	if (!order.length) return null
	const copied = new Set(order)

	const resolved = new Map(getAllResolvedObjects(doc).map((o) => [o.id as string, o]))
	let ctx: ConnectorContext | undefined
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	const objects: ClipboardObject[] = []

	for (const id of order) {
		const src = doc.o.get(id) as StoredObject
		let stored = { ...src } as StoredObject
		const item: ClipboardObject = { id, stored }

		if (isStoredTerminalPair(src)) {
			ctx ??= buildConnectorContext(getAllObjects(doc))
			const frozen = freezeStoredArrowForDuplicate(doc, id as ObjectId, src, ctx, 0, 0)
			if (src.t !== 'L') {
				if (src.so_ && copied.has(src.so_)) {
					frozen.so_ = src.so_
					if (src.sa) frozen.sa = src.sa
				}
				if (src.eo && copied.has(src.eo)) {
					frozen.eo = src.eo
					if (src.ea) frozen.ea = src.ea
				}
			}
			stored = frozen
		}

		if (TEXT_BEARING_CODES.has(src.t)) {
			const text = doc.txt.get((src as { tid?: string }).tid ?? id)
			if (text) item.txt = text.toString()
			delete (stored as { tid?: string }).tid
		}
		if (src.t === 'F') {
			const path = doc.paths.get(src.pid ?? id)
			if (path !== undefined) item.path = path
			delete (stored as { pid?: string }).pid
		}
		if (src.t === 'P') {
			const geo = doc.geo.get(src.gid ?? id)
			if (geo) item.geo = geo.toArray()
			delete (stored as { gid?: string }).gid
		}
		// Only one embed of a file may be live-editable at a time
		if (src.t === 'D') delete (stored as { ed?: unknown }).ed

		item.stored = stored
		objects.push(item)

		const obj = resolved.get(id)
		if (obj) {
			const b = getObjectBounds(obj)
			minX = Math.min(minX, b.x)
			minY = Math.min(minY, b.y)
			maxX = Math.max(maxX, b.x + b.width)
			maxY = Math.max(maxY, b.y + b.height)
		}
	}

	const bounds: Bounds =
		minX <= maxX
			? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
			: { x: 0, y: 0, width: 0, height: 0 }
	return { objects, bounds }
}

/** The file (image, embedded document) an item references, for the canvas-tools ref helpers */
export const clipboardFileRef = (item: ClipboardObject | undefined): unknown =>
	(item?.stored as { fid?: unknown } | undefined)?.fid

/** Pasted coordinates beyond this are rejected: they would put objects out of reach */
const MAX_COORD = 1e7

const isCoord = (n: unknown): n is number =>
	Number.isFinite(n) && Math.abs(n as number) <= MAX_COORD

function isPair(v: unknown): v is [number, number] {
	return Array.isArray(v) && v.length === 2 && v.every(isCoord)
}

const isSize = (v: unknown): v is [number, number] => isPair(v) && v[0] >= 0 && v[1] >= 0

/** Type codes collect emits (ObjectTypeCode minus the legacy line/arrow `L`/`A`) */
const PASTE_CODES = new Set(['F', 'R', 'E', 'C', 'T', 'P', 'S', 'I', 'D', 'M'])

/** Objects beyond this many in one paste are dropped */
const MAX_PASTE_OBJECTS = 5000

/**
 * Write a payload into `doc` under fresh ids, moved by (dx, dy), in one undoable transaction.
 * Returns the new ids in z-order. Items that are not well-formed records are skipped: the
 * payload came off the system clipboard, so anything could have written it.
 */
export function pasteClipboard(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	payload: IdealloClipboard,
	dx: number,
	dy: number
): ObjectId[] {
	// `item.stored` keys are not whitelisted per type; unknown keys are inert data in
	// the Yjs doc. Add a per-type pick if a key ever becomes behaviour-bearing.
	const items = (Array.isArray(payload.objects) ? payload.objects : [])
		.filter(
			(item) =>
				item &&
				typeof item.id === 'string' &&
				PASTE_CODES.has(item.stored?.t) &&
				isPair(item.stored.xy) &&
				(item.stored.t === 'P' || isSize((item.stored as { wh?: unknown }).wh)) &&
				(item.geo === undefined ||
					(Array.isArray(item.geo) &&
						item.geo.length % 2 === 0 &&
						item.geo.every(isCoord))) &&
				hasValidFileRef((item.stored as { fid?: unknown }).fid)
		)
		.slice(0, MAX_PASTE_OBJECTS)
	const newIds = items.map(() => generateObjectId())
	const idMap = new Map(items.map((item, i) => [item.id, newIds[i]]))

	yDoc.transact(() => {
		items.forEach((item, i) => {
			const newId = newIds[i]
			const rec = {
				...item.stored,
				xy: [item.stored.xy[0] + dx, item.stored.xy[1] + dy]
			} as StoredObject
			// Links to another object's text/path/geometry, and the live-edit flag: collect
			// strips them, but the payload is untrusted, so a crafted one could share an
			// existing object's data. The copy's own data is keyed by newId below.
			const links = rec as unknown as Record<string, unknown>
			delete links.tid
			delete links.pid
			delete links.gid
			delete links.ed
			// Legacy inline points / arrowheads: nothing current writes or should receive them
			delete links.pts
			delete links.ah

			if (rec.t === 'A' || rec.t === 'C') {
				const so = rec.so_ && idMap.get(rec.so_)
				if (so) rec.so_ = so
				else {
					delete rec.so_
					delete rec.sa
				}
				const eo = rec.eo && idMap.get(rec.eo)
				if (eo) rec.eo = eo
				else {
					delete rec.eo
					delete rec.ea
				}
			}

			if (typeof item.txt === 'string') {
				const text = new Y.Text()
				text.insert(0, item.txt)
				doc.txt.set(newId, text)
			}
			if (typeof item.path === 'string') doc.paths.set(newId, item.path)
			if (Array.isArray(item.geo)) {
				const geo = new Y.Array<number>()
				// Absolute vertices, flat array (even index = x): they carry the offset too
				geo.push(item.geo.map((v, j) => (j % 2 === 0 ? v + dx : v + dy)))
				doc.geo.set(newId, geo)
			}

			doc.o.set(newId, rec)
			doc.r.push([newId])
		})
	}, yDoc.clientID)

	return newIds
}

// vim: ts=4

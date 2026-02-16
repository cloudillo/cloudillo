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
import type {
	YPrezilloDocument,
	ChildRef,
	StoredObject,
	StoredPaletteRef,
	StoredText,
	StoredRect,
	StoredImage,
	StoredPath,
	StoredLine,
	StoredPolygon,
	StoredQrCode,
	StoredPollFrame,
	StoredTableGrid,
	StoredSymbol,
	StoredEmbed,
	StoredConnector
} from './stored-types'
import type { ObjectId, ContainerId, ViewId } from './ids'
import { generateObjectId } from './ids'
import type { PrezilloObject } from './runtime-types'
import type * as Runtime from './runtime-types'
import {
	compactObject,
	expandObject,
	compactShapeStyle,
	compactTextStyle,
	compactArrowStyle,
	compactAnchorPoint
} from './type-converters'
import { getContainerChildren, getOrCreateRichText } from './document'
import { getAbsolutePositionStored } from './transforms'
import { resolveObject, getInstancesOfPrototype, detachInstance } from './prototype-ops'
import { getTemplateIdForPrototype } from './template-ops'

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

		// For text objects, create Y.Text entry in doc.rt
		if (stored.t === 'T') {
			const yText = new Y.Text()
			const textContent = (stored as StoredText).tx
			if (textContent) {
				yText.insert(0, textContent)
			}
			doc.rt.set(objectId, yText)
			// Remove tx from stored object (content lives in doc.rt)
			if (textContent !== undefined) {
				const updated = { ...stored }
				delete (updated as StoredText).tx
				doc.o.set(objectId, updated)
			}
		}

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
		case 'image':
			object = { ...base, type: 'image', fileId: '' } as any
			break
		case 'embed':
			object = { ...base, type: 'embed', embedType: 'iframe', src: '' } as any
			break
		case 'connector':
			object = { ...base, type: 'connector' } as any
			break
		case 'qrcode':
			object = {
				...base,
				type: 'qrcode',
				url: ''
			} as any
			break
		case 'pollframe':
			object = {
				...base,
				type: 'pollframe',
				shape: 'rect',
				label: ''
			} as any
			break
		case 'tablegrid':
			object = {
				...base,
				type: 'tablegrid',
				cols: 3,
				rows: 3,
				// Default style: transparent fill, light gray stroke for grid lines
				s: {
					f: 'none',
					s: '#cccccc',
					sw: 1
				}
			} as any
			break
		case 'symbol':
			object = {
				...base,
				type: 'symbol',
				symbolId: '' // Will be set by caller via addObject
			} as any
			break
		case 'statevar':
			object = {
				...base,
				type: 'statevar',
				varType: 'users'
			} as any
			break
		default:
			throw new Error(`Unknown object type: ${type}`)
	}

	return addObject(yDoc, doc, object, parentId, insertIndex, pageId)
}

/**
 * Create a table grid with specified rows and columns.
 * @param pageId - If provided, x/y are page-relative coordinates
 */
export function createTableGrid(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	cols: number,
	rows: number,
	x: number,
	y: number,
	width: number,
	height: number,
	parentId?: ContainerId,
	insertIndex?: number,
	pageId?: ViewId
): ObjectId {
	const objectId = generateObjectId()

	const object: PrezilloObject = {
		id: objectId,
		type: 'tablegrid',
		x,
		y,
		width,
		height,
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		opacity: 1,
		visible: true,
		locked: false,
		hidden: false,
		cols,
		rows,
		// Default style: transparent fill, light gray stroke for grid lines
		style: {
			fill: 'none',
			stroke: '#cccccc',
			strokeWidth: 1
		}
	} as any

	return addObject(yDoc, doc, object, parentId, insertIndex, pageId)
}

/**
 * Get an object by ID (returns runtime type with prototype values resolved)
 */
export function getObject(doc: YPrezilloDocument, objectId: ObjectId): PrezilloObject | undefined {
	return resolveObject(doc, objectId)
}

// Routing type reverse map for connector routing conversion
const ROUTING_REVERSE: Record<Runtime.Routing, 'S' | 'O' | 'C'> = {
	straight: 'S',
	orthogonal: 'O',
	curved: 'C'
}

// Poll frame shape reverse map
const POLL_SHAPE_REVERSE: Record<'rect' | 'ellipse', 'R' | 'E'> = {
	rect: 'R',
	ellipse: 'E'
}

// QR Error correction reverse map
const QR_ERROR_CORRECTION_REVERSE: Record<Runtime.QrErrorCorrection, 'L' | 'M' | 'Q' | 'H'> = {
	low: 'L',
	medium: 'M',
	quartile: 'Q',
	high: 'H'
}

/**
 * Apply a single runtime property update directly to a stored object.
 * This preserves existing stored properties (like palette refs) that aren't being updated.
 * @param stored - The stored object to update (mutated in place)
 * @param key - The runtime property name
 * @param value - The runtime property value
 */
function applyRuntimeUpdateToStored(stored: StoredObject, key: string, value: unknown): void {
	switch (key) {
		// Skip immutable fields
		case 'id':
		case 'type':
			break

		// Base position/size fields
		case 'x':
			stored.xy = [value as number, stored.xy[1]]
			break
		case 'y':
			stored.xy = [stored.xy[0], value as number]
			break
		case 'width':
			stored.wh = [value as number, stored.wh[1]]
			break
		case 'height':
			stored.wh = [stored.wh[0], value as number]
			break
		case 'rotation':
			if (value === 0) delete stored.r
			else stored.r = value as number
			break
		case 'pivotX':
			if (value === 0.5 && (stored.pv?.[1] ?? 0.5) === 0.5) delete stored.pv
			else stored.pv = [value as number, stored.pv?.[1] ?? 0.5]
			break
		case 'pivotY':
			if ((stored.pv?.[0] ?? 0.5) === 0.5 && value === 0.5) delete stored.pv
			else stored.pv = [stored.pv?.[0] ?? 0.5, value as number]
			break
		case 'opacity':
			if (value === 1) delete stored.o
			else stored.o = value as number
			break
		case 'visible':
			if (value === true) delete stored.v
			else stored.v = false
			break
		case 'locked':
			if (value === false) delete stored.k
			else stored.k = true
			break
		case 'hidden':
			if (value === false) delete stored.hid
			else stored.hid = true
			break

		// Reference fields
		case 'name':
			if (!value) delete stored.n
			else stored.n = value as string
			break
		case 'pageId':
			if (!value) delete stored.vi
			else stored.vi = value as string
			break
		case 'parentId':
			if (!value) delete stored.p
			else stored.p = value as string
			break
		case 'prototypeId':
			if (!value) delete stored.proto
			else stored.proto = value as string
			break
		case 'shapeStyleId':
			if (!value) delete stored.si
			else stored.si = value as string
			break
		case 'textStyleId':
			if (!value) delete stored.ti
			else stored.ti = value as string
			break

		// Style: MERGE into existing s, don't replace (preserves palette refs)
		case 'style':
			if (value) {
				const compacted = compactShapeStyle(value as Runtime.ShapeStyle)
				if (compacted) {
					stored.s = { ...(stored.s || {}), ...compacted }
				}
			}
			break

		// Text style: MERGE into existing ts, don't replace (preserves palette refs)
		case 'textStyle':
			if (value) {
				const compacted = compactTextStyle(value as Runtime.TextStyle)
				if (compacted) {
					stored.ts = { ...(stored.ts || {}), ...compacted }
				}
			}
			break

		// Type-specific: Text
		// Note: text content is now stored in doc.rt Y.Text, not in tx.
		// The 'text' runtime field is a read-only plain text representation.
		case 'text':
			// Legacy: only write to tx if explicitly set (for backwards compat during transition)
			break
		case 'minHeight':
			if (stored.t === 'T') {
				if (!value) delete (stored as StoredText).mh
				else (stored as StoredText).mh = value as number
			}
			break

		// Type-specific: Rect
		case 'cornerRadius':
			if (stored.t === 'R') {
				if (!value) delete (stored as StoredRect).cr
				else (stored as StoredRect).cr = value as number | [number, number, number, number]
			}
			break

		// Type-specific: Image
		case 'fileId':
			if (stored.t === 'I') (stored as StoredImage).fid = value as string
			break

		// Type-specific: Path
		case 'pathData':
			if (stored.t === 'P') (stored as StoredPath).d = value as string
			break

		// Type-specific: Line
		case 'points':
			if (stored.t === 'L') {
				;(stored as StoredLine).pts = value as [[number, number], [number, number]]
			} else if (stored.t === 'G') {
				;(stored as StoredPolygon).pts = value as [number, number][]
			}
			break

		// Type-specific: Polygon
		case 'closed':
			if (stored.t === 'G') {
				if (!value) delete (stored as StoredPolygon).cl
				else (stored as StoredPolygon).cl = value as boolean
			}
			break

		// Type-specific: QrCode
		case 'url':
			if (stored.t === 'Q') (stored as StoredQrCode).url = value as string
			break
		case 'errorCorrection':
			if (stored.t === 'Q') {
				const ecl = value as Runtime.QrErrorCorrection
				if (ecl === 'medium') delete (stored as StoredQrCode).ecl
				else (stored as StoredQrCode).ecl = QR_ERROR_CORRECTION_REVERSE[ecl]
			}
			break
		case 'foreground':
			if (stored.t === 'Q') {
				if (value === '#000000') delete (stored as StoredQrCode).fg
				else (stored as StoredQrCode).fg = value as string
			}
			break
		case 'background':
			if (stored.t === 'Q') {
				if (value === '#ffffff') delete (stored as StoredQrCode).bg
				else (stored as StoredQrCode).bg = value as string
			}
			break

		// Type-specific: TableGrid
		case 'cols':
			if (stored.t === 'Tg') (stored as StoredTableGrid).c = value as number
			break
		case 'rows':
			if (stored.t === 'Tg') (stored as StoredTableGrid).rw = value as number
			break
		case 'columnWidths':
			if (stored.t === 'Tg') {
				if (!value) delete (stored as StoredTableGrid).cw
				else (stored as StoredTableGrid).cw = value as number[]
			}
			break
		case 'rowHeights':
			if (stored.t === 'Tg') {
				if (!value) delete (stored as StoredTableGrid).rh
				else (stored as StoredTableGrid).rh = value as number[]
			}
			break

		// Type-specific: Symbol
		case 'symbolId':
			if (stored.t === 'S') (stored as StoredSymbol).sid = value as string
			break

		// Type-specific: Embed
		case 'embedType':
			if (stored.t === 'M') (stored as StoredEmbed).mt = value as 'iframe' | 'video' | 'audio'
			break
		case 'src':
			if (stored.t === 'M') (stored as StoredEmbed).src = value as string
			break

		// Type-specific: PollFrame
		case 'label':
			if (stored.t === 'F') {
				if (!value) delete (stored as StoredPollFrame).lb
				else (stored as StoredPollFrame).lb = value as string
			}
			break
		case 'shape':
			if (stored.t === 'F') {
				const shape = value as 'rect' | 'ellipse'
				if (shape === 'rect') delete (stored as StoredPollFrame).sh
				else (stored as StoredPollFrame).sh = POLL_SHAPE_REVERSE[shape]
			}
			break

		// Type-specific: Connector
		case 'startObjectId':
			if (stored.t === 'C') {
				if (!value) delete (stored as StoredConnector).so_
				else (stored as StoredConnector).so_ = value as string
			}
			break
		case 'endObjectId':
			if (stored.t === 'C') {
				if (!value) delete (stored as StoredConnector).eo
				else (stored as StoredConnector).eo = value as string
			}
			break
		case 'startAnchor':
			if (stored.t === 'C') {
				const anchor = compactAnchorPoint(value as Runtime.AnchorPoint)
				if (!anchor) delete (stored as StoredConnector).sa
				else (stored as StoredConnector).sa = anchor
			}
			break
		case 'endAnchor':
			if (stored.t === 'C') {
				const anchor = compactAnchorPoint(value as Runtime.AnchorPoint)
				if (!anchor) delete (stored as StoredConnector).ea
				else (stored as StoredConnector).ea = anchor
			}
			break
		case 'waypoints':
			if (stored.t === 'C') {
				if (!value || (value as [number, number][]).length === 0)
					delete (stored as StoredConnector).wp
				else (stored as StoredConnector).wp = value as [number, number][]
			}
			break
		case 'routing':
			if (stored.t === 'C') {
				const routing = value as Runtime.Routing | undefined
				if (!routing) delete (stored as StoredConnector).rt
				else (stored as StoredConnector).rt = ROUTING_REVERSE[routing]
			}
			break

		// Arrow styles (used by both Line and Connector)
		case 'startArrow':
			if (stored.t === 'L') {
				const arrow = compactArrowStyle(value as Runtime.ArrowStyle)
				if (!arrow) delete (stored as StoredLine).sa
				else (stored as StoredLine).sa = arrow
			} else if (stored.t === 'C') {
				const arrow = compactArrowStyle(value as Runtime.ArrowStyle)
				if (!arrow) delete (stored as StoredConnector).sar
				else (stored as StoredConnector).sar = arrow
			}
			break
		case 'endArrow':
			if (stored.t === 'L') {
				const arrow = compactArrowStyle(value as Runtime.ArrowStyle)
				if (!arrow) delete (stored as StoredLine).ea
				else (stored as StoredLine).ea = arrow
			} else if (stored.t === 'C') {
				const arrow = compactArrowStyle(value as Runtime.ArrowStyle)
				if (!arrow) delete (stored as StoredConnector).ear
				else (stored as StoredConnector).ear = arrow
			}
			break
	}
}

/**
 * Update an existing object.
 * Works directly on stored format to preserve palette references and other data
 * that isn't properly handled by the expand/compact cycle.
 */
export function updateObject(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	updates: Partial<PrezilloObject>
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	yDoc.transact(() => {
		// Clone existing stored object (preserves ALL data including palette refs)
		const updated = { ...existing }

		// Apply each update directly to stored format
		for (const [key, value] of Object.entries(updates)) {
			applyRuntimeUpdateToStored(updated, key, value)
		}

		doc.o.set(objectId, updated)
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
 * Update object opacity directly on stored format.
 * Avoids expand/compact cycle which loses palette references in style.
 */
export function updateObjectOpacity(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	opacity: number
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	yDoc.transact(() => {
		if (opacity === 1) {
			// Remove opacity field if default (1)
			const updated = { ...existing }
			delete updated.o
			doc.o.set(objectId, updated)
		} else {
			doc.o.set(objectId, {
				...existing,
				o: opacity
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

	// Resolve xy from prototype if needed
	const xy = object.xy ?? (object.proto ? doc.o.get(object.proto as ObjectId)?.xy : undefined)
	if (!xy) return

	yDoc.transact(() => {
		let newX = xy[0]
		let newY = xy[1]

		if (preserveGlobal) {
			// Get current global position
			const globalPos = getAbsolutePositionStored(doc, object)
			if (!globalPos) return

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
		fc?: string | StoredPaletteRef | null // fill color (hex or palette ref)
		lh?: number | null // lineHeight
		ls?: number | null // letterSpacing
		lb?: string | null // listBullet
	}
): void {
	const existing = doc.o.get(objectId)
	if (!existing) return

	// Always use ts - works for both instances and non-instances
	// Resolution handles inheritance automatically
	const existingStyle = existing.ts || {}
	const newStyle: typeof existingStyle = { ...existingStyle }

	// Apply updates (null means delete the property)
	if (textStyleUpdates.ta !== undefined) {
		if (textStyleUpdates.ta === null) delete newStyle.ta
		else newStyle.ta = textStyleUpdates.ta
	}
	if (textStyleUpdates.va !== undefined) {
		if (textStyleUpdates.va === null) delete newStyle.va
		else newStyle.va = textStyleUpdates.va
	}
	if (textStyleUpdates.ff !== undefined) {
		if (textStyleUpdates.ff === null) delete newStyle.ff
		else newStyle.ff = textStyleUpdates.ff
	}
	if (textStyleUpdates.fs !== undefined) {
		if (textStyleUpdates.fs === null) delete newStyle.fs
		else newStyle.fs = textStyleUpdates.fs
	}
	if (textStyleUpdates.fw !== undefined) {
		if (textStyleUpdates.fw === null) delete newStyle.fw
		else newStyle.fw = textStyleUpdates.fw
	}
	if (textStyleUpdates.fi !== undefined) {
		if (textStyleUpdates.fi === null) delete newStyle.fi
		else newStyle.fi = textStyleUpdates.fi
	}
	if (textStyleUpdates.td !== undefined) {
		if (textStyleUpdates.td === null) delete newStyle.td
		else newStyle.td = textStyleUpdates.td
	}
	if (textStyleUpdates.fc !== undefined) {
		if (textStyleUpdates.fc === null) delete newStyle.fc
		else newStyle.fc = textStyleUpdates.fc
	}
	if (textStyleUpdates.lh !== undefined) {
		if (textStyleUpdates.lh === null) delete newStyle.lh
		else newStyle.lh = textStyleUpdates.lh
	}
	if (textStyleUpdates.ls !== undefined) {
		if (textStyleUpdates.ls === null) delete newStyle.ls
		else newStyle.ls = textStyleUpdates.ls
	}
	if (textStyleUpdates.lb !== undefined) {
		if (textStyleUpdates.lb === null) delete newStyle.lb
		else newStyle.lb = textStyleUpdates.lb
	}

	yDoc.transact(() => {
		const hasProperties = Object.keys(newStyle).length > 0
		doc.o.set(objectId, {
			...existing,
			ts: hasProperties ? newStyle : undefined
		})
	}, yDoc.clientID)
}

/**
 * Delete an object
 */
export function deleteObject(yDoc: Y.Doc, doc: YPrezilloDocument, objectId: ObjectId): void {
	const object = doc.o.get(objectId)
	if (!object) return

	// Template instances cannot be deleted - hide them instead
	if (object.proto && object.vi) {
		yDoc.transact(() => {
			const updated = { ...object, hid: true as const }
			doc.o.set(objectId, updated)
		}, yDoc.clientID)
		return
	}

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

		// Clean up Y.Text entry for text objects
		if (object.t === 'T') {
			doc.rt.delete(objectId)
		}

		// Delete object
		doc.o.delete(objectId)
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

			// Template instances cannot be deleted - hide them instead
			if (object.proto && object.vi) {
				const updated = { ...object, hid: true as const }
				doc.o.set(id, updated)
				return // Skip normal deletion
			}

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
		})
	}, yDoc.clientID)
}

/**
 * Delete a prototype object and handle its instances
 * @param strategy - 'delete-instances' removes instances, 'detach-instances' copies prototype values to instances
 */
export function deletePrototypeWithInstances(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	prototypeId: ObjectId,
	strategy: 'delete-instances' | 'detach-instances' = 'delete-instances'
): void {
	const instances = getInstancesOfPrototype(doc, prototypeId)
	// Find which template this prototype belongs to
	const templateId = getTemplateIdForPrototype(doc, prototypeId)

	yDoc.transact(() => {
		if (strategy === 'delete-instances') {
			// Delete all instances first
			for (const instanceId of instances) {
				const instance = doc.o.get(instanceId)
				if (!instance) continue

				// Remove from parent's children
				if (instance.p) {
					const children = doc.ch.get(instance.p)
					if (children) {
						removeChildRef(children, [0, instanceId])
					}
				} else {
					removeChildRef(doc.r, [0, instanceId])
				}

				// Delete instance
				doc.o.delete(instanceId)
			}
		} else {
			// Detach: copy prototype values to instances
			const prototype = doc.o.get(prototypeId)
			if (prototype) {
				for (const instanceId of instances) {
					const instance = doc.o.get(instanceId)
					if (!instance) continue

					// Merge prototype values into instance (instance overrides prototype)
					const merged = {
						...prototype,
						...instance,
						proto: undefined // Remove proto reference since we're detaching
					}
					// Keep instance's page/parent association
					if (instance.vi) merged.vi = instance.vi
					if (instance.p) merged.p = instance.p
					// Clean up undefined proto field
					delete merged.proto

					doc.o.set(instanceId, merged as StoredObject)
				}
			}
		}

		// Remove prototype from template's tpo array
		if (templateId) {
			const protoArray = doc.tpo.get(templateId)
			if (protoArray) {
				const index = protoArray.toArray().indexOf(prototypeId)
				if (index !== -1) {
					protoArray.delete(index, 1)
				}
			}
		}

		// Now delete the prototype itself
		const prototype = doc.o.get(prototypeId)
		if (prototype) {
			// Remove from parent's children
			if (prototype.p) {
				const children = doc.ch.get(prototype.p)
				if (children) {
					removeChildRef(children, [0, prototypeId])
				}
			} else {
				removeChildRef(doc.r, [0, prototypeId])
			}

			// Delete prototype
			doc.o.delete(prototypeId)
		}
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
 * Toggle object hidden state
 * Hidden objects are visible in edit mode (50% opacity) but invisible in presentation mode
 */
export function toggleObjectHidden(yDoc: Y.Doc, doc: YPrezilloDocument, objectId: ObjectId): void {
	const object = doc.o.get(objectId)
	if (!object) return

	yDoc.transact(() => {
		const isHidden = object.hid === true
		if (isHidden) {
			const updated = { ...object }
			delete updated.hid
			doc.o.set(objectId, updated)
		} else {
			doc.o.set(objectId, { ...object, hid: true })
		}
	}, yDoc.clientID)
}

/**
 * Duplicate an object
 * @param targetViewId - If provided and object has no pageId, place duplicate on this view
 *                       This is important for duplicating prototype objects (templates)
 */
export function duplicateObject(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	offsetX: number = 20,
	offsetY: number = 20,
	targetViewId?: ViewId
): ObjectId | undefined {
	const object = doc.o.get(objectId)
	if (!object) return undefined

	const expanded = expandObject(objectId, object)
	const newId = generateObjectId()

	// Use object's pageId if it has one, otherwise use targetViewId
	// This ensures prototypes (which have no pageId) get placed on the current page
	const pageId = expanded.pageId ?? targetViewId

	const duplicated: PrezilloObject = {
		...expanded,
		id: newId,
		x: expanded.x + offsetX,
		y: expanded.y + offsetY,
		pageId, // Use resolved pageId
		name: expanded.name ? `${expanded.name} (copy)` : undefined,
		// Remove prototype association - duplicate should be standalone
		prototypeId: undefined
	}

	const resultId = addObject(yDoc, doc, duplicated, expanded.parentId, undefined, pageId)

	// For text objects, copy the Y.Text content from the original
	if (object.t === 'T') {
		const originalYText = doc.rt.get(objectId)
		if (originalYText) {
			const newYText = doc.rt.get(resultId)
			if (newYText) {
				// Apply the original delta to the new Y.Text
				const delta = originalYText.toDelta()
				yDoc.transact(() => {
					if (delta && delta.length > 0) {
						newYText.delete(0, newYText.length)
						newYText.applyDelta(delta)
					}
				}, yDoc.clientID)
			}
		}
	}

	return resultId
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

// ============================================================================
// Document Consistency / Maintenance Operations
// ============================================================================

export type DocumentIssueType = 'orphaned-instance' | 'orphaned-child-ref' | 'missing-view-ref'

export interface DocumentIssue {
	type: DocumentIssueType
	objectId: string
	description: string
	details?: string
}

export interface DocumentConsistencyReport {
	issues: DocumentIssue[]
	summary: {
		orphanedInstances: number
		orphanedChildRefs: number
		missingViewRefs: number
		total: number
	}
}

/**
 * Check document for consistency issues without modifying anything
 * Returns a report of all issues found
 */
export function checkDocumentConsistency(doc: YPrezilloDocument): DocumentConsistencyReport {
	const issues: DocumentIssue[] = []

	// Check for orphaned instances (proto points to non-existent object)
	doc.o.forEach((obj, objId) => {
		if (obj.proto && !doc.o.has(obj.proto)) {
			issues.push({
				type: 'orphaned-instance',
				objectId: objId,
				description: `Instance references missing prototype`,
				details: `Object ${objId} has proto="${obj.proto}" but that object doesn't exist`
			})
		}
	})

	// Check for orphaned child refs in root array
	const rootArray = doc.r.toArray()
	for (const [type, id] of rootArray) {
		if (type === 0 && !doc.o.has(id)) {
			issues.push({
				type: 'orphaned-child-ref',
				objectId: id,
				description: `Root child reference to missing object`,
				details: `Root array contains reference to object ${id} which doesn't exist`
			})
		} else if (type === 1 && !doc.c.has(id)) {
			issues.push({
				type: 'orphaned-child-ref',
				objectId: id,
				description: `Root child reference to missing container`,
				details: `Root array contains reference to container ${id} which doesn't exist`
			})
		}
	}

	// Check for objects with view refs to non-existent views
	doc.o.forEach((obj, objId) => {
		if (obj.vi && !doc.v.has(obj.vi)) {
			issues.push({
				type: 'missing-view-ref',
				objectId: objId,
				description: `Object references missing view`,
				details: `Object ${objId} has vi="${obj.vi}" but that view doesn't exist`
			})
		}
	})

	// Build summary
	const summary = {
		orphanedInstances: issues.filter((i) => i.type === 'orphaned-instance').length,
		orphanedChildRefs: issues.filter((i) => i.type === 'orphaned-child-ref').length,
		missingViewRefs: issues.filter((i) => i.type === 'missing-view-ref').length,
		total: issues.length
	}

	return { issues, summary }
}

/**
 * Fix all document consistency issues
 * Should be called after checkDocumentConsistency to fix the reported issues
 */
export function fixDocumentIssues(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	report: DocumentConsistencyReport
): { fixed: number } {
	if (report.issues.length === 0) {
		return { fixed: 0 }
	}

	let fixed = 0

	yDoc.transact(() => {
		for (const issue of report.issues) {
			switch (issue.type) {
				case 'orphaned-instance': {
					// Delete the orphaned instance
					doc.o.delete(issue.objectId)
					// Remove from root children
					const rootArray = doc.r.toArray()
					for (let i = rootArray.length - 1; i >= 0; i--) {
						if (rootArray[i][1] === issue.objectId) {
							doc.r.delete(i, 1)
						}
					}
					fixed++
					break
				}
				case 'orphaned-child-ref': {
					// Remove orphaned reference from root array
					const rootArr = doc.r.toArray()
					for (let i = rootArr.length - 1; i >= 0; i--) {
						if (rootArr[i][1] === issue.objectId) {
							doc.r.delete(i, 1)
						}
					}
					fixed++
					break
				}
				case 'missing-view-ref': {
					// Clear the invalid view reference
					const obj = doc.o.get(issue.objectId)
					if (obj) {
						const updated = { ...obj }
						delete updated.vi
						doc.o.set(issue.objectId, updated as StoredObject)
					}
					fixed++
					break
				}
			}
		}
	}, yDoc.clientID)

	console.log(`[fixDocumentIssues] Fixed ${fixed} issues`)
	return { fixed }
}

/**
 * Legacy cleanup function - use checkDocumentConsistency + fixDocumentIssues instead
 * @deprecated
 */
export function cleanupOrphanedInstances(
	yDoc: Y.Doc,
	doc: YPrezilloDocument
): { deleted: string[]; count: number } {
	const report = checkDocumentConsistency(doc)
	const orphanedIds = report.issues
		.filter((i) => i.type === 'orphaned-instance')
		.map((i) => i.objectId)

	if (orphanedIds.length === 0) {
		return { deleted: [], count: 0 }
	}

	fixDocumentIssues(yDoc, doc, report)
	return { deleted: orphanedIds, count: orphanedIds.length }
}

// vim: ts=4

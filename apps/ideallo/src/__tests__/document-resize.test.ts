// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * An embedded document ('document', stored as 'D') resizes through onResizeEnd's plain-box branch
 * (app.tsx) alongside rect/ellipse/text/sticky — the same mapping applyBoundsOverride's `default:`
 * case (Canvas.tsx) uses to PREVIEW it, so preview and commit cannot diverge and the embed cannot
 * snap back on pointer-up. These tests pin that arithmetic, the write path underneath it, and the
 * aspect metadata the resize gizmo locks to.
 */

import * as Y from 'yjs'

import { getOrCreateDocument } from '../crdt/document.js'
import { toObjectId } from '../crdt/ids.js'
import { getObject, updateDocumentAspect, updateObjectFields } from '../crdt/object-ops.js'
import type { Bounds, DocumentObject, IdealloObject } from '../crdt/runtime-types.js'
import type { StoredDocument, StoredObject, YIdealloDocument } from '../crdt/stored-types.js'
import { compactObject, expandObject } from '../crdt/type-converters.js'
import { MIN_BOX_SIZE, resizeAspectRatio, scaleBoxIntoBounds } from '../utils/geometry.js'

const ID = toObjectId('doc1')

/** The document fixture used across the converter tests too (type-converters.test.ts). */
function storedDocument(over: Partial<StoredDocument> = {}): StoredDocument {
	return {
		t: 'D',
		xy: [1, 2],
		wh: [30, 40],
		fid: 'f1',
		ct: 'cloudillo/quillo',
		...over
	}
}

function makeDoc(stored: StoredDocument = storedDocument()): {
	yDoc: Y.Doc
	doc: YIdealloDocument
} {
	const yDoc = new Y.Doc()
	const doc = getOrCreateDocument(yDoc)
	doc.o.set(ID, stored as StoredObject)
	doc.r.push([ID])
	return { yDoc, doc }
}

describe('document embed resize commits to the CRDT', () => {
	it('persists the new geometry through updateObjectFields', () => {
		const { yDoc, doc } = makeDoc()

		updateObjectFields(yDoc, doc, ID, { x: 10, y: 20, width: 300, height: 400 })

		const obj = getObject(doc, ID) as DocumentObject
		expect(obj.type).toBe('document')
		expect({ x: obj.x, y: obj.y, width: obj.width, height: obj.height }).toEqual({
			x: 10,
			y: 20,
			width: 300,
			height: 400
		})

		const stored = doc.o.get(ID) as StoredDocument
		expect(stored.xy).toEqual([10, 20])
		expect(stored.wh).toEqual([300, 400])
		// The embed's identity must survive the geometry write
		expect(stored.fid).toBe('f1')
		expect(stored.ct).toBe('cloudillo/quillo')
	})
})

/**
 * `scaleBoxIntoBounds` IS the commit arithmetic of onResizeEnd's plain-box branch (app.tsx) - the
 * handler calls this very function, so these cases cannot drift from what the drag actually writes.
 * The PREVIEW (applyBoundsOverride's `default:` case, Canvas.tsx) takes `bounds` verbatim, and the
 * commit must land on exactly the same box.
 */
describe('preview/commit parity for the plain-box branch', () => {
	const embed = expandObject(
		ID,
		storedDocument({ xy: [0, 0], wh: [100, 50] }),
		makeDoc().doc
	) as DocumentObject

	it('lands on the previewed bounds exactly, for a single-object selection', () => {
		const from: Bounds = { x: 0, y: 0, width: 100, height: 50 }
		const cases: Bounds[] = [
			{ x: 10, y: 20, width: 200, height: 120 },
			{ x: -30, y: -5, width: 50, height: 25 },
			{ x: 0, y: 0, width: 100, height: 50 }
		]
		for (const to of cases) {
			// applyBoundsOverride's default: case returns { ...obj, ...bounds } verbatim
			expect(scaleBoxIntoBounds(embed, from, to)).toEqual({
				x: to.x,
				y: to.y,
				width: to.width,
				height: to.height
			})
		}
	})

	it('clamps only below useResizable minimum, which the drag already stops at', () => {
		const from: Bounds = { x: 0, y: 0, width: 100, height: 50 }
		const to: Bounds = { x: 0, y: 0, width: 4, height: 2 }
		expect(scaleBoxIntoBounds(embed, from, to)).toEqual({
			x: 0,
			y: 0,
			width: MIN_BOX_SIZE,
			height: MIN_BOX_SIZE
		})
	})
})

describe('resizeAspectRatio', () => {
	function object(over: Partial<IdealloObject>): IdealloObject {
		return { id: ID, x: 0, y: 0, ...over } as IdealloObject
	}

	it('locks an image to its own width/height', () => {
		expect(resizeAspectRatio(object({ type: 'image', width: 300, height: 200 }))).toBeCloseTo(
			1.5
		)
	})

	it('locks an aspect-fixed embed to the ratio its app reported', () => {
		const obj = object({
			type: 'document',
			width: 100,
			height: 100,
			aspectRatio: [16, 9],
			aspectFixed: true
		})
		expect(resizeAspectRatio(obj)).toBeCloseTo(16 / 9)
	})

	it('leaves an embed free when the app did not declare its aspect FIXED', () => {
		const obj = object({ type: 'document', width: 100, height: 100, aspectRatio: [16, 9] })
		expect(resizeAspectRatio(obj)).toBeUndefined()
	})

	it('leaves an embed free when aspectFixed arrived without a ratio', () => {
		const obj = object({ type: 'document', width: 100, height: 100, aspectFixed: true })
		expect(resizeAspectRatio(obj)).toBeUndefined()
	})

	it('never hands NaN/Infinity to the resize hook', () => {
		const zeroPair = object({
			type: 'document',
			width: 100,
			height: 100,
			aspectRatio: [0, 0],
			aspectFixed: true
		})
		expect(resizeAspectRatio(zeroPair)).toBeUndefined()
		expect(resizeAspectRatio(object({ type: 'image', width: 300, height: 0 }))).toBeUndefined()
	})

	it('leaves every other type free', () => {
		expect(resizeAspectRatio(object({ type: 'rect', width: 100, height: 40 }))).toBeUndefined()
	})
})

describe('updateDocumentAspect', () => {
	function countUpdates(yDoc: Y.Doc): () => number {
		let n = 0
		yDoc.on('update', () => {
			n++
		})
		return () => n
	}

	it('writes the ratio and the fixed flag', () => {
		const { yDoc, doc } = makeDoc()
		updateDocumentAspect(yDoc, doc, ID, [16, 9], true)

		const stored = doc.o.get(ID) as StoredDocument
		expect(stored.ar).toEqual([16, 9])
		expect(stored.af).toBe(true)
		expect((getObject(doc, ID) as DocumentObject).aspectFixed).toBe(true)
	})

	it('is a no-op when nothing changed - the embed reports on every scroll', () => {
		const { yDoc, doc } = makeDoc()
		updateDocumentAspect(yDoc, doc, ID, [16, 9], true)

		const updates = countUpdates(yDoc)
		updateDocumentAspect(yDoc, doc, ID, [16, 9], true)
		updateDocumentAspect(yDoc, doc, ID, [16, 9], true)
		expect(updates()).toBe(0)
	})

	// A reflow size depends on each writer's viewport: storing it would ping-pong the CRDT
	it('does not store a reflow size', () => {
		const { yDoc, doc } = makeDoc()
		const updates = countUpdates(yDoc)
		updateDocumentAspect(yDoc, doc, ID, [800, 1200], false)

		expect(updates()).toBe(0)
	})

	it('clears the flag when the app stops reporting a fixed aspect', () => {
		const { yDoc, doc } = makeDoc()
		updateDocumentAspect(yDoc, doc, ID, [16, 9], true)
		updateDocumentAspect(yDoc, doc, ID, [16, 9], false)

		const stored = doc.o.get(ID) as StoredDocument
		expect(stored.af).toBeUndefined()
		expect(stored.ar).toEqual([16, 9])
	})

	/** Objects live as plain JS objects in doc.o, so every write is a whole-record replace. */
	it('does not clobber a size written just before it', () => {
		const { yDoc, doc } = makeDoc()
		updateObjectFields(yDoc, doc, ID, { x: 10, y: 20, width: 300, height: 400 })
		updateDocumentAspect(yDoc, doc, ID, [16, 9], true)

		const stored = doc.o.get(ID) as StoredDocument
		expect(stored.wh).toEqual([300, 400])
		expect(stored.xy).toEqual([10, 20])
		expect(stored.ar).toEqual([16, 9])
		expect(stored.af).toBe(true)
	})

	it('ignores an object that is not a document embed', () => {
		const { yDoc, doc } = makeDoc()
		const rectId = toObjectId('rect1')
		doc.o.set(rectId, { t: 'R', xy: [0, 0], wh: [10, 10] } as StoredObject)

		const updates = countUpdates(yDoc)
		updateDocumentAspect(yDoc, doc, rectId, [16, 9], true)
		expect(updates()).toBe(0)
	})
})

describe('af round-trips through the converters', () => {
	it('expands to aspectFixed and compacts back', () => {
		const stored = storedDocument({ ar: [16, 9], af: true })
		const expanded = expandObject(ID, stored, makeDoc().doc) as DocumentObject
		expect(expanded.aspectFixed).toBe(true)
		expect(expanded.aspectRatio).toEqual([16, 9])
		expect(compactObject(expanded)).toEqual(stored)
	})

	it('omits the key entirely when the aspect is not fixed', () => {
		const stored = storedDocument({ ar: [16, 9] })
		const expanded = expandObject(ID, stored, makeDoc().doc) as DocumentObject
		expect(expanded.aspectFixed).toBeUndefined()
		const compacted = compactObject(expanded) as StoredDocument
		expect(Object.hasOwn(compacted, 'af')).toBe(false)
		expect(compacted).toEqual(stored)
	})
})

// vim: ts=4

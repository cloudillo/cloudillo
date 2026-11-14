// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Golden documents: frozen Yjs updates written by a past release must keep loading. Fixtures
 * are never edited; a new release adds its own beside them.
 */

import { checkDocSchema } from '@cloudillo/crdt'
import * as Y from 'yjs'

import { getOrCreateDocument, IDEALLO_SCHEMA } from '../crdt/document.js'
import { toObjectId } from '../crdt/ids.js'
import { getAllObjects, getObject, updateObject } from '../crdt/object-ops.js'
import { GOLDEN_1_0, GOLDEN_1_0_FUTURE_SCHEMA } from './golden-doc-1.0.fixture.js'

/** Load a base64-encoded Yjs update into a fresh doc */
function docFromBase64Update(b64: string): Y.Doc {
	const yDoc = new Y.Doc()
	Y.applyUpdate(
		yDoc,
		Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
	)
	return yDoc
}

/** Re-encode and load into a fresh doc: what a peer receives */
function cloneDoc(yDoc: Y.Doc): Y.Doc {
	const copy = new Y.Doc()
	Y.applyUpdate(copy, Y.encodeStateAsUpdate(yDoc))
	return copy
}

const KNOWN = toObjectId('known')
const FUTURE = toObjectId('future')

describe('ideallo golden document 1.0', () => {
	it('loads, with the unknown type as a placeholder', () => {
		const doc = getOrCreateDocument(docFromBase64Update(GOLDEN_1_0), false)
		expect(checkDocSchema(doc.m, IDEALLO_SCHEMA)).toBe('rw')
		expect(getAllObjects(doc).map((o) => o.type)).toEqual(['rect', 'unknown'])
		expect(getObject(doc, FUTURE)).toMatchObject({ type: 'unknown', storedType: 'Z' })
	})

	it('keeps unknown keys and types through an edit', () => {
		const yDoc = docFromBase64Update(GOLDEN_1_0)
		const doc = getOrCreateDocument(yDoc, false)
		updateObject(yDoc, doc, KNOWN, { x: 10 })
		updateObject(yDoc, doc, FUTURE, { x: 30 })

		const o = cloneDoc(yDoc).getMap('o')
		expect(o.get('known')).toEqual({ t: 'R', xy: [10, 2], wh: [30, 40], qq: 7 })
		expect(o.get('future')).toEqual({ t: 'Z', xy: [30, 4], wh: [50, 60], zz: { future: true } })
	})

	it('opens a newer-schema document read-only and leaves it untouched', () => {
		const yDoc = docFromBase64Update(GOLDEN_1_0_FUTURE_SCHEMA)
		const before = Y.encodeStateVector(yDoc)
		const doc = getOrCreateDocument(yDoc, true, true)
		expect(checkDocSchema(doc.m, IDEALLO_SCHEMA)).toBe('ro')
		expect(doc.m.get('schema')).toBe(999)
		expect(Y.encodeStateVector(yDoc)).toEqual(before)
	})
})

// vim: ts=4

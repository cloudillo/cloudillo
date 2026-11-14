// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Forward compatibility: an object type written by a newer client becomes an UnknownObject
 * placeholder that round-trips its stored record, and a newer-schema document is left untouched.
 */

import * as Y from 'yjs'

import {
	compactObject,
	expandObject,
	getObject,
	getOrCreateDocument,
	resolveObject,
	type StoredObject,
	toObjectId,
	updateObject,
	updateObjectPosition
} from '../crdt'

const FUTURE = {
	t: 'Z',
	xy: [3, 4],
	wh: [50, 60],
	zz: { future: true }
} as unknown as StoredObject

describe('prezillo unknown object types', () => {
	it('expands to a placeholder instead of throwing', () => {
		const obj = expandObject('o1', FUTURE)
		expect(obj.type).toBe('unknown')
		expect(obj).toMatchObject({ x: 3, y: 4, width: 50, height: 60, storedType: 'Z' })
	})

	it('round-trips the raw record through compactObject', () => {
		expect(compactObject(expandObject('o1', FUTURE))).toEqual(FUTURE)
	})

	it('is readable via getObject and keeps its fields when moved', () => {
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc, false)
		const id = toObjectId('o1')
		doc.o.set(id, FUTURE)
		expect(getObject(doc, id)?.type).toBe('unknown')

		updateObjectPosition(yDoc, doc, id, 10, 20)
		expect(doc.o.get(id)).toEqual({ ...FUTURE, xy: [10, 20] })
	})

	it('updates a record with no xy/wh without throwing or inventing wh', () => {
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc, false)
		const id = toObjectId('o3')
		doc.o.set(id, { t: 'Z', zz: 1 } as unknown as StoredObject)

		updateObject(yDoc, doc, id, { x: 10, y: 20, width: 50 })
		expect(doc.o.get(id)).toEqual({ t: 'Z', zz: 1, xy: [10, 20] })
	})

	// No `wh` must not be invented, and an unreadable `p` must not be dropped
	it('moves a record with no wh and a numeric p without touching either', () => {
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc, false)
		const id = toObjectId('o2')
		const bare = { t: 'Z', xy: [3, 4], p: 7 } as unknown as StoredObject
		doc.o.set(id, bare)

		updateObjectPosition(yDoc, doc, id, 10, 20)
		expect(doc.o.get(id)).toEqual({ ...bare, xy: [10, 20] })
	})

	it('reads opacity, pivot and prototype from the raw record', () => {
		const obj = expandObject('o3', {
			...FUTURE,
			o: 0.4,
			pv: [0, 1],
			proto: 'p1'
		} as unknown as StoredObject)
		expect(obj).toMatchObject({ opacity: 0.4, pivotX: 0, pivotY: 1, prototypeId: 'p1' })
	})

	it('writes back only the fields that changed', () => {
		const obj = expandObject('o1', FUTURE)
		expect(compactObject({ ...obj, opacity: 0.5, pivotX: 0 })).toEqual({
			...FUTURE,
			o: 0.5,
			pv: [0, 0.5]
		})
	})

	it('takes an instance position from its prototype when it has no xy', () => {
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc, false)
		doc.o.set(toObjectId('proto'), FUTURE)
		doc.o.set(toObjectId('inst'), { t: 'Z', proto: 'proto' } as unknown as StoredObject)
		expect(resolveObject(doc, toObjectId('inst'))).toMatchObject({
			type: 'unknown',
			x: 3,
			y: 4,
			width: 50,
			height: 60,
			prototypeId: 'proto'
		})
	})
})

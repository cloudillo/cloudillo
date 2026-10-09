// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as Y from 'yjs'

import { toObjectId } from '../crdt/ids.js'
import {
	addObject,
	getObject,
	renameFrame,
	tryExpandObject,
	updateObjectFields
} from '../crdt/object-ops.js'
import type { FrameObject } from '../crdt/runtime-types.js'
import { DEFAULT_STYLE } from '../crdt/runtime-types.js'
import type { StoredFrame, YIdealloDocument } from '../crdt/stored-types.js'
import { compactObject, expandObject } from '../crdt/type-converters.js'
import { scaleBoxIntoBounds } from '../utils/geometry.js'
import { hitTestObject } from '../utils/hit-testing.js'

function makeDoc(): { yDoc: Y.Doc; doc: YIdealloDocument } {
	const yDoc = new Y.Doc()
	const doc = {
		o: yDoc.getMap('o'),
		r: yDoc.getArray('r'),
		m: yDoc.getMap('m'),
		txt: yDoc.getMap('txt'),
		geo: yDoc.getMap('geo'),
		paths: yDoc.getMap('paths')
	} as YIdealloDocument
	return { yDoc, doc }
}

const ID = toObjectId('frame1')

function frame(extra: Partial<FrameObject> = {}): FrameObject {
	return {
		id: ID,
		type: 'frame',
		x: 10,
		y: 20,
		width: 300,
		height: 200,
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		locked: false,
		style: { ...DEFAULT_STYLE },
		...extra
	} as FrameObject
}

describe('frame objects', () => {
	it('compacts to code M and round-trips, with and without a name', () => {
		const { doc } = makeDoc()
		for (const obj of [frame({ name: 'Intro' }), frame()]) {
			const stored = compactObject(obj) as StoredFrame
			expect(stored.t).toBe('M')
			expect(stored.wh).toEqual([300, 200])
			expect(stored.n).toBe(obj.name)
			const back = expandObject(ID, stored, doc) as FrameObject
			expect(back.type).toBe('frame')
			expect([back.x, back.y, back.width, back.height]).toEqual([10, 20, 300, 200])
			expect(back.name).toBe(obj.name)
		}
	})

	it('addObject inserts frames at the back and names them "Frame N"', () => {
		const { yDoc, doc } = makeDoc()
		const rect = addObject(yDoc, doc, {
			type: 'rect',
			x: 0,
			y: 0,
			width: 10,
			height: 10,
			rotation: 0,
			pivotX: 0.5,
			pivotY: 0.5,
			locked: false,
			style: { ...DEFAULT_STYLE }
		} as Parameters<typeof addObject>[2])
		const { id: _id, ...input } = frame()
		const f1 = addObject(yDoc, doc, input)
		const f2 = addObject(yDoc, doc, input)
		expect(doc.r.toArray()).toEqual([f2, f1, rect])
		expect((getObject(doc, f1) as FrameObject).name).toBe('Frame 1')
		expect((getObject(doc, f2) as FrameObject).name).toBe('Frame 2')
	})

	it('renameFrame updates the stored name and ignores non-frames', () => {
		const { yDoc, doc } = makeDoc()
		const { id: _id, ...input } = frame()
		const id = addObject(yDoc, doc, input)
		renameFrame(yDoc, doc, id, 'Agenda')
		expect((doc.o.get(id) as StoredFrame).n).toBe('Agenda')
		renameFrame(yDoc, doc, toObjectId('nope'), 'x')
		expect(doc.o.has('nope')).toBe(false)
	})

	it('tryExpandObject expands M records', () => {
		const { doc } = makeDoc()
		const stored = compactObject(frame({ name: 'A' }))
		expect(tryExpandObject(ID, stored, doc)?.type).toBe('frame')
	})

	it('resize commit (onResizeEnd plain-box branch) persists the new box and keeps the name', () => {
		const { yDoc, doc } = makeDoc()
		const f = frame({ name: 'Frame 1' })
		doc.o.set(ID, compactObject(f))
		doc.r.push([ID])
		const from = { x: 10, y: 20, width: 300, height: 200 }
		const to = { x: 0, y: 0, width: 600, height: 100 }
		updateObjectFields(yDoc, doc, ID, scaleBoxIntoBounds(f, from, to))
		const stored = doc.o.get(ID) as StoredFrame
		expect(stored.t).toBe('M')
		expect(stored.xy).toEqual([0, 0])
		expect(stored.wh).toEqual([600, 100])
		expect(stored.n).toBe('Frame 1')
	})

	it('a filled frame hits on its body, an unfilled one (or the eraser) only on its edge', () => {
		const center: [number, number] = [160, 120]
		const edge: [number, number] = [10, 120]
		const filled = frame({ style: { ...DEFAULT_STYLE, fillColor: 'n5' } })
		expect(hitTestObject(filled, center)).toBe(true)
		expect(hitTestObject(filled, center, 8, 1, false)).toBe(false)
		expect(hitTestObject(filled, edge, 8, 1, false)).toBe(true)
		const unfilled = frame({ style: { ...DEFAULT_STYLE, fillColor: 'transparent' } })
		expect(hitTestObject(unfilled, center)).toBe(false)
	})
})

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as Y from 'yjs'

import { getOrCreateDocument, getViewPositions, reorderView, toViewId, updateView } from '../crdt'
import type { StoredObject } from '../crdt/stored-types'

describe('getViewPositions', () => {
	function setup() {
		const yDoc = new Y.Doc()
		const v = yDoc.getMap('v')
		v.set('A', { name: 'A', width: 1920, height: 1080 })
		// Legacy horizontal position: ignored
		v.set('B', { name: 'B', x: 2020, y: 0, width: 1280, height: 720 })
		v.set('C', { name: 'C', width: 1920, height: 1080 })
		yDoc.getArray<string>('vo').push(['A', 'B', 'C'])
		return { yDoc, doc: getOrCreateDocument(yDoc, false) }
	}

	const ys = (doc: ReturnType<typeof setup>['doc']) =>
		[...getViewPositions(doc)].map(([id, p]) => [id, p.x, p.y])

	it('stacks views vertically in presentation order', () => {
		const { doc } = setup()
		expect(ys(doc)).toEqual([
			['A', 0, 0],
			['B', 0, 1180],
			['C', 0, 2000]
		])
	})

	it('follows reordering', () => {
		const { yDoc, doc } = setup()
		getViewPositions(doc)
		reorderView(yDoc, doc, toViewId('C'), 0)
		expect(ys(doc)).toEqual([
			['C', 0, 0],
			['A', 0, 1180],
			['B', 0, 2360]
		])
	})

	it('dedupes an id held twice in vo (concurrent moves)', () => {
		const { yDoc, doc } = setup()
		yDoc.getArray<string>('vo').push(['A'])
		expect(ys(doc)).toEqual([
			['A', 0, 0],
			['B', 0, 1180],
			['C', 0, 2000]
		])
	})

	it('treats an insert right after itself as a no-op', () => {
		const { yDoc, doc } = setup()
		reorderView(yDoc, doc, toViewId('B'), 2)
		expect(doc.vo.toArray()).toEqual(['A', 'B', 'C'])
	})

	it('follows height changes', () => {
		const { yDoc, doc } = setup()
		getViewPositions(doc)
		updateView(yDoc, doc, toViewId('A'), { height: 500 })
		expect(ys(doc)).toEqual([
			['A', 0, 0],
			['B', 0, 600],
			['C', 0, 1420]
		])
	})

	it('keeps stored positions of an unmigrated doc (read-only), stacks once migrated', () => {
		const yDoc = new Y.Doc()
		const v = yDoc.getMap('v')
		v.set('A', { name: 'A', x: 0, y: 0, width: 1920, height: 1080 })
		v.set('B', { name: 'B', x: 2020, y: 0, width: 1280, height: 720 })
		yDoc.getArray<string>('vo').push(['A', 'B'])
		yDoc.getArray('r').push([[0, 'X']])
		const reader = getOrCreateDocument(yDoc, false)
		expect(ys(reader)).toEqual([
			['A', 0, 0],
			['B', 2020, 0]
		])

		getOrCreateDocument(yDoc, true)
		expect(ys(reader)).toEqual([
			['A', 0, 0],
			['B', 0, 1180]
		])
	})
})

describe('legacy layout migration', () => {
	it('attaches floating objects to the slide they sat on, strips view x/y, keeps orphan rt for undo', () => {
		const yDoc = new Y.Doc()
		const v = yDoc.getMap('v')
		v.set('A', { name: 'A', x: 0, y: 0, width: 1920, height: 1080 })
		v.set('B', { name: 'B', x: 2020, y: 0, width: 1920, height: 1080 })
		yDoc.getArray<string>('vo').push(['A', 'B'])
		const o = yDoc.getMap<StoredObject>('o')
		o.set('O1', { t: 'R', xy: [2100, 100], wh: [100, 50] })
		o.set('O2', { t: 'R', xy: [5000, 5000], wh: [10, 10] })
		yDoc.getArray('r').push([
			[0, 'O1'],
			[0, 'O2']
		])
		yDoc.getMap<Y.Text>('rt').set('GONE', new Y.Text('x'))

		const doc = getOrCreateDocument(yDoc, true)
		expect(doc.o.get('O1')).toEqual({ t: 'R', vi: 'B', xy: [80, 100], wh: [100, 50] })
		expect(doc.o.get('O2')).toEqual({ t: 'R', xy: [5000, 5000], wh: [10, 10] })
		for (const view of doc.v.values()) {
			expect(view).not.toHaveProperty('x')
			expect(view).not.toHaveProperty('y')
		}
		expect(doc.rt.has('GONE')).toBe(true)
	})
})

// vim: ts=4

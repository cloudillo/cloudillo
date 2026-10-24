// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * duplicateView copies the view record and its page-relative objects, not floating ones; groups
 * holding copied objects are cloned.
 */

import * as Y from 'yjs'

import {
	deleteView,
	duplicateView,
	getContainerChildren,
	getOrCreateDocument,
	getOrCreateViewNotes,
	toContainerId,
	toViewId
} from '../crdt'
import type { StoredObject } from '../crdt/stored-types'

describe('duplicateView', () => {
	it('copies view record, page-relative objects and rich text in one undo step', () => {
		const yDoc = new Y.Doc()
		const id = toViewId('V1')
		yDoc.getMap('v').set(id, {
			name: 'Slide',
			x: 0,
			y: 0,
			width: 1920,
			height: 1080,
			tpl: 'TPL1',
			showBorder: false
		})
		yDoc.getArray<string>('vo').push([id])
		yDoc.getMap('tpl').set('TPL1', { n: 'Template', w: 1920, h: 1080 })

		const doc = getOrCreateDocument(yDoc, true)
		doc.o.set('R1', { t: 'R', vi: id, xy: [10, 20], wh: [100, 50] })
		doc.o.set('T1', { t: 'T', vi: id, xy: [30, 40], wh: [200, 60] })
		doc.o.set('F1', { t: 'R', xy: [5000, 5000], wh: [10, 10] })
		const text = new Y.Text()
		text.insert(0, 'Hi')
		doc.rt.set('T1', text)
		doc.r.push([
			[0, 'R1'],
			[0, 'T1'],
			[0, 'F1']
		])

		const undo = new Y.UndoManager([doc.o, doc.r, doc.v, doc.vo, doc.rt, doc.vn], {
			trackedOrigins: new Set([yDoc.clientID])
		})
		const rootBefore = doc.r.toArray()
		const dupId = duplicateView(yDoc, doc, id)

		const dup = doc.v.get(dupId)!
		expect(dup.tpl).toBe('TPL1')
		expect(dup.showBorder).toBe(false)

		const copies: [string, StoredObject][] = []
		doc.o.forEach((obj, oid) => {
			if (obj.vi === dupId) copies.push([oid, obj])
		})
		expect(copies).toHaveLength(2)
		const xys = copies.map(([, o]) => o.xy)
		expect(xys).toEqual(
			expect.arrayContaining([
				[10, 20],
				[30, 40]
			])
		)

		const textCopy = copies.find(([, o]) => o.t === 'T')!
		const copiedText = doc.rt.get(textCopy[0])
		expect(copiedText?.toString()).toBe('Hi')
		expect(copiedText).not.toBe(doc.rt.get('T1'))

		expect(doc.o.size).toBe(5) // floating F1 not copied
		expect(doc.o.get('R1')?.vi).toBe(id)
		const rootIds = doc.r.toArray().map((r) => r[1])
		for (const [oid] of copies) expect(rootIds).toContain(oid)

		undo.undo()
		expect(doc.v.has(dupId)).toBe(false)
		expect(doc.o.size).toBe(3)
		expect(doc.r.toArray()).toEqual(rootBefore)
	})

	it('clones groups holding copied objects and copies notes', () => {
		const yDoc = new Y.Doc()
		const id = toViewId('V1')
		yDoc.getMap('v').set(id, { name: 'Slide', x: 0, y: 0, width: 1920, height: 1080 })
		yDoc.getArray<string>('vo').push([id])

		const doc = getOrCreateDocument(yDoc, true)
		const layerId = doc.r.toArray().find((r) => r[0] === 1)![1]
		doc.c.set('G1', { t: 'G', p: layerId, xy: [0, 0] })
		getContainerChildren(yDoc, doc, toContainerId(layerId)).push([[1, 'G1']])
		doc.o.set('A', { t: 'R', vi: id, p: 'G1', xy: [0, 0], wh: [10, 10] })
		doc.o.set('B', { t: 'R', vi: id, p: 'G1', xy: [20, 0], wh: [10, 10] })
		doc.o.set('OTHER', { t: 'R', vi: 'V2', p: 'G1', xy: [40, 0], wh: [10, 10] })
		getContainerChildren(yDoc, doc, toContainerId('G1')).push([
			[0, 'A'],
			[0, 'OTHER'],
			[0, 'B']
		])
		getOrCreateViewNotes(yDoc, doc, id).insert(0, 'Notes')
		const groupBefore = doc.ch.get('G1')!.toArray()

		const dupId = duplicateView(yDoc, doc, id)

		const copyOf = (src: string) => {
			let found: [string, StoredObject] | undefined
			doc.o.forEach((obj, oid) => {
				if (obj.vi === dupId && obj.xy[0] === doc.o.get(src)!.xy[0]) found = [oid, obj]
			})
			return found!
		}
		const [aId, a] = copyOf('A')
		const [bId, b] = copyOf('B')
		expect(a.p).not.toBe('G1')
		expect(b.p).toBe(a.p)
		const group = doc.c.get(a.p!)!
		expect(group).toMatchObject({ t: 'G', p: layerId })
		expect(doc.ch.get(a.p!)!.toArray()).toEqual([
			[0, aId],
			[0, bId]
		])
		expect(doc.ch.get('G1')!.toArray()).toEqual(groupBefore)
		const layerRefs = doc.ch.get(layerId)!.toArray()
		expect(layerRefs.findIndex((r) => r[1] === a.p)).toBe(
			layerRefs.findIndex((r) => r[1] === 'G1') + 1
		)
		expect(doc.vn.get(dupId)?.toString()).toBe('Notes')
	})

	it('terminates on a group parent cycle', () => {
		const yDoc = new Y.Doc()
		const id = toViewId('V1')
		yDoc.getMap('v').set(id, { name: 'Slide', width: 1920, height: 1080 })
		yDoc.getArray<string>('vo').push([id])
		const doc = getOrCreateDocument(yDoc, true)
		doc.c.set('GA', { t: 'G', p: 'GB', xy: [0, 0] })
		doc.c.set('GB', { t: 'G', p: 'GA', xy: [0, 0] })
		doc.o.set('R1', { t: 'R', vi: id, p: 'GA', xy: [10, 20], wh: [100, 50] })

		expect(doc.v.has(duplicateView(yDoc, doc, id))).toBe(true)
	})
})

describe('deleteView', () => {
	it('deletes page-relative objects incl. template instances; floating and prototype objects untouched; one undo step restores them', () => {
		const yDoc = new Y.Doc()
		const v1 = toViewId('V1')
		const v2 = toViewId('V2')
		yDoc.getMap('v').set(v1, { name: 'A', width: 1920, height: 1080 })
		yDoc.getMap('v').set(v2, { name: 'B', width: 1920, height: 1080 })
		yDoc.getArray<string>('vo').push([v1, v2])

		const doc = getOrCreateDocument(yDoc, true)
		doc.o.set('P1', { t: 'R', xy: [30, 40], wh: [100, 50] })
		// Instance inherits xy from its prototype (stored types declare xy required)
		doc.o.set('I1', { t: 'R', vi: v2, proto: 'P1' } as unknown as StoredObject)
		doc.o.set('R1', { t: 'R', vi: v2, xy: [10, 20], wh: [100, 50] })
		doc.o.set('F1', { t: 'R', xy: [5000, 5000], wh: [10, 10] })
		doc.r.push([
			[0, 'P1'],
			[0, 'I1'],
			[0, 'R1'],
			[0, 'F1']
		])
		const rootBefore = doc.r.toArray()
		const orderBefore = doc.vo.toArray()

		const undo = new Y.UndoManager([doc.o, doc.r, doc.v, doc.vo, doc.vn], {
			trackedOrigins: new Set([yDoc.clientID])
		})
		deleteView(yDoc, doc, v2)

		expect(doc.o.has('I1')).toBe(false)
		expect(doc.o.has('R1')).toBe(false)
		expect(doc.o.has('P1')).toBe(true)
		expect(doc.o.has('F1')).toBe(true)
		expect(doc.r.toArray().filter(([type]) => type === 0)).toEqual([
			[0, 'P1'],
			[0, 'F1']
		])
		expect(doc.v.has(v2)).toBe(false)

		undo.undo()
		expect(doc.o.get('I1')).toEqual({ t: 'R', vi: v2, proto: 'P1' })
		expect(doc.o.get('R1')?.vi).toBe(v2)
		expect(doc.r.toArray()).toEqual(rootBefore)
		expect(doc.vo.toArray()).toEqual(orderBefore)
	})

	it('removes groups left empty', () => {
		const yDoc = new Y.Doc()
		const v1 = toViewId('V1')
		const v2 = toViewId('V2')
		yDoc.getMap('v').set(v1, { name: 'A', width: 1920, height: 1080 })
		yDoc.getMap('v').set(v2, { name: 'B', width: 1920, height: 1080 })
		yDoc.getArray<string>('vo').push([v1, v2])
		const doc = getOrCreateDocument(yDoc, true)
		const layerId = doc.r.get(0)[1]
		doc.c.set('G1', { t: 'G', p: layerId, xy: [0, 0] })
		getContainerChildren(yDoc, doc, toContainerId(layerId)).push([[1, 'G1']])
		getContainerChildren(yDoc, doc, toContainerId('G1')).push([[0, 'R1']])
		doc.o.set('R1', { t: 'R', vi: v2, p: 'G1', xy: [10, 20], wh: [100, 50] })

		deleteView(yDoc, doc, v2)

		expect(doc.c.has('G1')).toBe(false)
		expect(doc.ch.has('G1')).toBe(false)
		expect(doc.ch.get(layerId)!.toArray()).toEqual([])
		expect(doc.c.has(layerId)).toBe(true)
	})
})

// vim: ts=4

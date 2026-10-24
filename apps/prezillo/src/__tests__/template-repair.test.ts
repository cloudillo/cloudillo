// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * repairTemplateRefs (run by getOrCreateDocument) detaches instances whose page does not use their
 * prototype's template and clears view `tpl` references to missing templates.
 */

import * as Y from 'yjs'

import { getOrCreateDocument, toViewId } from '../crdt'
import type { StoredObject } from '../crdt/stored-types'

describe('repairTemplateRefs', () => {
	it('keeps valid instances, detaches stray ones, clears dangling view templates', () => {
		const yDoc = new Y.Doc()
		const withTpl = toViewId('V1')
		const noTpl = toViewId('V2')
		const dangling = toViewId('V3')
		yDoc.getMap('v').set(withTpl, { name: 'A', width: 1920, height: 1080, tpl: 'TPL1' })
		yDoc.getMap('v').set(noTpl, { name: 'B', width: 1920, height: 1080 })
		yDoc.getMap('v').set(dangling, { name: 'C', width: 1920, height: 1080, tpl: 'GONE' })
		yDoc.getArray<string>('vo').push([withTpl, noTpl, dangling])
		yDoc.getMap('tpl').set('TPL1', { n: 'Template', w: 1920, h: 1080 })
		const protos = new Y.Array<string>()
		protos.push(['P1'])
		yDoc.getMap('tpo').set('TPL1', protos)

		const o = yDoc.getMap<StoredObject>('o')
		o.set('P1', { t: 'R', xy: [30, 40], wh: [100, 50] })
		o.set('I1', { t: 'R', vi: withTpl, proto: 'P1' } as unknown as StoredObject)
		o.set('I2', { t: 'R', vi: noTpl, proto: 'P1', wh: [7, 8] } as unknown as StoredObject)
		o.set('I3', { t: 'R', proto: 'P1' } as unknown as StoredObject)
		yDoc.getArray('r').push([
			[0, 'P1'],
			[0, 'I1'],
			[0, 'I2'],
			[0, 'I3']
		])

		const doc = getOrCreateDocument(yDoc, true)

		expect(doc.o.get('I1')).toEqual({ t: 'R', vi: withTpl, proto: 'P1' })
		expect(doc.o.get('I2')).toEqual({ t: 'R', vi: noTpl, xy: [30, 40], wh: [7, 8] })
		expect(doc.o.get('I3')).toEqual({ t: 'R', xy: [30, 40], wh: [100, 50] })
		expect(doc.v.get(dangling)?.tpl).toBeUndefined()
		expect(doc.v.get(withTpl)?.tpl).toBe('TPL1')
	})

	it('read-only load leaves dangling instances alone', () => {
		const yDoc = new Y.Doc()
		const id = toViewId('V1')
		yDoc.getMap('v').set(id, { name: 'A', width: 1920, height: 1080 })
		yDoc.getArray<string>('vo').push([id])
		const o = yDoc.getMap<StoredObject>('o')
		o.set('P1', { t: 'R', xy: [30, 40], wh: [100, 50] })
		o.set('I1', { t: 'R', vi: id, proto: 'P1' } as unknown as StoredObject)
		yDoc.getArray('r').push([[0, 'I1']])

		const doc = getOrCreateDocument(yDoc, true, false)
		expect(doc.o.get('I1')).toEqual({ t: 'R', vi: id, proto: 'P1' })
	})

	it('runs once per document: a later load leaves a new stray instance alone', () => {
		const yDoc = new Y.Doc()
		const id = toViewId('V1')
		yDoc.getMap('v').set(id, { name: 'A', width: 1920, height: 1080 })
		yDoc.getArray<string>('vo').push([id])

		const doc = getOrCreateDocument(yDoc, true)
		expect(doc.m.get('schema')).toBe(2)

		const o = yDoc.getMap<StoredObject>('o')
		o.set('P1', { t: 'R', xy: [30, 40], wh: [100, 50] })
		o.set('I1', { t: 'R', vi: id, proto: 'P1' } as unknown as StoredObject)
		yDoc.getArray('r').push([[0, 'I1']])

		getOrCreateDocument(yDoc, true)
		expect(doc.o.get('I1')).toEqual({ t: 'R', vi: id, proto: 'P1' })
	})
})

// vim: ts=4

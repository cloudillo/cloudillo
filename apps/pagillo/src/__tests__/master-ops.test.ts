// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { masterColumns } from '@cloudillo/typeset'
import * as Y from 'yjs'

import { openPublication } from '../crdt/document.js'
import { deleteMaster, ensureRegions, setMasterSide } from '../crdt/master-ops.js'
import type { StoredFrame, StoredMaster, StoredTextFrameData } from '../crdt/stored-types.js'
import { masterToEngine, mirrorFrame } from '../crdt/type-converters.js'

const W = 600
const base: StoredMaster = {
	name: 'Body',
	w: W,
	h: 800,
	margins: { t: 50, b: 50, in: 70, out: 30 },
	cols: 1,
	gutter: 10,
	regions: [],
	items: []
}
const opts = { facing: true, rtl: false }

function setup(m: StoredMaster) {
	const yDoc = new Y.Doc()
	const doc = openPublication(yDoc)
	doc.m.set('facing', true)
	doc.ms.set('m1', m)
	const get = () => doc.ms.get('m1') as StoredMaster
	return { yDoc, doc, get }
}

describe('ensureRegions', () => {
	it.each([
		['same', { side: 'same' }],
		['different', { side: 'different', left: { cols: 2 } }],
		['mirror', { side: 'mirror' }]
	] as const)('moves no page in %s mode', (_mode, patch) => {
		const { yDoc, doc, get } = setup({ ...base, ...patch })
		const cols = () => {
			const e = masterToEngine('m1', get(), opts)
			return [masterColumns(e, 'l'), masterColumns(e, 'r')]
		}
		const before = cols()
		expect(ensureRegions(yDoc, doc, 'm1')).toBeDefined()
		expect(cols()).toEqual(before)
	})
})

describe('setMasterSide', () => {
	const frame = (t: StoredFrame['t'], x: number, data: StoredFrame['data']): StoredFrame => ({
		t,
		anchor: { sec: '', page: 0 },
		x,
		y: 10,
		w: 100,
		h: 50,
		rot: 5,
		z: 0,
		wrap: { mode: 'none', off: 0 },
		data
	})

	it('mirror → different keeps static items and areas in place', () => {
		const { yDoc, doc, get } = setup({ ...base, side: 'mirror', items: ['img', 'txt'] })
		doc.f.set('img', frame('img', 20, {} as StoredFrame['data']))
		doc.f.set('txt', frame('txt', 40, { story: 'st' }))
		doc.tx.set('st', new Y.Text('hi\n'))

		setMasterSide(yDoc, doc, 'm1', 'different')
		const m = get()
		const left = m.left?.items ?? []
		expect(left).toHaveLength(2)
		expect(left).not.toContain('img')
		expect(left).not.toContain('txt')
		left.forEach((nid, i) => {
			const src = doc.f.get(m.items[i]) as StoredFrame
			expect(doc.f.get(nid)?.x).toBe(mirrorFrame(src, W).x)
		})
		const story = ((doc.f.get(left[1]) as StoredFrame).data as StoredTextFrameData).story
		expect(story).not.toBe('st')
		expect(doc.tx.get(story)?.toString()).toBe('hi\n')
		expect(m.right?.items).toBeUndefined()

		// Reselecting the same mode must not wipe the variant items.
		setMasterSide(yDoc, doc, 'm1', 'different')
		expect(get().left?.items).toEqual(left)
	})

	it('mirror → different keeps the manual left order', () => {
		const area = (id: string, x: number) => ({
			id,
			x,
			y: 50,
			w: 100,
			h: 700,
			cols: 1,
			gutter: 0
		})
		const { yDoc, doc, get } = setup({
			...base,
			side: 'mirror',
			flow: 'manual',
			regions: [area('a', 70), area('b', 300)],
			leftOrder: ['b', 'gone', 'a']
		})
		const want = masterToEngine('m1', get(), opts).left?.regions?.map((r) => r.id)
		setMasterSide(yDoc, doc, 'm1', 'different')
		expect(get().left?.regions?.map((r) => r.id)).toEqual(want)
	})
})

describe('deleteMaster', () => {
	it('drops the text story of a deleted text item', () => {
		const { yDoc, doc } = setup({ ...base, items: ['txt'] })
		doc.f.set('txt', { t: 'txt', data: { story: 'st' } } as StoredFrame)
		doc.tx.set('st', new Y.Text('hi\n'))

		expect(deleteMaster(yDoc, doc, 'm1')).toBe(true)
		expect(doc.f.has('txt')).toBe(false)
		expect(doc.tx.has('st')).toBe(false)
	})
})

// vim: ts=4

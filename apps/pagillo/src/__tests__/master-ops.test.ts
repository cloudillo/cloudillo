// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { masterColumns } from '@cloudillo/typeset'
import * as Y from 'yjs'

import { openPublication } from '../crdt/document.js'
import {
	framesOf,
	frameOf,
	newFrameMap,
	newMasterMap,
	newSectionMap,
	masterOf
} from '../crdt/entities.js'
import {
	deleteMaster,
	duplicateMaster,
	ensureRegions,
	leftCloneId,
	setMasterSide
} from '../crdt/master-ops.js'
import { duplicateSection } from '../crdt/section-ops.js'
import type {
	StoredFrame,
	StoredMaster,
	StoredSection,
	StoredTextFrameData
} from '../crdt/stored-types.js'
import { masterItemIndex, masterToEngine, mirrorFrame } from '../crdt/type-converters.js'

const W = 600
const base: StoredMaster = {
	name: 'Body',
	w: W,
	h: 800,
	margins: { t: 50, b: 50, in: 70, out: 30 },
	cols: 1,
	gutter: 10,
	regions: []
}
const opts = { facing: true, rtl: false }

function setup(m: StoredMaster) {
	const yDoc = new Y.Doc()
	const doc = openPublication(yDoc)
	doc.m.set('facing', true)
	doc.ms.set('m1', newMasterMap(m))
	const get = () => masterOf(doc, 'm1') as StoredMaster
	const items = () => masterItemIndex(doc).get('m1')
	return { yDoc, doc, get, items }
}

/** A shared static item of `m1`. */
const item = (t: StoredFrame['t'], x: number, data: StoredFrame['data']): StoredFrame => ({
	t,
	anchor: { ms: 'm1' },
	x,
	y: 10,
	w: 100,
	h: 50,
	rot: 5,
	z: 0,
	wrap: { mode: 'none', off: 0 },
	data
})

describe('ensureRegions', () => {
	it.each([
		['same', { side: 'same' }],
		['different', { side: 'different', left: { cols: 2 } }],
		['mirror', { side: 'mirror' }]
	] as const)('moves no page in %s mode', (_mode, patch) => {
		const { yDoc, doc, get, items } = setup({ ...base, ...patch })
		const cols = () => {
			const e = masterToEngine('m1', get(), items(), opts)
			return [masterColumns(e, 'l'), masterColumns(e, 'r')]
		}
		const before = cols()
		expect(ensureRegions(yDoc, doc, 'm1')).toBeDefined()
		expect(cols()).toEqual(before)
	})
})

describe('setMasterSide', () => {
	it('mirror → different keeps static items and areas in place', () => {
		const { yDoc, doc, get, items } = setup({ ...base, side: 'mirror' })
		doc.f.set('img', newFrameMap(item('img', 20, {} as StoredFrame['data'])))
		doc.f.set('txt', newFrameMap(item('txt', 40, { story: 'st' })))
		doc.tx.set('st', new Y.Text('hi\n'))

		setMasterSide(yDoc, doc, 'm1', 'different')
		// Additive per-side items: the shared items move to the right side, the left side gets
		// mirrored clones (nothing stays shared, else it would draw twice on the left).
		const { both, l, r } = items() ?? { both: [], l: [], r: [] }
		expect(both).toEqual([])
		expect(r).toEqual(['img', 'txt'])
		expect(l).toHaveLength(2)
		const clone = (t: StoredFrame['t']) => l.find((id) => frameOf(doc, id)?.t === t) ?? ''
		for (const src of r) {
			const f = frameOf(doc, src) as StoredFrame
			expect(frameOf(doc, clone(f.t))?.x).toBe(mirrorFrame(f, W).x)
		}
		const story = (frameOf(doc, clone('txt'))?.data as StoredTextFrameData | undefined)?.story
		expect(story).not.toBe('st')
		expect(doc.tx.get(story as string)?.toString()).toBe('hi\n')
		expect(get().left).not.toHaveProperty('items')
		expect(get().right).not.toHaveProperty('items')

		// Reselecting the same mode must not wipe the side items.
		setMasterSide(yDoc, doc, 'm1', 'different')
		expect(items()).toEqual({ both: [], l, r })
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
		const { yDoc, doc, get, items } = setup({
			...base,
			side: 'mirror',
			flow: 'manual',
			regions: [area('a', 70), area('b', 300)],
			leftOrder: ['b', 'gone', 'a']
		})
		const want = masterToEngine('m1', get(), items(), opts).left?.regions?.map((r) => r.id)
		setMasterSide(yDoc, doc, 'm1', 'different')
		expect(get().left?.regions?.map((r) => r.id)).toEqual(want)
	})

	it('concurrent mirror → different splits keep one left clone per item', () => {
		const { yDoc: a, doc: da } = setup({ ...base, side: 'mirror' })
		da.f.set('img', newFrameMap(item('img', 20, {} as StoredFrame['data'])))
		da.f.set('txt', newFrameMap(item('txt', 40, { story: 'st' })))
		da.tx.set('st', new Y.Text('hi\n'))
		const b = new Y.Doc()
		Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
		const db = openPublication(b)

		setMasterSide(a, da, 'm1', 'different')
		setMasterSide(b, db, 'm1', 'different')
		Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
		Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
		for (const doc of [da, db]) {
			const l = masterItemIndex(doc).get('m1')?.l ?? []
			expect(l.sort()).toEqual([leftCloneId('img'), leftCloneId('txt')])
		}
	})
})

describe('deleteMaster', () => {
	it('drops the text story of a deleted text item', () => {
		const { yDoc, doc } = setup(base)
		doc.f.set('txt', newFrameMap(item('txt', 0, { story: 'st' })))
		doc.tx.set('st', new Y.Text('hi\n'))

		expect(deleteMaster(yDoc, doc, 'm1')).toBe(true)
		expect(doc.f.has('txt')).toBe(false)
		expect(doc.tx.has('st')).toBe(false)
	})
})

describe('copying text frames', () => {
	const txt = (data: StoredTextFrameData): StoredFrame => ({
		t: 'txt',
		anchor: { sec: 's1', page: 0 },
		x: 0,
		y: 0,
		w: 100,
		h: 50,
		rot: 0,
		z: 0,
		wrap: { mode: 'none', off: 0 },
		data
	})
	const dataOf = (doc: ReturnType<typeof setup>['doc'], id: string) =>
		frameOf(doc, id)?.data as StoredTextFrameData

	it('duplicateMaster keeps box styling and gives a story-less item a fresh story', () => {
		const { yDoc, doc } = setup(base)
		doc.f.set('a', newFrameMap(item('txt', 0, { story: 'st', inset: 5, fill: 'red' })))
		doc.f.set('b', newFrameMap(item('txt', 0, { stroke: 'blue' })))
		doc.tx.set('st', new Y.Text('hi\n'))
		const copy = duplicateMaster(yDoc, doc, 'm1', 'Copy') ?? ''
		// Item ids are sorted, not in insertion order: find the copies by their data.
		const copies = masterItemIndex(doc).get(copy)?.both ?? []
		expect(copies).toHaveLength(2)
		const na = copies.find((id) => dataOf(doc, id).fill === 'red') ?? ''
		const nb = copies.find((id) => dataOf(doc, id).stroke === 'blue') ?? ''
		expect(dataOf(doc, na)).toMatchObject({ inset: 5, fill: 'red' })
		expect(doc.tx.get(dataOf(doc, na).story ?? '')?.toString()).toBe('hi\n')
		expect(doc.tx.has(dataOf(doc, nb).story ?? '')).toBe(true)
	})

	it('duplicateMaster skips synthesized ~ ids and keeps item sides', () => {
		const { yDoc, doc } = setup(base)
		doc.f.set('x~1', newFrameMap(item('shp', 0, {} as StoredFrame['data'])))
		doc.f.set('l', newFrameMap({ ...item('shp', 0, {}), anchor: { ms: 'm1', side: 'l' } }))
		const copy = duplicateMaster(yDoc, doc, 'm1', 'Copy') ?? ''
		expect(masterItemIndex(doc).get(copy)).toMatchObject({ both: [], r: [] })
		expect(masterItemIndex(doc).get(copy)?.l).toHaveLength(1)
	})

	it('duplicateSection keeps box styling', () => {
		const { yDoc, doc } = setup(base)
		doc.s.set(
			's1',
			newSectionMap({ story: 'sst', first: 'm1', rest: 'm1' } as unknown as StoredSection)
		)
		doc.secs.push(['s1'])
		doc.tx.set('sst', new Y.Text('\n'))
		doc.tx.set('st', new Y.Text('hi\n'))
		doc.f.set('a', newFrameMap(txt({ story: 'st', inset: 5, fill: 'red' })))
		const copy = duplicateSection(yDoc, doc, 's1')
		const [id] = framesOf(doc).find(([, f]) => 'sec' in f.anchor && f.anchor.sec === copy) ?? []
		expect(dataOf(doc, id ?? '')).toMatchObject({ inset: 5, fill: 'red' })
	})
})

// vim: ts=4

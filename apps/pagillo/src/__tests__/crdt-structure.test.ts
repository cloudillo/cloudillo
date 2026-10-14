// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Concurrent edits to different parts of one entity merge (entity `Y.Map`s, field-group keys). */

import * as Y from 'yjs'

import { openPublication, setMeta } from '../crdt/document.js'
import {
	FULL_CROP,
	frameOf,
	masterOf,
	newFrameMap,
	readFrame,
	readMaster,
	styleOf
} from '../crdt/entities.js'
import { addFrame, chainOf, linkFrame, updateFrame } from '../crdt/frame-ops.js'
import { addMaster, updateMaster } from '../crdt/master-ops.js'
import { sweepOrphanStories } from '../crdt/normalize.js'
import type { StoredFrame, StoredMaster, StoredStyle } from '../crdt/stored-types.js'
import { addStyle, updateStyle } from '../crdt/style-ops.js'
import { masterItemIndex, readMeta } from '../crdt/type-converters.js'

const master: StoredMaster = {
	name: 'Body',
	w: 600,
	h: 800,
	margins: { t: 50, b: 50, in: 50, out: 50 },
	cols: 1,
	gutter: 10,
	regions: []
}

const box = {
	anchor: { sec: 's1', page: 0 },
	x: 0,
	y: 0,
	w: 100,
	h: 100,
	rot: 0,
	z: 1,
	wrap: { mode: 'none' as const, off: 0 }
}

/** Two peers; `sync()` exchanges full state both ways. */
function peers() {
	const a = new Y.Doc()
	const b = new Y.Doc()
	const sync = () => {
		const ua = Y.encodeStateAsUpdate(a)
		const ub = Y.encodeStateAsUpdate(b)
		Y.applyUpdate(b, ua)
		Y.applyUpdate(a, ub)
	}
	return { a, da: openPublication(a), b, db: openPublication(b), sync }
}

describe('concurrent edits merge', () => {
	it('head move + chain link both survive', () => {
		const { a, da, b, db, sync } = peers()
		da.secs.push(['s1'])
		const txt = () => addFrame(a, da, { t: 'txt', ...box, data: {} }, { paras: [{}] })
		const head = txt()
		const next = txt()
		sync()
		updateFrame(a, da, head, { x: 50 })
		expect(linkFrame(b, db, head, next)).toBe(true)
		sync()
		for (const d of [da, db]) {
			expect(frameOf(d, head)?.x).toBe(50)
			expect(chainOf(d, head)?.frames).toEqual([head, next])
		}
	})

	it('two prop edits on one style both survive', () => {
		const { a, da, b, db, sync } = peers()
		const id = addStyle(a, da, { k: 'c', name: 'Em', props: {} } as StoredStyle)
		sync()
		updateStyle(a, da, id, { props: { italic: true } })
		updateStyle(b, db, id, { props: { color: 'red' } })
		sync()
		for (const d of [da, db])
			expect(styleOf(d, id)?.props).toEqual({ italic: true, color: 'red' })
	})

	it('master margin edit + master item add both survive', () => {
		const { a, da, b, db, sync } = peers()
		const id = addMaster(a, da, master)
		sync()
		const margins = { t: 20, b: 20, in: 30, out: 40 }
		updateMaster(a, da, id, { margins })
		const item = addFrame(b, db, { t: 'shp', ...box, data: {} } as StoredFrame, { master: id })
		sync()
		for (const d of [da, db]) {
			expect(masterOf(d, id)?.margins).toEqual(margins)
			expect(masterItemIndex(d).get(id)?.both).toEqual([item])
		}
	})

	it('two master layout field edits both survive', () => {
		const { a, da, b, db, sync } = peers()
		const id = addMaster(a, da, master)
		sync()
		const margins = { t: 20, b: 20, in: 30, out: 40 }
		updateMaster(a, da, id, { margins })
		updateMaster(b, db, id, { cols: 3 })
		sync()
		for (const d of [da, db]) expect(masterOf(d, id)).toMatchObject({ margins, cols: 3 })
	})

	it('two spellIgnore words added on a fresh doc both survive', () => {
		const { a, da, b, db, sync } = peers()
		setMeta(a, da, { spellIgnore: ['foo'] })
		setMeta(b, db, { spellIgnore: ['bar'] })
		sync()
		for (const d of [da, db]) expect(readMeta(d.m).spellIgnore.sort()).toEqual(['bar', 'foo'])
	})
})

describe('frame fields', () => {
	it('replacing an image resets its crop', () => {
		const { a, da } = peers()
		const crop = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }
		const id = addFrame(a, da, {
			t: 'img',
			...box,
			data: { fileId: 'f1', crop }
		} as StoredFrame)
		expect(frameOf(da, id)?.data).toMatchObject({ fileId: 'f1', crop })
		updateFrame(a, da, id, { data: { fileId: 'f2' } } as Partial<StoredFrame>)
		expect(frameOf(da, id)?.data).toMatchObject({ fileId: 'f2', crop: FULL_CROP })
	})

	it('reads a non-Y.Map frame as undefined', () => {
		expect(readFrame({})).toBeUndefined()
		expect(readFrame(5)).toBeUndefined()
		expect(readFrame(new Y.Map())).toBeUndefined()
		const { da } = peers()
		da.f.set('x', { t: 'txt', ...box, data: {} } as never)
		expect(frameOf(da, 'x')).toBeUndefined()
	})

	it('ignores an inherited anchor (__proto__ key)', () => {
		const { da } = peers()
		const y = new Y.Map<unknown>([['t', 'shp']])
		da.f.set('p', y)
		y.set('__proto__', { anchor: box.anchor })
		expect(readFrame(y)).toBeUndefined()
	})

	it('sanitizes image px and crop', () => {
		const { da } = peers()
		const y = newFrameMap({ t: 'img', ...box, data: { fileId: 'f1', crop: FULL_CROP } })
		da.f.set('i', y)
		y.set('src', { fileId: 'f1', px: ['a', Number.NaN], crop: { x: 0, y: 0, w: 0, h: 1 } })
		const d = frameOf(da, 'i')?.data
		expect(d).not.toHaveProperty('px')
		expect(d).toMatchObject({ crop: FULL_CROP })
	})
})

describe('master fields', () => {
	it('reads a master with a malformed layout as undefined', () => {
		const { da } = peers()
		const y = new Y.Map<unknown>()
		da.ms.set('m', y)
		y.set('w', 0)
		y.set('h', 800)
		y.set('margins', {})
		y.set('regions', [])
		expect(readMaster(y)).toBeUndefined()
	})

	it('keeps the story of a frame it cannot read', () => {
		const { a, da } = peers()
		a.transact(() => {
			da.f.set(
				'u',
				new Y.Map<unknown>([
					['t', 'zzz'],
					['story', 'st']
				])
			)
			da.tx.set('st', new Y.Text('hi\n'))
			sweepOrphanStories(da)
		})
		expect(da.tx.has('st')).toBe(true)
	})

	it('sweeps frames anchored to a missing master, with their stories', () => {
		const { a, da } = peers()
		a.transact(() => {
			da.f.set(
				't',
				newFrameMap({ t: 'txt', ...box, anchor: { ms: 'gone' }, data: { story: 'st' } })
			)
			da.tx.set('st', new Y.Text('hi\n'))
			sweepOrphanStories(da)
		})
		expect(da.f.has('t')).toBe(false)
		expect(da.tx.has('st')).toBe(false)
	})
})

// vim: ts=4

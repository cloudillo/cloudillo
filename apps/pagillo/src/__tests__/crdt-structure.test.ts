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
	newSectionMap,
	readFrame,
	readMaster,
	styleOf
} from '../crdt/entities.js'
import { addFrame, chainOf, linkFrame, updateFrame } from '../crdt/frame-ops.js'
import { addMaster, updateMaster } from '../crdt/master-ops.js'
import { rootNotes, sweepOrphanStories } from '../crdt/normalize.js'
import type { StoredFrame, StoredMaster, StoredSection, StoredStyle } from '../crdt/stored-types.js'
import { copyStory } from '../crdt/story-ops.js'
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

	it('keeps footnote bodies referenced from story text', () => {
		const { a, da } = peers()
		a.transact(() => {
			da.s.set('s1', newSectionMap({ story: 'S' } as StoredSection))
			const t = new Y.Text()
			da.tx.set('S', t)
			t.insert(0, 'a')
			t.insertEmbed(1, { fn: 'n' })
			t.insert(2, '\n')
			da.tx.set('n', new Y.Text('note\n'))
			da.tx.set('x', new Y.Text('orphan\n'))
			sweepOrphanStories(da)
		})
		expect(da.tx.has('n')).toBe(true)
		expect(da.tx.has('x')).toBe(false)
	})

	it('ignores footnote refs outside section stories', () => {
		const { a, da } = peers()
		a.transact(() => {
			da.f.set(
				't',
				newFrameMap({
					t: 'txt',
					...box,
					anchor: { sec: 's1', page: 0 },
					data: { story: 'F' }
				})
			)
			const t = new Y.Text()
			da.tx.set('F', t)
			t.insertEmbed(0, { fn: 'n' })
			t.insert(1, '\n')
			da.tx.set('n', new Y.Text('note\n'))
			sweepOrphanStories(da)
		})
		expect(da.tx.has('F')).toBe(true)
		expect(da.tx.has('n')).toBe(false)
	})

	it('roots footnote bodies in f, and sweeps the root with its body', () => {
		const { a, da } = peers()
		const t = new Y.Text()
		a.transact(() => {
			da.s.set('s1', newSectionMap({ story: 'S' } as StoredSection))
			da.tx.set('S', t)
			t.insert(0, 'a')
			t.insertEmbed(1, { fn: 'n' })
			t.insert(2, '\n')
			da.tx.set('n', new Y.Text('note\n'))
			rootNotes(da, t)
		})
		const root = da.f.get('n')
		expect(root?.get('story')).toBe('n')
		expect(readFrame(root)).toBeUndefined()
		a.transact(() => sweepOrphanStories(da))
		expect(da.tx.has('n')).toBe(true)

		a.transact(() => {
			t.delete(1, 1)
			sweepOrphanStories(da)
		})
		expect(da.tx.has('n')).toBe(false)
		expect(da.f.has('n')).toBe(false)
	})

	it('copyStory gives the copy its own footnote bodies', () => {
		const { a, da } = peers()
		let copy = ''
		a.transact(() => {
			const t = new Y.Text()
			da.tx.set('S', t)
			t.insertEmbed(0, { fn: 'n' })
			t.insert(1, '\n', { bid: 'b1' })
			const n = new Y.Text()
			da.tx.set('n', n)
			n.insert(0, 'note')
			n.insert(4, '\n', { bid: 'b2' })
			copy = copyStory(da, 'S')
		})
		const fn = (da.tx.get(copy)?.toDelta()[0]?.insert as { fn?: string } | undefined)?.fn ?? ''
		expect(fn).not.toBe('n')
		expect(da.tx.get(fn)?.toString()).toBe('note\n')
		const bids = (id: string) =>
			(da.tx.get(id)?.toDelta() ?? []).flatMap(
				(op: { attributes?: { bid?: string } }) => op.attributes?.bid ?? []
			)
		expect(bids(copy)).toHaveLength(1)
		expect(bids(copy)).not.toContain('b1')
		expect(bids(fn)).toHaveLength(1)
		expect(bids(fn)).not.toContain('b2')
	})
})

// vim: ts=4

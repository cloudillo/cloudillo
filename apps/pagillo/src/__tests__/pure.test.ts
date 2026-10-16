// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { ptToFx, type TableBlock } from '@cloudillo/typeset'
import * as Y from 'yjs'

import { computeBlockIdFixes, stripBlockIds } from '../crdt/block-ids.js'
import { openPublication } from '../crdt/document.js'
import { newFrameMap, newMasterMap, newSectionMap } from '../crdt/entities.js'
import { registerNormalizer } from '../crdt/normalize.js'
import { sanitizeBox, sanitizeMarks, sanitizeOverrides } from '../crdt/overrides.js'
import type { StoredFrame, StoredMaster, StoredSection } from '../crdt/stored-types.js'
import {
	byIds,
	deltaToParagraphs,
	flipRegion,
	flowOrder,
	framesToEngine,
	isRtlLang,
	masterToEngine,
	readMeta,
	resolveSide
} from '../crdt/type-converters.js'
import { type PageInfo, type PageItem, snapAt, snapTargets } from '../editor/frames.js'
import { hitFrame } from '../editor/hit-test.js'
import { parseLength } from '../ui/LengthInput.js'

const area = (id: string, x: number, y: number, w: number, h: number) => ({
	id,
	x,
	y,
	w,
	h,
	cols: 1,
	gutter: 0
})
const ids = (rs: { id: string }[]) => rs.map((r) => r.id)

describe('flowOrder', () => {
	// Stacked rows: a full-width header above two columns.
	const head = area('head', 0, 0, 500, 100)
	const a = area('a', 0, 120, 240, 300)
	const b = area('b', 260, 120, 240, 300)

	it('orders rows top to bottom, areas left to right', () => {
		expect(ids(flowOrder([b, head, a], false))).toEqual(['head', 'a', 'b'])
	})

	it('orders areas right to left for RTL', () => {
		expect(ids(flowOrder([a, b, head], true))).toEqual(['head', 'b', 'a'])
	})

	it('puts a main area and an outer sidebar in position order on each side', () => {
		const main = area('main', 70, 50, 400, 700)
		const side = area('side', 490, 50, 100, 700)
		expect(ids(flowOrder([side, main], false))).toEqual(['main', 'side'])
		// Mirrored (left-hand page): the sidebar is now on the left, so it comes first.
		const left = [main, side].map((r) => flipRegion(r, 660))
		expect(ids(flowOrder(left, false))).toEqual(['side', 'main'])
	})
})

describe('mirroring', () => {
	const m: StoredMaster = {
		name: 'Body',
		w: 660,
		h: 800,
		margins: { t: 50, b: 50, in: 70, out: 70 },
		cols: 1,
		gutter: 10,
		regions: [area('side', 490, 50, 100, 700), area('main', 70, 50, 400, 700)],
		rows: 2,
		regionNames: { main: 'Main' }
	}
	const items = { both: ['logo'], l: [], r: [] }
	const opts = { facing: true, rtl: false }

	it('flips x across the page', () => {
		expect(flipRegion(area('r', 70, 0, 400, 10), 660).x).toBe(190)
	})

	it('resolves the facing mode', () => {
		expect(resolveSide(m, false)).toBe('same')
		expect(resolveSide(m, true)).toBe('mirror')
		expect(resolveSide({ ...m, left: { cols: 2 } }, true)).toBe('different')
		expect(resolveSide({ ...m, left: { cols: 2 }, side: 'same' }, true)).toBe('same')
	})

	it('synthesizes the left variant and strips pagillo-only fields', () => {
		const e = masterToEngine('mid', m, items, opts)
		expect(ids(e.regions)).toEqual(['main', 'side'])
		expect(ids(e.left?.regions ?? [])).toEqual(['side', 'main'])
		expect(e.left?.regions?.find((r) => r.id === 'main')?.x).toBe(190)
		expect(e.left?.items).toEqual(['logo~m'])
		expect(e.right).toBeUndefined()
		for (const k of ['name', 'rows', 'regionNames', 'side', 'flow', 'leftOrder'])
			expect(Object.hasOwn(e, k)).toBe(false)
	})

	it('keeps stored order with manual flow, leftOrder on the left', () => {
		const e = masterToEngine('mid', { ...m, flow: 'manual', leftOrder: ['main'] }, items, opts)
		expect(ids(e.regions)).toEqual(['side', 'main'])
		expect(ids(e.left?.regions ?? [])).toEqual(['main', 'side'])
	})

	it('has no variants when not facing or same', () => {
		expect(masterToEngine('mid', m, items, { facing: false, rtl: false }).left).toBeUndefined()
		const e = masterToEngine('mid', { ...m, side: 'same', left: { cols: 2 } }, items, opts)
		// Facing 'same': only the margins, swapped back so the implicit area does not flip.
		expect(e.left).toEqual({ margins: { t: 50, b: 50, in: 70, out: 70 } })
		const lop = masterToEngine(
			'mid',
			{ ...m, side: 'same', margins: { t: 0, b: 0, in: 70, out: 30 } },
			items,
			opts
		)
		expect(lop.left).toEqual({ margins: { t: 0, b: 0, in: 30, out: 70 } })
	})

	it('detects RTL languages', () => {
		expect(isRtlLang('he-IL')).toBe(true)
		expect(isRtlLang('en')).toBe(false)
	})
})

describe('byIds', () => {
	it('orders by ids, unknown ids last in their order', () => {
		const rs = ['x', 'a', 'y', 'b'].map((id) => area(id, 0, 0, 1, 1))
		expect(ids(byIds(rs, ['b', 'a', 'gone']))).toEqual(['b', 'a', 'x', 'y'])
		expect(byIds(rs, undefined)).toBe(rs)
	})
})

describe('peer data reaching the layout worker', () => {
	it('drops ill-typed marks', () => {
		const ps = deltaToParagraphs([
			{ insert: 'x', attributes: { color: 5, link: {}, bold: 'x' } },
			{ insert: '\n' }
		])
		expect(ps[0].runs).toEqual([{ text: 'x', marks: {} }])
	})

	it('copies an image float onto its EmbedBlock', () => {
		const img = { fileId: 'f', w: 10, h: 10, alt: '' }
		const ps = deltaToParagraphs([
			{ insert: { img: { ...img, float: { side: 'r', w: 0.5 } } } },
			{ insert: '\n' },
			{ insert: { img } },
			{ insert: '\n' }
		])
		expect(ps.map((p) => (p.runs as { float?: unknown }).float)).toEqual([
			{ side: 'r', w: 0.5 },
			undefined
		])
	})

	it('does not make an embed block of a malformed emb', () => {
		const ps = deltaToParagraphs([{ insert: { emb: null } }, { insert: '\n' }])
		expect(Array.isArray(ps[0].runs)).toBe(true)
		expect((ps[0].runs as { k?: string }).k).toBeUndefined()
	})

	it('makes an embed block of an emb record, 400×300 px when it has no natural size', () => {
		const ps = deltaToParagraphs([{ insert: { emb: { address: 'x' } } }, { insert: '\n' }])
		expect(ps[0].runs).toMatchObject({
			k: 'emb',
			data: { address: 'x' },
			w: ptToFx(300),
			h: ptToFx(225)
		})
	})

	it('groups quill-table-better lines into one table paragraph', () => {
		const th = (row: string, cell: string) => ({
			'table-th': { 'data-row': row },
			'table-th-block': cell
		})
		const td = (row: string, cell: string) => ({
			'table-cell': { 'data-row': row },
			'table-cell-block': cell
		})
		const ps = deltaToParagraphs([
			{ insert: 'before\n', attributes: { bid: 'p0' } },
			{
				insert: '\n',
				attributes: { bid: 't', 'table-temporary': { 'data-borders': 'outer' } }
			},
			{ insert: 'A\n', attributes: { bid: 'a', ...th('r1', 'c1') } },
			{ insert: 'B\n', attributes: { bid: 'b', ...th('r1', 'c2') } },
			{ insert: 'C\n', attributes: { ...td('r2', 'c3') } },
			{ insert: 'C2\n', attributes: { bid: 'c2', ...td('r2', 'c3') } },
			{ insert: 'D\n', attributes: { bid: 'd', ...td('r2', 'c4') } },
			{ insert: 'after\n', attributes: { bid: 'p1' } }
		])
		expect(ps.map((p) => p.bid)).toEqual(['p0', 't', 'p1'])
		const blk = ps[1].runs as TableBlock
		expect(blk.borders).toBe('outer')
		expect(blk.cols).toEqual([0, 0])
		expect(blk.rows.map((r) => !!r.header)).toEqual([true, false])
		// The bid-less cell line falls back to its '\n' index (4), as `paragraphStarts` does.
		expect(blk.rows[1].cells.map((c) => c.paragraphs.map((p) => p.bid))).toEqual([
			['~4', 'c2'],
			['d']
		])
	})

	it('caps a table at 64 columns without losing cells', () => {
		const ps = deltaToParagraphs(
			Array.from({ length: 100 }, (_, i) => ({
				insert: `c${i}\n`,
				attributes: { 'table-cell': { 'data-row': 'r1' }, 'table-cell-block': `c${i}` }
			}))
		)
		const blk = ps[0].runs as TableBlock
		expect(blk.cols).toHaveLength(64)
		expect(blk.rows[0].cells).toHaveLength(64)
		expect(blk.rows[0].cells.flatMap((c) => c.paragraphs)).toHaveLength(100)
	})

	it('coerces meta', () => {
		const m = new Y.Doc().getMap('m')
		m.set('lang', 5)
		m.set('facing', 'yes')
		m.set('styleMap', [1])
		m.set('title', 3)
		const meta = readMeta(m)
		expect(meta).toMatchObject({ lang: 'en', facing: false, styleMap: {}, title: undefined })
	})

	it('skips stored frames with a reserved ~ id', () => {
		const doc = openPublication(new Y.Doc())
		const f = {
			t: 'shp',
			anchor: { sec: 's', page: 0 },
			x: 0,
			y: 0,
			w: 1,
			h: 1,
			rot: 0,
			z: 0,
			wrap: { mode: 'none', off: 0 },
			data: {}
		} as unknown as StoredFrame
		doc.f.set('a', newFrameMap(f))
		doc.f.set('a~m', newFrameMap(f))
		expect(Object.keys(framesToEngine(doc, (id) => ({ id, paragraphs: [] })))).toEqual(['a'])
	})

	it('normalises stories next to a non-text tx entry', () => {
		const yDoc = new Y.Doc()
		const doc = openPublication(yDoc)
		const t = new Y.Text()
		yDoc.transact(() => {
			doc.tx.set('bad', new Y.Map() as unknown as Y.Text)
			doc.tx.set('ok', t)
			t.insert(0, 'no newline')
			doc.s.set('s1', newSectionMap({ story: 'bad' } as StoredSection))
			doc.s.set('s2', newSectionMap({ story: 'ok' } as StoredSection))
		})
		expect(() => registerNormalizer(yDoc, doc, () => true)).not.toThrow()
		expect(t.toString()).toBe('no newline\n')
	})

	it('roots footnote bodies when it normalises the referencing story', () => {
		const yDoc = new Y.Doc()
		const doc = openPublication(yDoc)
		yDoc.transact(() => {
			const t = new Y.Text()
			doc.tx.set('S', t)
			t.insertEmbed(0, { fn: 'n' })
			doc.tx.set('n', new Y.Text('note\n'))
			doc.s.set('s1', newSectionMap({ story: 'S' } as StoredSection))
		})
		registerNormalizer(yDoc, doc, () => true).dispose()
		expect(doc.f.get('n')?.toJSON()).toEqual({ t: 'fn', story: 'n' })
		expect(doc.tx.has('n')).toBe(true)
	})

	it('sweeps unreferenced stories once, at the first write', () => {
		const yDoc = new Y.Doc()
		const doc = openPublication(yDoc)
		const frame = (data: object, anchor: StoredFrame['anchor'] = { sec: 's1', page: 0 }) =>
			newFrameMap({
				t: 'txt',
				anchor,
				x: 0,
				y: 0,
				w: 1,
				h: 1,
				rot: 0,
				z: 0,
				wrap: { mode: 'none', off: 0 },
				data
			})
		yDoc.transact(() => {
			for (const id of ['sec', 'head', 'item', 'orphan']) doc.tx.set(id, new Y.Text('\n'))
			doc.s.set('s1', newSectionMap({ story: 'sec' } as StoredSection))
			doc.f.set('h', frame({ story: 'head', chain: ['f'] }))
			doc.f.set('f', frame({}))
			doc.ms.set('M', newMasterMap({ name: 'M' } as StoredMaster))
			// A master item's story is referenced too (tx stories of entity maps are not orphans).
			doc.f.set('m', frame({ story: 'item' }, { ms: 'M' }))
		})
		let canWrite = false
		const n = registerNormalizer(yDoc, doc, () => canWrite)
		expect(doc.tx.has('orphan')).toBe(true)
		canWrite = true
		n.run()
		expect([...doc.tx.keys()].sort()).toEqual(['head', 'item', 'sec'])
		doc.tx.set('later', new Y.Text('\n'))
		n.run()
		expect(doc.tx.has('later')).toBe(true)
		n.dispose()
	})

	it('survives ill-typed chains and drops ill-typed box styling', () => {
		const doc = openPublication(new Y.Doc())
		const txt = (data: unknown) =>
			newFrameMap({
				t: 'txt',
				anchor: { sec: 's', page: 0 },
				x: 0,
				y: 0,
				w: 1,
				h: 1,
				rot: 0,
				z: 0,
				wrap: { mode: 'none', off: 0 },
				data
			} as unknown as StoredFrame)
		doc.f.set('a', txt({ story: 'x', chain: 'x' }))
		doc.f.set('b', txt({ story: 'y', chain: [1, null] }))
		doc.f.set('c', txt({ inset: Number.NaN, strokeW: -1, fill: 5, stroke: 'red' }))
		doc.f.set('d', txt({ inset: Number.POSITIVE_INFINITY }))
		const frames = framesToEngine(doc, (id) => ({ id, paragraphs: [] }))
		expect(frames.a.data).toEqual({ story: { id: 'x', paragraphs: [] } })
		expect(frames.b.data).toEqual({ story: { id: 'y', paragraphs: [] } })
		expect(frames.c.data).toEqual({ stroke: 'red' })
		expect(frames.d.data).toEqual({})
	})

	it('allow-lists box and mark colours', () => {
		for (const bad of ['url(x)', 'expression(alert(1))', 'red; x'])
			expect(sanitizeBox({ fill: bad, stroke: bad })).toEqual({})
		for (const ok of ['#abc', 'rgba(0,0,0,.5)', 'red']) {
			expect(sanitizeBox({ fill: ok, stroke: ok })).toEqual({ fill: ok, stroke: ok })
			expect(sanitizeMarks({ color: ok })).toEqual({ color: ok })
		}
		expect(sanitizeMarks({ color: 'url(x)' })).toEqual({})
	})

	it('keeps an explicit dropCap 0 (turns off a style drop cap)', () => {
		expect(sanitizeOverrides({ dropCap: 0 })).toEqual({ dropCap: 0 })
	})
})

describe('parseLength', () => {
	const close = (v: number | undefined, pt: number) => expect(v).toBeCloseTo(pt, 6)

	it('parses units and the default unit', () => {
		close(parseLength('10mm', 'pt'), (10 * 72) / 25.4)
		close(parseLength('1in', 'mm'), 72)
		close(parseLength('2"', 'mm'), 144)
		close(parseLength('12', 'pt'), 12)
		close(parseLength('1,5 cm', 'pt'), (1.5 * 72) / 2.54)
	})

	it('does arithmetic', () => {
		close(parseLength('1in+2pt', 'mm'), 74)
		close(parseLength('3×2', 'pt'), 6)
		close(parseLength('10pt − 4pt', 'pt'), 6)
		close(parseLength('-3pt', 'pt'), -3)
	})

	it('rejects junk and division by zero', () => {
		expect(parseLength('4÷0', 'pt')).toBeUndefined()
		expect(parseLength('abc', 'pt')).toBeUndefined()
		expect(parseLength('2*3mm', 'pt')).toBeUndefined()
		expect(parseLength('1+', 'pt')).toBeUndefined()
	})
})

describe('block ids', () => {
	let n = 0
	const gen = () => `n${++n}`

	it('fills missing and dedupes, keeping the first non-empty owner', () => {
		n = 0
		const fixes = computeBlockIdFixes(
			[
				{ insert: '\n', attributes: { bid: 'a' } },
				{ insert: 'x' },
				{ insert: '\n', attributes: { bid: 'a' } },
				{ insert: 'y\n' }
			],
			gen
		)
		// empty first 'a' loses to the non-empty one; the bare paragraph gets an id
		expect(fixes).toEqual([
			{ index: 0, bid: 'n1' },
			{ index: 4, bid: 'n2' }
		])
	})

	it('counts embeds as length 1 and is empty when all is well', () => {
		expect(
			computeBlockIdFixes([
				{ insert: { img: { fileId: 'f' } } },
				{ insert: '\n', attributes: { bid: 'a' } }
			])
		).toEqual([])
	})

	it('strips bid only', () => {
		expect(
			stripBlockIds([
				{ insert: '\n', attributes: { bid: 'a', ps: 'h1' } },
				{ insert: '\n', attributes: { bid: 'b' } }
			])
		).toEqual([{ insert: '\n', attributes: { ps: 'h1' } }, { insert: '\n' }])
	})
})

describe('snapping', () => {
	const m = {
		name: 'Body',
		w: 600,
		h: 800,
		margins: { t: 50, b: 50, in: 50, out: 50 },
		cols: 1,
		gutter: 10,
		regions: [area('a', 123, 77, 211, 333)]
	} as StoredMaster
	const doc = openPublication(new Y.Doc())
	doc.ms.set('m', newMasterMap(m))
	const page = { master: 'm', w: 600, h: 800 } as unknown as PageInfo

	it('snapTargets skips excluded text areas but keeps the margin box', () => {
		expect(snapTargets(doc, page, [], new Set()).xs).toContain(123)
		const t = snapTargets(doc, page, [], new Set(['a']))
		expect(t.xs).not.toContain(123)
		expect(t.ys).not.toContain(77)
		expect(t.xs).toContain(50)
	})

	it('snapAt picks the nearest target within the threshold', () => {
		expect(snapAt(10, [0, 12, 30], 4)).toBe(12)
		expect(snapAt(10, [0, 30], 4)).toBeUndefined()
	})
})

describe('hitFrame', () => {
	const box = {
		id: 'tb',
		kind: 'frame',
		x: 100,
		y: 100,
		w: 200,
		h: 100,
		rot: 0,
		z: 1,
		master: false,
		frame: { t: 'txt' }
	} as unknown as PageItem
	const o = { mod: false, alt: false, layout: false, edge: 6 }

	it('places the caret inside a text box but grabs it on its outline', () => {
		expect(hitFrame([box], 200, 150, o)).toEqual({ kind: 'text', id: 'tb' })
		expect(hitFrame([box], 103, 150, o)).toEqual({ kind: 'frame', id: 'tb' })
		expect(hitFrame([box], 96, 150, o)).toEqual({ kind: 'frame', id: 'tb' })
		expect(hitFrame([box], 90, 150, o)).toBeUndefined()
		expect(hitFrame([box], 103, 150, { ...o, edge: undefined })?.kind).toBe('text')
	})

	it('shrinks the grab band on a tiny text box, so its middle takes a caret', () => {
		const tiny = { ...box, w: 10, h: 10 } as PageItem
		const e = { ...o, edge: 12 }
		expect(hitFrame([tiny], 105, 105, e)).toEqual({ kind: 'text', id: 'tb' })
		expect(hitFrame([tiny], 101, 105, e)).toEqual({ kind: 'frame', id: 'tb' })
	})
})

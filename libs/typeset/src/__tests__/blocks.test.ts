// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from '@jest/globals'

import type { DLItem, PageDL, TagNode } from '../display-list.js'
import { ptToFx } from '../fixed.js'
import { FontRegistry } from '../fonts/registry.js'
import { layoutPublication } from '../layout/paginate.js'
import type { Paragraph, Publication, TableBlock } from '../model.js'
import {
	CORPUS,
	EN,
	field,
	floatImg,
	layoutCase,
	loadPublication,
	PUB_CORPUS,
	p,
	table
} from './corpus.js'

async function layout(pub: Publication) {
	return layoutPublication(pub, await loadPublication(pub, new FontRegistry()))
}

const pub = (name: string) => {
	const c = PUB_CORPUS.find((x) => x.name === name)
	if (!c) throw new Error(name)
	return c.pub
}

const glyphs = (pg: PageDL, tag?: number) =>
	pg.items
		.filter((it): it is Extract<DLItem, { k: 'glyphs' }> => it.k === 'glyphs')
		.filter((it) => tag === undefined || it.tag === tag)
		.map((it) => it.text)
		.join('')

const flat = (ts: TagNode[]): TagNode[] => ts.flatMap((t) => [t, ...flat(t.children ?? [])])

describe('footnotes', () => {
	it('continues a body that does not fit on the next page', async () => {
		const base = pub('footnotes')
		const body = { id: 'long', paragraphs: Array.from({ length: 30 }, () => p('body', EN)) }
		const r = await layout({
			...base,
			sections: [
				{
					id: 'sec',
					story: {
						id: 'st',
						paragraphs: [
							p('body', 'Ref', field({ fn: 'long' }), ` ${EN}`),
							...Array.from({ length: 4 }, () => p('body', EN))
						]
					},
					first: 'm-first',
					rest: 'm-first',
					start: 'any'
				}
			],
			footnotes: { long: body }
		})
		const on = r.pages.flatMap((pg, g) => (pg.lines.some((l) => l.story === 'long') ? [g] : []))
		expect(on.slice(0, 2)).toEqual([0, 1])
		for (const g of on) expect(r.pages[g].tags.some((t) => t.role === 'Note')).toBe(true)
	})

	it('counts a body that runs out of pages as overset', async () => {
		const base = pub('footnotes')
		const body = { id: 'long', paragraphs: Array.from({ length: 30 }, () => p('body', EN)) }
		const r = await layout({
			...base,
			sections: [
				{
					id: 'sec',
					story: { id: 'st', paragraphs: [p('body', 'Ref', field({ fn: 'long' }))] },
					first: 'm-first',
					rest: 'm-first',
					start: 'any',
					maxPages: 1
				}
			],
			footnotes: { long: body }
		})
		expect(r.overset).toEqual([{ sec: 'sec', chars: expect.any(Number) }])
		expect(r.overset[0].chars).toBeGreaterThan(0)
	})

	it('puts band notes between the band and the next column set', async () => {
		const band = {
			...p('body', 'Ref', field({ fn: 'n' }), ` ${EN}`),
			overrides: { spanColumns: true }
		}
		const rest = Array.from({ length: 6 }, () => p('body', EN))
		const r = await layout({
			...pub('advanced-text'),
			sections: [
				{
					id: 'sec',
					story: { id: 'st', paragraphs: [band, ...rest] },
					first: 'm-cols',
					rest: 'm-cols',
					start: 'any'
				}
			],
			footnotes: { n: { id: 'n', paragraphs: [p('body', EN)] } }
		})
		const ls = r.pages[0].lines
		const ys = (f: (l: (typeof ls)[number]) => boolean) => ls.filter(f).map((l) => l.y)
		const note = ys((l) => l.story === 'n')
		expect(note.length).toBeGreaterThan(0)
		expect(Math.min(...note)).toBeGreaterThan(Math.max(...ys((l) => l.bid === band.bid)))
		expect(Math.max(...note)).toBeLessThan(Math.min(...ys((l) => l.bid === rest[0].bid)))
	})
})

describe('tables', () => {
	const c = CORPUS.find((x) => x.name === 'en-table-paginated')
	if (!c) throw new Error('en-table-paginated')
	const tbl = c.story.paragraphs[1].runs as TableBlock
	const cellBid = (r: number, k: number) => tbl.rows[r].cells[k].paragraphs[0].bid

	it('repeats the header row on a continuation page', async () => {
		// Rows 1–8 are short; the header is not repeated above a row taller than the page.
		const pages = await layoutCase(c)
		const body = pages.flatMap((pg, g) =>
			pg.lines.some((l) =>
				tbl.rows.slice(1, 9).some((r) => r.cells[0].paragraphs[0].bid === l.bid)
			)
				? [g]
				: []
		)
		expect(body.length).toBeGreaterThan(1)
		// The header's own lines are on the first page only; later pages paint it as an Artifact.
		const head = pages.flatMap((pg, g) =>
			pg.lines.some((l) => l.bid === cellBid(0, 0)) ? [g] : []
		)
		expect(head).toEqual([body[0]])
		for (const g of body) expect(glyphs(pages[g])).toContain('ItemQtyNote')
	})

	it('a rowSpan cell keeps its column in the rows it spans', async () => {
		const pages = await layoutCase(c)
		const span = tbl.rows.findIndex((r) => r.cells[0].rowSpan === 2)
		const lines = pages.flatMap((pg) => pg.lines)
		const first = lines.find((l) => l.bid === cellBid(span, 0))
		const below = lines.find((l) => l.bid === cellBid(span + 1, 0))
		const next = lines.find((l) => l.bid === cellBid(span + 1, 1))
		if (!first || !below || !next) throw new Error('cell lines missing')
		// Row span+1's first cell sits in the second column, its second in the third.
		expect(below.y).toBeGreaterThan(first.y)
		expect(below.x).toBeGreaterThan(first.x)
		expect(next.x).toBeGreaterThan(below.x)
	})

	it('sanitizes NaN and infinite spans', async () => {
		const base = pub('advanced-text')
		const t = table([
			[
				{ paragraphs: [p('left', 'Wide')], colSpan: Number.POSITIVE_INFINITY },
				{ paragraphs: [p('left', 'Odd')], colSpan: Number.NaN, rowSpan: Number.NaN }
			]
		])
		const cells = (t.runs as TableBlock).rows[0].cells
		const r = await layout({
			...base,
			sections: [{ ...base.sections[0], story: { id: 'st', paragraphs: [t] } }]
		})
		const lines = r.pages.flatMap((pg) => pg.lines)
		for (const c of cells) expect(lines.some((l) => l.bid === c.paragraphs[0].bid)).toBe(true)
	})
})

describe('TOC', () => {
	it('gives every entry its page number', async () => {
		const r = await layout(pub('advanced-text'))
		let entries = 0
		for (const pg of r.pages)
			for (const t of flat(pg.tags).filter((x) => x.role === 'TOCI')) {
				entries++
				// The number is a glyph item of its own, last on the entry.
				const nums = pg.items.filter((it) => it.k === 'glyphs' && it.tag === t.id)
				const last = nums[nums.length - 1]
				expect(last?.k === 'glyphs' && last.text).toMatch(/^([0-9]+|[ivxlc]+)$/)
			}
		expect(entries).toBeGreaterThan(2)
	})
})

describe('floats', () => {
	it('keeps body text out of a float', async () => {
		const pb = pub('advanced-text')
		const paras = pb.sections[0].story.paragraphs
		const fi = paras.findIndex(
			(x: Paragraph) =>
				!Array.isArray(x.runs) && x.runs.k === 'emb' && x.runs.float?.side === 'l'
		)
		const after = paras[fi + 1].bid
		const r = await layout(pb)
		const pg = r.pages.find((x) => x.lines.some((l) => l.bid === after))
		const img = pg?.items.find((it) => it.k === 'image')
		if (!pg || img?.k !== 'image') throw new Error('float not placed')
		const beside = pg.lines.filter(
			(l) =>
				l.bid === after &&
				l.y > img.box.y &&
				l.y - l.ascent < img.box.y + img.box.h &&
				l.x < img.box.x + img.box.w + img.box.w
		)
		expect(beside.length).toBeGreaterThan(0)
		for (const l of beside) expect(l.x).toBeGreaterThanOrEqual(img.box.x + img.box.w)
	})

	it('does not overlap consecutive floats', async () => {
		const base = pub('advanced-text')
		const r = await layout({
			...base,
			sections: [
				{
					...base.sections[0],
					story: {
						id: 'st',
						paragraphs: [floatImg('l', 0.5), floatImg('l', 0.5), p('body', EN)]
					}
				}
			]
		})
		const boxes = r.pages[0].items.flatMap((it) => (it.k === 'image' ? [it.box] : []))
		expect(boxes).toHaveLength(2)
		const [a, b] = boxes
		const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
		expect(apart).toBe(true)
	})
})

// vim: ts=4

describe('embed alt', () => {
	it('puts an embed record alt on its Figure tag, page frame and inline', async () => {
		const base = pub('advanced-text')
		const sec = base.sections[0]
		const emb: Paragraph = {
			...p('left', ''),
			runs: { k: 'emb', data: { alt: 'Inline chart' }, w: ptToFx(160), h: ptToFx(100) }
		}
		const r = await layout({
			...base,
			sections: [{ ...sec, story: { id: 'st', paragraphs: [emb, p('body', EN)] } }],
			frames: {
				e1: {
					id: 'e1',
					t: 'emb',
					anchor: { sec: sec.id, page: 0 },
					x: ptToFx(10),
					y: ptToFx(10),
					w: ptToFx(100),
					h: ptToFx(80),
					rot: 0,
					z: 0,
					wrap: { mode: 'none', off: 0 },
					data: { alt: 'Page map' }
				}
			}
		})
		const figs = flat(r.pages[0].tags).filter((t) => t.role === 'Figure')
		expect(figs.map((t) => t.alt).sort()).toEqual(['Inline chart', 'Page map'])
	})
})

describe('drop caps', () => {
	it('keeps the cap exclusion out of the next column', async () => {
		const base = pub('advanced-text')
		let checked = false
		// Fillers push the cap paragraph down until it breaks after line 1 or 2 into column 2.
		for (let n = 10; n < 60 && !checked; n++) {
			const r = await layout({
				...base,
				sections: [
					{
						id: 'dc',
						story: {
							id: 'dc',
							paragraphs: [
								...Array.from({ length: n }, () => p('left', 'x')),
								{
									...p('body', EN),
									bid: 'cap',
									overrides: { dropCap: 3, orphans: 1 }
								}
							]
						},
						first: 'm-cols',
						rest: 'm-cols',
						start: 'any'
					}
				],
				frames: {}
			})
			const ls = r.pages[0].lines.filter((l) => l.bid === 'cap')
			const x2 = Math.max(...ls.map((l) => l.x))
			const head = ls.filter((l) => l.x < x2 - ptToFx(100))
			if (head.length < 1 || head.length > 2) continue
			const col2 = ls.filter((l) => l.x >= x2 - ptToFx(100))
			expect(col2.length).toBeGreaterThan(2)
			for (const l of col2) expect(l.x).toBe(col2[col2.length - 1].x)
			checked = true
		}
		expect(checked).toBe(true)
	})
})

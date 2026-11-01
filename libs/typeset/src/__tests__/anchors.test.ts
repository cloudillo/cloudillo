// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Text-anchored frames (`Frame.anchor.txt`): "Moves with text" (`rel: 'text'`) and "On the
// anchor's page" (`rel: 'page'`), read back through `PageDL.anchored` and the line geometry.

import { describe, expect, it } from '@jest/globals'

import type { LineGeom, PageDL } from '../display-list.js'
import { ptToFx } from '../fixed.js'
import { FontRegistry } from '../fonts/registry.js'
import { layoutPublication } from '../layout/paginate.js'
import type { Frame, Paragraph, Publication } from '../model.js'
import { anchoredImg, EN, field, loadPublication, marker, PUB_CORPUS, p } from './corpus.js'

const pt = ptToFx

async function layout(pub: Publication) {
	return layoutPublication(pub, await loadPublication(pub, new FontRegistry()))
}

const base = PUB_CORPUS.find((c) => c.name === 'advanced-text')?.pub as Publication

/** One section of story `st` on master `m` ('m-first': one column, 'm-cols': two). */
const pubOf = (
	paragraphs: Paragraph[],
	frames: Frame[],
	m = 'm-first',
	extra: Partial<Publication> = {}
): Publication => ({
	...base,
	sections: [{ id: 'a', story: { id: 'st', paragraphs }, first: m, rest: m, start: 'any' }],
	frames: Object.fromEntries(frames.map((f) => [f.id, f])),
	...extra
})

/** An "On the anchor's page" image frame on story `st` (box in pt, `tb` wrap). */
const pageImg = (id: string, x: number, y: number, w: number, h: number, rot = 0): Frame =>
	anchoredImg(id, 'st', 'l', undefined, {
		anchor: { txt: 'st', rel: 'page' },
		x: pt(x),
		y: pt(y),
		w: pt(w),
		h: pt(h),
		rot,
		wrap: { mode: 'tb', off: 0 }
	})

/** The page frame `id` was placed on, and its box. */
function placed(pages: PageDL[], id: string) {
	for (const pg of pages) {
		const a = pg.anchored?.find((x) => x.id === id)
		if (a) return { pg, a }
	}
	throw new Error(`${id} not placed`)
}

const top = (l: LineGeom) => l.y - l.ascent
const bottom = (l: LineGeom) => l.y + l.descent
/** Lines of `pg` overlapping the band [y, y + h) vertically. */
const across = (pg: PageDL, b: { y: number; h: number }) =>
	pg.lines.filter((l) => top(l) < b.y + b.h && bottom(l) > b.y)

describe('moves with text', () => {
	it('places the frame at its paragraph and wraps only the text after it', async () => {
		const paras = [p('body', EN), marker('a', EN), p('body', EN)]
		const r = await layout(pubOf(paras, [anchoredImg('a', 'st', 'l', 0.5)]))
		const { pg, a } = placed(r.pages, 'a')
		const before = pg.lines.filter((l) => l.bid === paras[0].bid)
		expect(before.length).toBeGreaterThan(0)
		for (const l of before) expect(bottom(l)).toBeLessThanOrEqual(a.y)
		const beside = across(pg, a)
		expect(beside.length).toBeGreaterThan(0)
		for (const l of beside) {
			expect(l.bid).not.toBe(paras[0].bid)
			expect(l.x).toBeGreaterThanOrEqual(a.x + a.w)
		}
	})

	it('places a NaN rot as 0', async () => {
		const r = await layout(
			pubOf([marker('a', EN)], [anchoredImg('a', 'st', 'l', 0.5, { rot: Number.NaN })])
		)
		expect(placed(r.pages, 'a').a.rot).toBe(0)
	})

	it('places a mid-paragraph marker below its line', async () => {
		const cut = EN.indexOf(' ', 40)
		const para = p('body', EN.slice(0, cut), field({ frame: 'a' }), `${EN.slice(cut)} ${EN}`)
		const r = await layout(pubOf([para], [anchoredImg('a', 'st', 'r', 0.5)]))
		const { pg, a } = placed(r.pages, 'a')
		const at = pg.lines.find((l) => l.bid === para.bid && l.from <= cut && cut < l.to)
		if (!at) throw new Error('marker line not found')
		expect(a.y).toBeGreaterThan(at.y)
		// The marker's row and the rows above it are not wrapped: one line each.
		expect(pg.lines.filter((l) => l.row <= at.row)).toHaveLength(at.row + 1)
		const beside = across(pg, a)
		expect(beside.length).toBeGreaterThan(0)
		for (const l of beside) expect(l.carets.at(-1) ?? l.x).toBeLessThanOrEqual(a.x)
	})

	it('moves the frame and the text after it to the next column', async () => {
		const paras = [
			...Array.from({ length: 15 }, (_, i) => p('left', `Short line ${i}.`)),
			marker('a', 'After.')
		]
		const tall = anchoredImg('a', 'st', 'l', undefined, { h: pt(400) })
		const r = await layout(pubOf(paras, [tall], 'm-cols'))
		const { pg, a } = placed(r.pages, 'a')
		const first = r.pages[0].lines.find((l) => l.bid === paras[0].bid)
		if (!first) throw new Error('first line not found')
		expect(pg).toBe(r.pages[0])
		expect(a.x).toBeGreaterThan(first.x + pt(100))
		const after = pg.lines.filter((l) => l.bid === paras[15].bid)
		expect(after.length).toBeGreaterThan(0)
		for (const l of after) expect(l.x).toBeGreaterThanOrEqual(a.x)
	})

	it('keeps consecutive frames apart', async () => {
		const paras = [marker('a'), marker('b'), p('body', EN)]
		const fs = [anchoredImg('a', 'st', 'l', 0.5), anchoredImg('b', 'st', 'l', 0.5)]
		const r = await layout(pubOf(paras, fs))
		const [x, y] = [placed(r.pages, 'a').a, placed(r.pages, 'b').a]
		const apart = x.x + x.w <= y.x || y.x + y.w <= x.x || x.y + x.h <= y.y || y.y + y.h <= x.y
		expect(apart).toBe(true)
	})

	it('places a frame whose marker is in a TOC paragraph', async () => {
		const paras = [
			p('h1', 'Heading'),
			p('left', field({ toc: { levels: 2 } }), field({ frame: 'a' })),
			p('body', EN)
		]
		const r = await layout(pubOf(paras, [anchoredImg('a', 'st', 'l', 0.5)]))
		expect(placed(r.pages, 'a').a.w).toBeGreaterThan(0)
	})

	it('pins a page frame whose marker is in a TOC paragraph', async () => {
		const paras = [p('left', field({ toc: { levels: 2 } }), field({ frame: 'a' }))]
		const r = await layout(pubOf(paras, [pageImg('a', 50, 450, 200, 80)]))
		expect(placed(r.pages, 'a').a).toMatchObject({ x: pt(50), y: pt(450) })
	})

	it('keeps a frame no taller than its column', async () => {
		const tall = anchoredImg('a', 'st', 'l', undefined, { w: 1, h: 1e9 })
		const r = await layout(pubOf([marker('a', 'Text.')], [tall]))
		const { pg, a } = placed(r.pages, 'a')
		expect(a.h).toBeGreaterThan(0)
		expect(a.y + a.h).toBeLessThanOrEqual(pg.page.h)
	})

	it('never breaks a word at its marker', async () => {
		const reps = Array.from({ length: 40 }, () => ['abc', field({ frame: '' }), 'def ']).flat()
		const para = p('left', ...reps)
		const r = await layout(pubOf([para], []))
		const ends = r.pages.flatMap((pg) => pg.lines.filter((l) => l.bid === para.bid))
		expect(ends.length).toBeGreaterThan(1)
		// Each repetition is 8 characters, its marker at offset 3.
		for (const l of ends) expect([3, 4]).not.toContain(l.to % 8)
	})

	it('draws nothing for a frame without a marker, or an ignored one', async () => {
		const paras = [p('left', field({ frame: '' }), 'Text.')]
		const r = await layout(pubOf(paras, [anchoredImg('a', 'st', 'l', 0.5)]))
		expect(r.pages.flatMap((pg) => pg.anchored ?? [])).toEqual([])
	})
})

describe("on the anchor's page", () => {
	it('places the frame at page coordinates ahead of the flow', async () => {
		const paras = [marker('a', 'Start.'), ...Array.from({ length: 4 }, () => p('body', EN))]
		const r = await layout(pubOf(paras, [pageImg('a', 50, 450, 200, 80)]))
		const { pg, a } = placed(r.pages, 'a')
		expect(pg.page.index).toBe(0)
		expect(a).toMatchObject({ x: pt(50), y: pt(450), w: pt(200), h: pt(80) })
		expect(across(pg, a)).toEqual([])
	})

	it('refills the page once when the frame covers text already placed', async () => {
		const paras = [p('body', EN), marker('a'), p('body', EN)]
		const r = await layout(pubOf(paras, [pageImg('a', 0, 40, 420, 100)]))
		const { pg, a } = placed(r.pages, 'a')
		expect(pg.page.index).toBe(0)
		expect(a.y).toBe(pt(40))
		expect(across(pg, a)).toEqual([])
		const first = pg.lines.find((l) => l.bid === paras[0].bid)
		expect(first && top(first)).toBeGreaterThanOrEqual(a.y + a.h)
	})

	it('defers the frame to the next page, without a hole, when the refill pushes its marker off', async () => {
		const paras = Array.from({ length: 40 }, (_, i) =>
			i === 20 ? marker('a', `Line ${i}`) : p('left', `Line ${i}`)
		)
		const r = await layout(pubOf(paras, [pageImg('a', 0, 0, 420, 400)]))
		const marked = r.pages.find((pg) => pg.lines.some((l) => l.bid === paras[20].bid))
		const { pg, a } = placed(r.pages, 'a')
		expect(marked?.page.index).toBe(0)
		expect(pg.page.index).toBe(1)
		expect(a.y).toBe(0)
		expect(a.late).toBe(true)
		expect(r.pages[0].anchored ?? []).toEqual([])
		const plain = await layout(pubOf(paras, []))
		expect(r.pages[0].lines.length).toBe(plain.pages[0].lines.length)
	})

	it('keeps the frame on its page when the text would end before the deferred one', async () => {
		const paras = Array.from({ length: 21 }, (_, i) =>
			i === 20 ? marker('a', `Line ${i}`) : p('left', `Line ${i}`)
		)
		const r = await layout(pubOf(paras, [pageImg('a', 0, 0, 420, 400)]))
		const { pg, a } = placed(r.pages, 'a')
		expect(pg.page.index).toBe(0)
		expect(a.late).toBe(true)
		const marked = r.pages.find((q) => q.lines.some((l) => l.bid === paras[20].bid))
		expect(marked?.page.index).toBe(1)
		expect(r.pages).toHaveLength(2)
	})

	it("keeps the frame on the marker's page when that page starts mid-paragraph", async () => {
		// Paragraph 8 straddles pages 0-1; the frame pushes the marker (14) to page 2, the refill
		// without it ends on page 1, and the frame goes back to page 1 (not where 8 started).
		const paras = [
			...Array.from({ length: 12 }, () => p('left', EN)),
			p('left', 'Short 12'),
			p('left', 'Short 13'),
			marker('a', 'Marker')
		]
		const r = await layout(pubOf(paras, [pageImg('a', 0, 0, 420, 300)]))
		const { pg, a } = placed(r.pages, 'a')
		expect(pg.page.index).toBe(1)
		expect(a.late).toBe(true)
		expect(r.pages[0].anchored ?? []).toHaveLength(0)
	})

	it('places a NaN rot as 0', async () => {
		const r = await layout(
			pubOf([marker('a', 'One.')], [pageImg('a', 50, 50, 100, 80, Number.NaN)])
		)
		expect(placed(r.pages, 'a').a.rot).toBe(0)
	})

	it('mirrors the frame on a left-hand page of a facing publication', async () => {
		const paras = [
			marker('a', 'One.'),
			{ ...marker('b', 'Two.'), overrides: { breakBefore: 'page' as const } }
		]
		const fs = [pageImg('a', 50, 100, 100, 60, 10), pageImg('b', 50, 100, 100, 60, 10)]
		const r = await layout(pubOf(paras, fs, 'm-first', { facing: true }))
		const both = [placed(r.pages, 'a'), placed(r.pages, 'b')]
		expect(both.map(({ pg }) => pg.page.side)).toContain('l')
		for (const { pg, a } of both) {
			const left = pg.page.side === 'l'
			expect(a.x).toBe(left ? pg.page.w - pt(50) - pt(100) : pt(50))
			expect(a.rot).toBe(left ? -10 : 10)
		}
	})
})

// vim: ts=4

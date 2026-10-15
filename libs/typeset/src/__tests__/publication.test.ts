// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { beforeAll, describe, expect, it } from '@jest/globals'

import type { DLItem, PageDL } from '../display-list.js'
import { ptToFx } from '../fixed.js'
import { FontRegistry } from '../fonts/registry.js'
import { layoutPublication, marginRegion } from '../layout/paginate.js'
import type { Frame, Publication, Story, TextFrameData } from '../model.js'
import { renderPageSvg } from '../svg/render.js'
import { type ItemizeEnv, paragraphText } from '../text/itemize.js'
import { dlJson, EN, HU, loadPublication, PUB_CORPUS, p, sha256 } from './corpus.js'

async function layout(pub: Publication, registry = new FontRegistry()) {
	return layoutPublication(pub, await loadPublication(pub, registry))
}

const glyphText = (items: DLItem[]) =>
	items
		.map((it) => (it.k === 'glyphs' ? it.text : ''))
		.join('')
		.replace(/\s/g, '')

/** Global page indices holding lines of `bid` in story `story`. */
const pagesOf = (pages: PageDL[], story: string, bid: string) =>
	pages.flatMap((pg, g) => (pg.lines.some((l) => l.story === story && l.bid === bid) ? [g] : []))

describe.each(PUB_CORPUS.map((c) => [c.name, c.pub] as const))('publication %s', (_name, pub) => {
	it('lays out identically twice', async () => {
		const a = await layout(pub, new FontRegistry())
		const b = await layout(pub, new FontRegistry())
		expect(sha256(dlJson(b.pages))).toBe(sha256(dlJson(a.pages)))
		expect(b.overset).toEqual(a.overset)
	})
})

// The BOOK-specific asserts below need its sections, frames and titles.
const BOOKS = PUB_CORPUS.filter((c) => c.name.startsWith('book-'))

describe.each(BOOKS.map((c) => [c.name, c.pub] as const))('publication %s', (_name, pub) => {
	it('honours start parity, page sides and frame keepalive', async () => {
		const r = await layout(pub)
		const s2 = r.pages.findIndex((pg) => pg.page.sec === 's2')
		expect(s2 % 2).toBe(0) // global page number s2 + 1 is odd
		r.pages.forEach((pg, g) => {
			expect(pg.page.side).toBe(pub.facing ? (g % 2 ? 'l' : 'r') : undefined)
		})
		const s1 = r.sections.find((s) => s.id === 's1')
		expect(s1?.pages).toBeGreaterThanOrEqual(4) // `f-note` is anchored to page 3
		const note = r.pages.find((pg) => pg.page.sec === 's1' && pg.page.index === 3)
		expect(note?.lines.some((l) => l.story === 'tx-note')).toBe(true)
		expect(r.sections.find((s) => s.id === 's2')?.pages).toBeLessThanOrEqual(2)
		expect(r.overset.some((o) => o.sec === 's2' && !o.frame && o.chars > 0)).toBe(true)
	})

	it('paints master items as one Artifact per page with resolved fields', async () => {
		const r = await layout(pub)
		const total = r.pages.length
		let s2n = 0
		r.pages.forEach((pg, g) => {
			const art = pg.tags.filter((t) => t.role === 'Artifact')
			expect(art).toHaveLength(1)
			const items = pg.items.filter((it) => 'tag' in it && it.tag === art[0].id)
			expect(items.some((it) => it.k === 'rect')).toBe(pg.page.master === 'm-first')
			const n = pg.page.sec === 's2' ? ['i', 'ii'][s2n++] : String(g + 1)
			const title = pg.page.sec === 's2' ? 'Secondsection' : 'Mastersandcolumns'
			expect(glyphText(items)).toBe(`Page${n}/${total}${title}`)
		})
	})

	it('flows two columns on the columned master', async () => {
		const r = await layout(pub)
		const both = r.pages.some((pg) => {
			if (pg.page.master !== 'm-cols') return false
			const xs = pg.lines.filter((l) => l.story === 's1' || l.story === 's2').map((l) => l.x)
			return xs.some((x) => x < pg.page.w / 2) && xs.some((x) => x >= pg.page.w / 2)
		})
		expect(both).toBe(true)
	})

	it('keeps headings with the next paragraph and honours widows/orphans', async () => {
		const r = await layout(pub)
		const paras = pub.sections[0].story.paragraphs
		paras.forEach((para, i) => {
			const on = pagesOf(r.pages, 's1', para.bid)
			if (para.style === 'kh') {
				expect(pagesOf(r.pages, 's1', paras[i + 1].bid)[0]).toBe(on[on.length - 1])
			}
			if (para.overrides.keepTogether) expect(on).toHaveLength(1)
			if (on.length < 2) return
			const count = (g: number) =>
				r.pages[g].lines.filter((l) => l.story === 's1' && l.bid === para.bid).length
			expect(count(on[0])).toBeGreaterThanOrEqual(para.overrides.orphans ?? 2)
			expect(count(on[on.length - 1])).toBeGreaterThanOrEqual(para.overrides.widows ?? 2)
		})
	})

	it('wraps body text around the image frame', async () => {
		const r = await layout(pub)
		const f = pub.frames['f-img']
		const o = f.wrap.off
		const [x0, x1, y0, y1] = [f.x - o, f.x + f.w + o, f.y - o, f.y + f.h + o]
		const pg = r.pages.find((q) => q.page.sec === 's1' && q.page.index === 0)
		const beside = (pg?.lines ?? []).filter(
			(l) => l.story === 's1' && l.y - l.ascent < y1 && l.y + l.descent > y0
		)
		expect(beside.length).toBeGreaterThan(0)
		// Line offsets are within the line's own paragraph (`LineGeom.from/to`).
		const paragraphs = pub.sections[0].story.paragraphs
		for (const l of beside) {
			const p = paragraphs.find((q) => q.bid === l.bid)
			const text = p ? paragraphText(p) : ''
			// The trailing space hangs past the line's measure, so measure up to its last ink.
			let to = l.to
			while (to > l.from && /\s/.test(text[to - 1])) to--
			const left = l.carets[0]
			const right = l.carets[to - l.from]
			expect(left >= x1 || right <= x0).toBe(true)
		}
		expect(pg?.items.some((it) => it.k === 'image' && it.fileId === 'file-1')).toBe(true)
	})

	it('wraps body text around the ellipse shape, not its box', async () => {
		const r = await layout(pub)
		const f = pub.frames['f-dot']
		const R = f.w / 2 + f.wrap.off
		const cx = f.x + Math.floor(f.w / 2)
		const cy = f.y + Math.floor(f.h / 2)
		const pg = r.pages.find((q) => q.page.sec === 's2' && q.page.index === 0)
		const beside = (pg?.lines ?? []).filter(
			(l) => l.story === 's2' && l.y - l.ascent < cy + R && l.y + l.descent > cy - R
		)
		expect(beside.length).toBeGreaterThan(0)
		const paragraphs = pub.sections.find((s) => s.id === 's2')?.story.paragraphs ?? []
		let inBox = 0
		for (const l of beside) {
			const p = paragraphs.find((q) => q.bid === l.bid)
			const text = p ? paragraphText(p) : ''
			let to = l.to
			while (to > l.from && /\s/.test(text[to - 1])) to--
			const left = l.carets[0]
			const right = l.carets[to - l.from]
			// Half-chord of the circle across the line's band.
			const top = l.y - l.ascent
			const bottom = l.y + l.descent
			const d =
				top <= cy && bottom >= cy ? 0 : Math.min(Math.abs(top - cy), Math.abs(bottom - cy))
			const half = Math.sqrt(R * R - d * d)
			expect(left >= cx + half || right <= cx - half).toBe(true)
			if (left < cx + R && right > cx - R) inBox++
		}
		// Some line uses room the old box wrap blocked.
		expect(inBox).toBeGreaterThan(0)
	})

	it('renders the rotated shape frame rotated', async () => {
		const r = await layout(pub)
		const pg = r.pages.find((q) => q.page.sec === 's2' && q.page.index === 0)
		expect(pg && renderPageSvg(pg, { glyphHref: () => '#g' })).toContain(
			'<g transform="rotate(15 '
		)
	})

	it('numbers list items per level and hangs markers 18 pt left', async () => {
		const r = await layout(pub)
		const paras = pub.sections[0].story.paragraphs
		const marks: string[] = []
		for (const para of paras) {
			if (!['ol', 'ol2', 'ul'].includes(para.style)) continue
			const g = pagesOf(r.pages, 's1', para.bid)[0]
			const pg = r.pages[g]
			const l = pg.lines.find((q) => q.story === 's1' && q.bid === para.bid)
			const m = pg.items.find(
				(it) => it.k === 'glyphs' && l && it.x === l.x - ptToFx(18) && it.y === l.y
			)
			marks.push(m?.k === 'glyphs' ? m.text : '')
		}
		expect(marks).toEqual(['1.', '2.', 'a)', 'b)', '3.', '•'])
	})
})

describe('publication without masters', () => {
	it('lays out zero pages instead of throwing', () => {
		const pub = PUB_CORPUS[0].pub
		const sec = pub.sections[0]
		expect(layoutPublication({ ...pub, masters: {}, sections: [sec] }, {} as never)).toEqual({
			pages: [],
			sections: [{ id: sec.id, pages: 0 }],
			overset: []
		})
	})
})

describe('text chains', () => {
	const base = PUB_CORPUS[1].pub
	const STORY: Story = {
		id: 'tx-chain',
		paragraphs: Array.from({ length: 8 }, (_, i) => p('left', i % 2 ? HU : EN))
	}
	const txt = (id: string, sec: string, page: number, y: number, data: TextFrameData): Frame => ({
		id,
		t: 'txt',
		anchor: { sec, page },
		x: ptToFx(48),
		y: ptToFx(y),
		w: ptToFx(324),
		h: ptToFx(60),
		rot: 0,
		z: 0,
		wrap: { mode: 'none', off: 0 },
		data
	})
	/** c1 (head) → c2 → c3 at `at` = [sec, page] each, y 100/200/300 pt; `chain` overrides. */
	const chained = (at: [string, number][], chain = ['c2', 'c3']) => {
		const pub = structuredClone(base)
		pub.frames.c1 = txt('c1', ...at[0], 100, { story: structuredClone(STORY), chain })
		pub.frames.c2 = txt('c2', ...at[1], 200, {})
		pub.frames.c3 = txt('c3', ...at[2], 300, {})
		return pub
	}
	let env: ItemizeEnv
	beforeAll(async () => {
		// The base publication has no followers; the chain's story only adds paragraphs.
		env = await loadPublication(base, new FontRegistry(), STORY.paragraphs)
	})
	const page = (pages: PageDL[], sec: string, index: number) =>
		pages.find((pg) => pg.page.sec === sec && pg.page.index === index)
	/** The chain's lines inside frame `f` (baselines within its box). */
	const linesIn = (pages: PageDL[], f: Frame) =>
		(page(pages, f.anchor.sec, f.anchor.page)?.lines ?? []).filter(
			(l) => l.story === 'tx-chain' && l.y >= f.y && l.y <= f.y + f.h
		)
	const order = (pub: Publication, pages: PageDL[], ids: string[]) =>
		ids.flatMap((id) =>
			linesIn(pages, pub.frames[id]).map(
				(l) => STORY.paragraphs.findIndex((q) => q.bid === l.bid) * 1e6 + l.from
			)
		)
	const chainOverset = (r: { overset: { frame?: string; chars: number }[] }) =>
		r.overset.filter((o) => o.frame && ['c1', 'c2', 'c3'].includes(o.frame))

	it('splits a story across three boxes on one page, in order', () => {
		const pub = chained([
			['s1', 1],
			['s1', 1],
			['s1', 1]
		])
		const r = layoutPublication(pub, env)
		for (const id of ['c1', 'c2', 'c3'])
			expect(linesIn(r.pages, pub.frames[id]).length).toBeGreaterThan(0)
		const seq = order(pub, r.pages, ['c1', 'c2', 'c3'])
		expect(seq).toEqual([...seq].sort((a, b) => a - b))
		expect(new Set(seq).size).toBe(seq.length)
	})

	it('drops invalid chain entries: self, a follower with a story, a doubly claimed one', () => {
		const pub = chained(
			[
				['s1', 1],
				['s1', 1],
				['s1', 1]
			],
			['c1', 'c2', 'own', 'c3']
		)
		const OWN: Story = { id: 'tx-own', paragraphs: [STORY.paragraphs[0]] }
		pub.frames.own = txt('own', 's1', 1, 400, { story: OWN })
		pub.frames.c9 = txt('c9', 's1', 1, 500, { story: { ...OWN, id: 'tx-c9' }, chain: ['c2'] })
		const r = layoutPublication(pub, env)
		const all = r.pages.flatMap((pg) => pg.lines)
		const key = (l: { story: string; bid: string; from: number }) =>
			`${l.story}|${l.bid}|${l.from}`
		expect(new Set(all.map(key)).size).toBe(all.length)
		for (const id of ['c1', 'c2', 'c3'])
			expect(linesIn(r.pages, pub.frames[id]).length).toBeGreaterThan(0)
		expect(linesIn(r.pages, pub.frames.own)).toEqual([])
		const seq = order(pub, r.pages, ['c1', 'c2', 'c3'])
		expect(seq).toEqual([...seq].sort((a, b) => a - b))
		// c9 keeps its own story in its own box; c2 stays c1's.
		expect(all.filter((l) => l.story === 'tx-c9').every((l) => l.y >= pub.frames.c9.y)).toBe(
			true
		)
	})

	it('flows a chain across two pages', () => {
		const pub = chained([
			['s1', 1],
			['s1', 2],
			['s1', 2]
		])
		const r = layoutPublication(pub, env)
		const seq = order(pub, r.pages, ['c1', 'c2', 'c3'])
		expect(linesIn(r.pages, pub.frames.c1).length).toBeGreaterThan(0)
		expect(linesIn(r.pages, pub.frames.c2).length).toBeGreaterThan(0)
		expect(seq).toEqual([...seq].sort((a, b) => a - b))
	})

	it("gives a follower in another section tag ids from its own page's id space", () => {
		// The head's range in s1 overlaps s2's paragraph ids on s2's third page.
		const pub = chained(
			[
				['s1', 1],
				['s2', 2],
				['s2', 2]
			],
			['c2']
		)
		delete pub.sections[1].maxPages
		const r = layoutPublication(pub, env)
		const pg = page(r.pages, 's2', 2)
		expect(linesIn(r.pages, pub.frames.c2).length).toBeGreaterThan(0)
		const ids = (pg?.tags ?? []).map((t) => t.id)
		expect(new Set(ids).size).toBe(ids.length)
		for (const it of pg?.items ?? [])
			if ('tag' in it && it.tag !== undefined) expect(ids).toContain(it.tag)
	})

	it('reports the overset once, on the last frame', () => {
		const pub = chained([
			['s1', 1],
			['s1', 1],
			['s1', 2]
		])
		const r = layoutPublication(pub, env)
		const o = chainOverset(r)
		expect(o).toHaveLength(1)
		expect(o[0].frame).toBe('c3')
		expect(o[0].chars).toBeGreaterThan(0)
		// A follower on a page that does not exist (s2 has maxPages 2) is skipped as a slot.
		const gone = chained([
			['s1', 1],
			['s1', 1],
			['s2', 5]
		])
		const g = chainOverset(layoutPublication(gone, env))
		expect(g.map((x) => x.frame)).toEqual(['c2'])
		expect(g[0].chars).toBeGreaterThan(o[0].chars)
	})

	it('lays out a story-less follower outside any chain as nothing', () => {
		const pub = chained(
			[
				['s1', 1],
				['s1', 1],
				['s1', 1]
			],
			[]
		)
		const r = layoutPublication(pub, env)
		expect(linesIn(r.pages, pub.frames.c2)).toHaveLength(0)
		expect(chainOverset(r).map((x) => x.frame)).toEqual(['c1'])
		// A head anchored past its section's last page with no frame laid out: all overset.
		const lost = chained([
			['s2', 5],
			['s2', 6],
			['s2', 7]
		])
		const l = chainOverset(layoutPublication(lost, env))
		expect(l.map((x) => x.frame)).toEqual(['c1'])
	})

	it('reflows when a follower leaves the chain', () => {
		const at: [string, number][] = [
			['s1', 1],
			['s1', 1],
			['s1', 1]
		]
		const pub3 = chained(at)
		const pub2 = chained(at, ['c2'])
		const r3 = layoutPublication(pub3, env)
		const r2 = layoutPublication(pub2, env)
		expect(linesIn(r2.pages, pub2.frames.c3)).toHaveLength(0)
		expect(order(pub2, r2.pages, ['c1', 'c2'])).toEqual(order(pub3, r3.pages, ['c1', 'c2']))
		const [o2] = chainOverset(r2)
		const [o3] = chainOverset(r3)
		expect(o2.frame).toBe('c2')
		expect(o2.chars).toBeGreaterThan(o3.chars)
	})

	it('insets, paints and rotates a text box', () => {
		const at: [string, number][] = [
			['s1', 1],
			['s1', 1],
			['s1', 1]
		]
		const plain = chained(at, [])
		const boxed = chained(at, [])
		const inset = ptToFx(10)
		const strokeW = ptToFx(2)
		const c1 = boxed.frames.c1
		Object.assign(c1, { rot: 30 })
		Object.assign(c1.data, { inset, fill: '#eee', stroke: '#000', strokeW })
		const lines = (pub: Publication) =>
			(page(layoutPublication(pub, env).pages, 's1', 1)?.lines ?? []).filter(
				(l) => l.story === 'tx-chain'
			)
		const [p0] = lines(plain)
		const [b0] = lines(boxed)
		expect(b0.x - p0.x).toBe(inset)
		expect(b0.y - p0.y).toBe(inset)
		expect(b0.rot).toEqual({
			deg: 30,
			cx: c1.x + Math.floor(c1.w / 2),
			cy: c1.y + Math.floor(c1.h / 2)
		})
		expect(p0.rot).toBeUndefined()
		const rect = page(layoutPublication(boxed, env).pages, 's1', 1)?.items.find(
			(it) => it.k === 'rect' && it.fill === '#eee'
		)
		expect(rect).toMatchObject({
			box: { x: c1.x + strokeW / 2, y: c1.y + strokeW / 2, w: c1.w - strokeW },
			stroke: '#000',
			rot: { deg: 30 }
		})
	})
})

describe('marginRegion', () => {
	it('puts in on the right page and out on the left, same width', () => {
		const m = { w: 600, h: 800, margins: { t: 10, b: 20, in: 70, out: 30 }, cols: 2, gutter: 5 }
		const r = marginRegion(m)
		const l = marginRegion(m, true)
		expect(r).toEqual({ id: '', x: 70, y: 10, w: 500, h: 770, cols: 2, gutter: 5 })
		expect(l.x).toBe(30)
		expect(l.w).toBe(r.w)
	})
})

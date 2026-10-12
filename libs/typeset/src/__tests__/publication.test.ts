// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { describe, expect, it } from '@jest/globals'

import type { DLItem, PageDL } from '../display-list.js'
import { ptToFx } from '../fixed.js'
import { FontRegistry } from '../fonts/registry.js'
import { layoutPublication, marginRegion } from '../layout/paginate.js'
import type { Publication } from '../model.js'
import { renderPageSvg } from '../svg/render.js'
import { paragraphText } from '../text/itemize.js'
import { dlJson, loadPublication, PUB_CORPUS, sha256 } from './corpus.js'

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

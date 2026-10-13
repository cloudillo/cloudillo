// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { describe, expect, it } from '@jest/globals'

import type { LineGeom, PageDL } from '../display-list.js'
import { type Fx, ptToFx } from '../fixed.js'
import { FontRegistry } from '../fonts/registry.js'
import {
	type Exclusion,
	freeSpan,
	freeSpans,
	nextFreeTop,
	sinCos,
	WRAP_FRAMES_MAX,
	wrapExclusions
} from '../layout/exclusions.js'
import { fillFlow } from '../layout/fill.js'
import { layoutParagraph } from '../layout/paragraph.js'
import type { Box, Frame, Paragraph, ShapeFrameData } from '../model.js'
import { createShapeCache } from '../shape/cache.js'
import { initHarfBuzz } from '../shape/hb.js'
import { itemizeParagraph, loadParagraphFaces, paragraphText } from '../text/itemize.js'
import { EN, fetchBytes, p, STYLES } from './corpus.js'

const pt = ptToFx

/** A wrapping frame with its box given in pt. */
function frame(
	x: number,
	y: number,
	w: number,
	h: number,
	extra: Partial<Frame> = {},
	kind: ShapeFrameData['kind'] = 'rect'
): Frame {
	return {
		id: 'f',
		t: 'shp',
		anchor: { sec: 's', page: 0 },
		x: pt(x),
		y: pt(y),
		w: pt(w),
		h: pt(h),
		rot: 0,
		z: 0,
		wrap: { mode: 'box', off: 0 },
		data: { kind } satisfies ShapeFrameData,
		...extra
	}
}

const one = (f: Frame): Exclusion => {
	const ex = wrapExclusions([f])
	expect(ex).toHaveLength(1)
	return ex[0]
}

const W = pt(1000)
const col = (x: Fx, w: Fx): Box => ({ x, y: 0, w, h: W })

/**
 * Blocked x-range of `e` across [top, bottom), read back through `freeSpan` with one column
 * ending at `cx` and one starting there (the shape must straddle `cx` in that band).
 */
function blocked(e: Exclusion, cx: Fx, top: Fx, bottom: Fx): [Fx, Fx] {
	const l = freeSpan(col(0, cx), [e], top, bottom)
	const r = freeSpan(col(cx, W - cx), [e], top, bottom)
	expect(l.x).toBe(0)
	return [l.w, r.x]
}

describe('wrapExclusions', () => {
	it('caps wrapping frames per page', () => {
		const frames = Array.from({ length: 300 }, (_, i) => frame(i, i, 1, 1))
		expect(wrapExclusions(frames)).toHaveLength(WRAP_FRAMES_MAX)
	})

	it('keeps an unrotated rect as the old box', () => {
		const o = pt(6)
		const f = frame(100, 120, 90, 50, { wrap: { mode: 'box', off: o } })
		const e = one(f)
		expect(e.pts).toBeUndefined()
		expect(e).toEqual({
			x0: f.x - o,
			y0: f.y - o,
			x1: f.x + f.w + o,
			y1: f.y + f.h + o,
			tb: false
		})
	})

	it('skips frames that do not wrap', () => {
		expect(wrapExclusions([frame(0, 0, 10, 10, { wrap: { mode: 'none', off: 0 } })])).toEqual(
			[]
		)
	})

	it('turns a quarter-turned rect into a box with swapped extents about its centre', () => {
		const o = pt(4)
		// Odd width: the centre is floored, so the box is one unit lopsided along y.
		const f = frame(100, 100, 200, 100, {
			w: pt(200) + 1,
			rot: 90,
			wrap: { mode: 'tb', off: o }
		})
		const hw = Math.floor(f.w / 2)
		const hh = Math.floor(f.h / 2)
		const cx = f.x + hw
		const cy = f.y + hh
		const e = one(f)
		expect(e.pts).toBeUndefined()
		expect(e).toEqual({
			x0: cx - (f.h - hh) - o,
			y0: cy - hw - o,
			x1: cx + hh + o,
			y1: cy + (f.w - hw) + o,
			tb: true
		})
	})

	it('normalises rot: -90 ≡ 270, 360 ≡ 0, 405 ≡ 45, NaN ≡ 0', () => {
		const at = (rot: number) => wrapExclusions([frame(100, 120, 90, 50, { rot })])
		expect(at(-90)).toEqual(at(270))
		expect(at(360)).toEqual(at(0))
		expect(at(360)[0].pts).toBeUndefined()
		expect(at(405)).toEqual(at(45))
		expect(at(Number.NaN)).toEqual(at(0))
	})

	it('skips a frame with non-finite geometry', () => {
		expect(wrapExclusions([frame(0, 0, 100, 100, { w: Number.NaN })])).toEqual([])
		expect(wrapExclusions([frame(0, 0, 100, 100, { x: Number.POSITIVE_INFINITY })])).toEqual([])
	})

	it('skips a frame whose outline the offset shrinks to nothing', () => {
		const f = frame(0, 0, 100, 100, { wrap: { mode: 'box', off: -pt(60) } }, 'ellipse')
		expect(wrapExclusions([f])).toEqual([])
	})

	it('treats a shape frame without data as a box', () => {
		expect(one(frame(0, 0, 100, 100, { data: undefined as never })).pts).toBeUndefined()
	})

	it('blocks the whole band for a rotated tb rect and resumes right below it', () => {
		const f = frame(100, 100, 200, 100, { rot: 30, wrap: { mode: 'tb', off: 0 } })
		const e = one(f)
		expect(e.pts).toHaveLength(4)
		const wide = col(0, W)
		const band = pt(12)
		expect(freeSpan(wide, [e], pt(150), pt(150) + band).w).toBe(0)
		expect(nextFreeTop(wide, [e], e.y0, band, pt(40))).toBe(e.y1)
	})

	it('slices a straight edge for a band holding no vertex', () => {
		// 300×50 pt at 30°: vertices sit ±53 pt and ±97 pt from the centre row.
		const e = one(frame(100, 100, 300, 50, { rot: 30 }))
		const cy = pt(125)
		const [lo, hi] = blocked(e, pt(250), cy, cy + pt(1))
		expect(lo).toBeGreaterThan(e.x0)
		expect(hi).toBeLessThan(e.x1)
		expect(hi - lo).toBeLessThan((e.x1 - e.x0) / 2)
	})

	it('merges two overlapping polygons in freeSpan', () => {
		const ex = wrapExclusions([
			frame(100, 100, 100, 100, { rot: 45 }),
			frame(160, 100, 100, 100, { rot: 45 })
		])
		const [a, b] = ex
		const cy = pt(150)
		const band = pt(4)
		const s = freeSpan(col(0, W), ex, cy - band / 2, cy + band / 2)
		// Right of both is wider than left of both; the overlap leaves nothing in between.
		expect(s.x).toBeGreaterThanOrEqual(pt(210) + Math.floor(pt(50) * Math.SQRT2))
		expect(s.x + s.w).toBe(W)
		expect(freeSpan(col(a.x0, b.x1 - a.x0), ex, cy - band / 2, cy + band / 2).w).toBe(0)
	})

	it('wraps a 45° square around its diamond outline', () => {
		const f = frame(100, 100, 100, 100, { rot: 45 })
		const cx = pt(150)
		const cy = pt(150)
		const half = Math.floor(pt(50) * Math.SQRT2)
		const e = one(f)
		expect(e.pts).toHaveLength(4)
		expect(e.y0).toBeLessThanOrEqual(cy - half)
		expect(e.y1).toBeGreaterThanOrEqual(cy + half)

		const band = pt(5)
		const [tl, th] = blocked(e, cx, e.y0, e.y0 + band)
		const [ml, mh] = blocked(e, cx, cy - band / 2, cy + band / 2)
		// Near the top corner only a sliver is blocked; mid-height covers the full diagonal.
		expect(th - tl).toBeLessThan(pt(15))
		expect(ml).toBeLessThanOrEqual(cx - half)
		expect(mh).toBeGreaterThanOrEqual(cx + half)
		const wide = col(0, W)
		expect(freeSpan(wide, [e], e.y0, e.y0 + band).w).toBeGreaterThan(
			freeSpan(wide, [e], cy - band / 2, cy + band / 2).w
		)
	})

	it('wraps an ellipse shape around a circle, not its box', () => {
		const o = pt(4)
		const f = frame(100, 100, 100, 100, { wrap: { mode: 'box', off: o } }, 'ellipse')
		const cx = pt(150)
		const cy = pt(150)
		const e = one(f)
		expect(e.pts).toHaveLength(32)

		const [ml, mh] = blocked(e, cx, cy - pt(1), cy + pt(1))
		expect(mh - ml).toBeGreaterThanOrEqual(f.w + 2 * o)
		const [tl, th] = blocked(e, cx, e.y0, e.y0 + pt(5))
		expect(th - tl).toBeLessThan((e.x1 - e.x0) / 2)
	})

	it('emits only integer coordinates and spans', () => {
		const frames = [
			frame(100.3, 97.7, 63.1, 41.9, { rot: 30, wrap: { mode: 'box', off: pt(3.3) } }),
			frame(250.1, 80.9, 77.7, 33.3, { rot: -17 }, 'ellipse'),
			frame(120, 300, 91, 57, { rot: 200, wrap: { mode: 'box', off: pt(2) } }, 'ellipse')
		]
		const ex = wrapExclusions(frames)
		expect(ex.every((e) => e.pts !== undefined)).toBe(true)
		for (const e of ex) {
			for (const v of [e.x0, e.y0, e.x1, e.y1, ...(e.pts ?? []).flat()]) {
				expect(Number.isInteger(v)).toBe(true)
			}
		}
		const c = col(pt(90), pt(260))
		for (let top = 0; top < pt(400); top += pt(3.7)) {
			const s = freeSpan(c, ex, top, top + pt(11.3))
			expect(Number.isInteger(s.x) && Number.isInteger(s.w)).toBe(true)
		}
		const t = nextFreeTop(c, ex, pt(70), pt(11.3), pt(200))
		expect(Number.isInteger(t)).toBe(true)
	})

	it('clamps huge geometry to a finite outline', () => {
		const e = one({ ...frame(0, 0, 10, 10, { rot: 30 }), x: 1e300, w: 1e300 })
		for (const v of [e.x0, e.y0, e.x1, e.y1, ...(e.pts ?? []).flat()]) {
			expect(Number.isFinite(v)).toBe(true)
		}
		for (const s of freeSpans(col(0, pt(300)), [e], e.y0, e.y0 + pt(10))) {
			expect(Number.isFinite(s.x) && Number.isFinite(s.w)).toBe(true)
		}
	})
})

describe('nextFreeTop', () => {
	it('resumes text where a circle narrows, before its bottom', () => {
		// Circle of radius 50 pt at the column's left edge; the column is 20 pt wider than it.
		const f = frame(100, 100, 100, 100, {}, 'ellipse')
		const cy = pt(150)
		const e = one(f)
		const c = col(f.x, f.w + pt(20))
		const band = pt(12)
		const min = pt(40)
		expect(freeSpan(c, [e], cy, cy + band).w).toBeLessThan(min)
		const t = nextFreeTop(c, [e], cy, band, min)
		expect(t).toBeGreaterThan(cy)
		expect(t).toBeLessThan(e.y1)
		expect(freeSpan(c, [e], t, t + band).w).toBeGreaterThanOrEqual(min)
	})

	it('resumes text where a rotated rect narrows, before its bottom', () => {
		const e = one(frame(100, 100, 200, 100, { rot: 30 }))
		const cy = pt(150)
		const c = col(e.x0, e.x1 - e.x0 + pt(20))
		const band = pt(12)
		const min = pt(40)
		expect(freeSpan(c, [e], cy, cy + band).w).toBeLessThan(min)
		const t = nextFreeTop(c, [e], cy, band, min)
		expect(t).toBeGreaterThan(cy)
		expect(t).toBeLessThan(e.y1)
		expect(freeSpan(c, [e], t, t + band).w).toBeGreaterThanOrEqual(min)
	})

	it('passes a rotated tb frame where only its bounding-box corner meets the column', () => {
		const e = one(frame(100, 100, 100, 100, { rot: 45, wrap: { mode: 'tb', off: 0 } }))
		const c = col(e.x0, pt(10))
		const top = e.y0 + pt(2)
		expect(freeSpan(c, [e], top, e.y0 + pt(4)).w).toBe(pt(10))
		expect(nextFreeTop(c, [e], top, pt(2), pt(5))).toBe(top)
	})

	it('resumes below a rotated tb frame where its outline leaves the column, above its box', () => {
		const e = one(frame(100, 100, 100, 100, { rot: 45, wrap: { mode: 'tb', off: 0 } }))
		// The diamond's left corner reaches 30 pt into the column, ±30 pt about its centre y.
		const c = col(e.x0, pt(30))
		const t = nextFreeTop(c, [e], pt(150), pt(12), pt(10))
		expect(t).toBeGreaterThan(pt(150))
		expect(t).toBeLessThan(e.y1 - pt(20))
		expect(freeSpan(c, [e], t, t + pt(12)).w).toBe(pt(30))
	})

	it('terminates on a polygon at coordinates too large for the step to advance', () => {
		const y = 2 ** 60
		const d = 2 ** 56
		const e: Exclusion = {
			x0: 0,
			y0: y,
			x1: 2 * d,
			y1: y + 2 * d,
			tb: false,
			pts: [
				[d, y],
				[2 * d, y + d],
				[d, y + 2 * d],
				[0, y + d]
			]
		}
		const c: Box = { x: 0, y, w: pt(100), h: 2 ** 58 }
		const t = nextFreeTop(c, [e], y, pt(12), pt(40))
		expect(t).toBeGreaterThanOrEqual(y)
	})
})

describe('sinCos', () => {
	it('is exact on quarter turns', () => {
		const z = (d: number) => sinCos(d).map((v) => v + 0)
		expect(z(0)).toEqual([0, 1])
		expect(z(90)).toEqual([1, 0])
		expect(z(180)).toEqual([0, -1])
		expect(z(270)).toEqual([-1, 0])
		expect(z(-90)).toEqual([-1, 0])
		expect(z(450)).toEqual([1, 0])
	})

	it('matches Math.sin/cos to 4e-15 (reference error on unreduced args)', () => {
		for (let d = -360; d <= 720; d += 0.25) {
			const [s, c] = sinCos(d)
			const rad = (d * Math.PI) / 180
			expect(Math.abs(s - Math.sin(rad))).toBeLessThan(4e-15)
			expect(Math.abs(c - Math.cos(rad))).toBeLessThan(4e-15)
		}
	})
})

describe('freeSpans', () => {
	const c = col(0, pt(300))
	const band = [pt(100), pt(110)] as const
	const box = (x: number, w: number) => one(frame(x, 90, w, 40))

	it('returns every free interval left to right, slivers dropped', () => {
		expect(freeSpans(c, [box(100, 50)], ...band, pt(20))).toEqual([
			{ x: 0, w: pt(100) },
			{ x: pt(150), w: pt(150) }
		])
		expect(freeSpans(c, [box(10, 50)], ...band, pt(20))).toEqual([{ x: pt(60), w: pt(240) }])
	})

	it('merges overlapping, unsorted boxes', () => {
		expect(freeSpans(c, [box(200, 50), box(120, 50), box(100, 40)], ...band)).toEqual([
			{ x: 0, w: pt(100) },
			{ x: pt(170), w: pt(30) },
			{ x: pt(250), w: pt(50) }
		])
	})

	it('blocks the bounding box when a polygon has no slice of the band', () => {
		// Malformed: the outline sits above the band, but the box spans it. Fails closed.
		const e: Exclusion = {
			x0: pt(100),
			y0: 0,
			x1: pt(200),
			y1: pt(200),
			tb: false,
			pts: [
				[pt(100), 0],
				[pt(200), 0],
				[pt(150), pt(10)]
			]
		}
		expect(freeSpans(col(0, pt(300)), [e], ...band)).toEqual([
			{ x: 0, w: pt(100) },
			{ x: pt(200), w: pt(100) }
		])
	})

	it('handles tens of thousands of boxes', () => {
		const ex = Array.from({ length: 50000 }, (_, i) => one(frame(i * 0.1, 90, 0.05, 40)))
		const s = freeSpans(col(0, pt(6000)), ex, ...band)
		// Gaps between the boxes are 0.05 pt; the column past the last box is one more span.
		expect(s).toHaveLength(50000)
	})
})

describe('fillFlow with two-sided wrap', () => {
	const env = { registry: new FontRegistry(), shape: createShapeCache() }
	const region: Box = { x: pt(36), y: 0, w: pt(348), h: pt(500) }

	/** Flow `paras` through columns `c`, wrapping around `frames` on the first page (or `all`). */
	async function flow(
		paras: Paragraph[],
		frames: Frame[],
		c = region,
		all = false
	): Promise<PageDL[]> {
		await initHarfBuzz()
		await loadParagraphFaces(paras, STYLES, env.registry, fetchBytes)
		const ips = paras.map((q) => itemizeParagraph(q, STYLES, env, 'en'))
		const pages: PageDL[] = []
		fillFlow(
			{ id: 's', paragraphs: paras },
			ips,
			() => {
				if (pages.length >= 5) return undefined
				const pg: PageDL = {
					page: { sec: 's', index: pages.length, w: pt(420), h: pt(600), master: '' },
					items: [],
					lines: [],
					tags: [],
					rev: 0
				}
				pages.push(pg)
				return { pg, col: c, ex: all || pages.length === 1 ? wrapExclusions(frames) : [] }
			},
			env
		)
		return pages
	}

	/** Lines grouped by baseline, each group left to right. */
	const rows = (lines: LineGeom[]) => {
		const m = new Map<number, LineGeom[]>()
		for (const l of lines) m.set(l.y, [...(m.get(l.y) ?? []), l])
		return [...m.values()]
	}

	it('puts text on both sides of a frame in reading order', async () => {
		const para = p('left', `${EN} ${EN}`)
		const text = paragraphText(para)
		const f = frame(160, 40, 100, 60)
		const [pg] = await flow([para], [f])
		const split = rows(pg.lines).filter((r) => r.length === 2)
		expect(split.length).toBeGreaterThan(1)
		for (const [l, r] of split) {
			let to = l.to
			while (to > l.from && /\s/.test(text[to - 1])) to--
			expect(l.carets[to - l.from]).toBeLessThanOrEqual(f.x)
			expect(r.carets[0]).toBeGreaterThanOrEqual(f.x + f.w)
			expect(r.from).toBe(l.to)
		}
		// Lines follow the text with no gap or overlap.
		pg.lines.forEach((l, i) => {
			if (i) expect(l.from).toBe(pg.lines[i - 1].to)
		})
	})

	it('splits a band holding two frames into three segments', async () => {
		const [pg] = await flow(
			[p('left', `${EN} ${EN}`)],
			[frame(130, 40, 40, 60), frame(250, 40, 40, 60)]
		)
		expect(rows(pg.lines).some((r) => r.length === 3)).toBe(true)
	})

	it('drops a sliver narrower than 2 em beside the frame', async () => {
		// 14 pt free left of the frame, under 2 em of 11 pt.
		const f = frame(50, 40, 150, 60)
		const [pg] = await flow([p('left', `${EN} ${EN}`)], [f])
		const beside = pg.lines.filter((l) => l.y - l.ascent < f.y + f.h && l.y + l.descent > f.y)
		expect(beside.length).toBeGreaterThan(0)
		for (const l of beside) expect(l.carets[0]).toBeGreaterThanOrEqual(f.x + f.w)
	})

	it('counts orphans in rows', async () => {
		const paras = () => [
			p('left', 'Intro.'),
			{ ...p('left', `${EN} ${EN}`), overrides: { orphans: 2 } }
		]
		const [free] = await flow(paras(), [])
		const lineH = free.lines[2].y - free.lines[1].y
		// Room for exactly one row of the second paragraph after the first.
		const h = free.lines[1].y - free.lines[0].y + Math.floor((lineH * 3) / 2)
		const c = { ...region, h }
		const f = frame(160, 0, 100, h / pt(1))
		const [pg, next] = await flow(paras(), [f], c)
		expect(pg.lines).toHaveLength(1)
		expect(next.lines.length).toBeGreaterThan(0)
	})

	it('counts widows in rows', async () => {
		const para = () => ({ ...p('left', `${EN} ${EN}`), overrides: { widows: 2 } })
		// The frame covers the whole column height: every row is split.
		const f = frame(160, 0, 100, 500)
		const [tall] = await flow([para()], [f])
		const rs = rows(tall.lines)
		expect(rs.length).toBeGreaterThan(3)
		// Room for every row but the last: alone it would carry over.
		const c = { ...region, h: rs[rs.length - 1][0].y }
		const [pg, next] = await flow([para()], [f], c)
		expect(pg.lines.length).toBeLessThan(tall.lines.length)
		expect(next.lines[0].from).toBeLessThanOrEqual(rs[rs.length - 2][0].from)
	})

	it('ends the row at a hard line break', async () => {
		const para = p('left', `Word one\nmore ${EN}`)
		const text = paragraphText(para)
		const [pg] = await flow([para], [frame(160, 0, 100, 60)])
		const i = pg.lines.findIndex((l) => text[l.to - 1] === '\n')
		expect(i).toBeGreaterThanOrEqual(0)
		expect(pg.lines[i + 1].y).toBeGreaterThan(pg.lines[i].y)
	})

	it('skips a narrow segment instead of breaking a word in it', async () => {
		// 24 pt free left of the frame: just over 2 em, too narrow for most words.
		const para = { ...p('left', `${EN} ${EN}`), overrides: { indentFirst: pt(20) } }
		const text = paragraphText(para)
		const f = frame(60, 0, 100, 100)
		const [pg] = await flow([para], [f])
		for (const r of rows(pg.lines)) {
			if (r.length < 2) continue
			for (const l of r) expect(l.to === text.length || /\s/.test(text[l.to - 1])).toBe(true)
		}
		// "Typesetting" skips the left segment; the first-line indent moves with it.
		expect(pg.lines[0].carets[0]).toBeGreaterThanOrEqual(f.x + f.w + pt(20))
	})

	it('keeps a row taller than the column-width band clear of the frame', async () => {
		const big = { text: 'BIG', marks: { size: pt(30) } }
		const para = p('left', `${EN} `, big, ` ${EN} `, big, ` ${EN}`)
		const text = paragraphText(para)
		const f = frame(160, 40, 100, 60)
		const [pg] = await flow([para], [f])
		for (const l of pg.lines) {
			if (l.y - l.ascent >= f.y + f.h || l.y + l.descent <= f.y) continue
			let to = l.to
			while (to > l.from && /\s/.test(text[to - 1])) to--
			const clear = l.carets[to - l.from] <= f.x || l.carets[0] >= f.x + f.w
			expect(clear).toBe(true)
		}
	})

	it('places mixed sizes across column breaks once each, clear of a rotated frame', async () => {
		const big = { text: 'BIG', marks: { size: pt(24) } }
		const tiny = { text: 'small', marks: { size: pt(8) } }
		// A tall leading: a split row of a BIG line and a small one (big ascent, small text's
		// half-leading below) is taller than any line alone, so re-breaking grows the band.
		const para = {
			...p('left', `${EN} `, big, ` ${EN} `, tiny, ` ${EN} `, big, ` ${EN} `, big, ` ${EN}`),
			overrides: { leading: pt(40) }
		}
		const text = paragraphText(para)
		const f = frame(250, 60, 100, 80, { rot: 25, wrap: { mode: 'box', off: pt(4) } })
		const c = { ...region, h: pt(220) }
		const pages = await flow([para], [f], c, true)
		const lines = pages.flatMap((pg) => pg.lines)
		expect(pages.length).toBeGreaterThan(1)
		expect(lines[0].from).toBe(0)
		lines.forEach((l, i) => {
			if (i) expect(l.from).toBe(lines[i - 1].to)
		})
		expect(lines[lines.length - 1].to).toBe(text.length)
		const ex = wrapExclusions([f])
		for (const l of lines) {
			let to = l.to
			while (to > l.from && /\s/.test(text[to - 1])) to--
			const x0 = l.carets[0]
			const x1 = l.carets[to - l.from]
			const free = freeSpans(c, ex, l.y - l.ascent, l.y + l.descent)
			expect(free.some((s) => s.x <= x0 && x1 <= s.x + s.w)).toBe(true)
		}
	})

	it('terminates on a NaN line height beside a frame', async () => {
		const para = { ...p('left', `${EN} ${EN}`), overrides: { leading: Number.NaN } }
		const pages = await flow([para], [frame(160, 0, 100, 100)])
		expect(pages.length).toBeGreaterThan(0)
	})

	it('force-breaks a word wider than every segment in the widest one', async () => {
		// Left of the frame 184 pt, right 94 pt: both narrower than the word.
		const word = 'W'.repeat(60)
		const f = frame(220, 0, 70, 100)
		const [pg] = await flow([p('left', word)], [f])
		const first = pg.lines[0]
		expect(first.carets[0]).toBeLessThan(f.x)
		expect(first.to).toBeLessThan(word.length)
	})

	it('moves a word that fits no later segment of a started row to the next row unbroken', async () => {
		const para = p('left', `ab ${'W'.repeat(8)}`)
		await initHarfBuzz()
		await loadParagraphFaces([para], STYLES, env.registry, fetchBytes)
		const ip = itemizeParagraph(para, STYLES, env, 'en')
		const [w] = layoutParagraph(ip, env, () => [pt(10000)]).lines
		const short = w.carets[3] - w.carets[0]
		const flat = {
			...ip,
			style: { ...ip.style, indentStart: 0, indentFirst: 0, indentEnd: 0 }
		}
		// Row 0: "ab " fits seg 0; the wider seg 1 is still too narrow for the long word.
		const { lines } = layoutParagraph(flat, env, (top) =>
			top === 0 ? [short + pt(1), short + pt(5)] : [pt(10000)]
		)
		expect(lines).toHaveLength(2)
		expect(lines[1]).toMatchObject({ row: 1, from: 3, to: 11 })
	})

	it('keeps lines clear of many stacked rotated frames', async () => {
		const para = p('left', Array.from({ length: 6 }, () => EN).join(' '))
		const text = paragraphText(para)
		const frames = Array.from({ length: 24 }, (_, i) =>
			frame(150 + (i % 3) * 20, i * 20, 60, 18, { rot: 15 + i * 7 })
		)
		const [pg] = await flow([para], frames)
		const ex = wrapExclusions(frames)
		for (const l of pg.lines) {
			let to = l.to
			while (to > l.from && /\s/.test(text[to - 1])) to--
			if (to === l.from) continue
			const x0 = l.carets[0]
			const x1 = l.carets[to - l.from]
			const free = freeSpans(region, ex, l.y - l.ascent, l.y + l.descent)
			expect(free.some((s) => s.x <= x0 && x1 <= s.x + s.w)).toBe(true)
		}
	})

	it('force-breaks in the segment with most room after the end indent', async () => {
		const para = p('left', 'W'.repeat(8))
		await initHarfBuzz()
		await loadParagraphFaces([para], STYLES, env.registry, fetchBytes)
		const ip = itemizeParagraph(para, STYLES, env, 'en')
		const [w] = layoutParagraph(ip, env, () => [pt(10000)]).lines
		const word = w.carets[w.carets.length - 1] - w.carets[0]
		// Seg 1 is wider, but the 30 pt end indent leaves it less room than seg 0.
		const wide = {
			...ip,
			style: { ...ip.style, indentStart: 0, indentFirst: 0, indentEnd: pt(30) }
		}
		const { lines } = layoutParagraph(wide, env, () => [word - pt(5), word + pt(5)])
		expect(lines[0].seg).toBe(0)
	})
})

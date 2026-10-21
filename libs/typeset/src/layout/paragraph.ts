// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { FONT_METRICS } from '@cloudillo/fonts/font-metrics'
import type { DLItem, FontRef, LineGeom } from '../display-list.js'
import { type Fx, unitsToFx } from '../fixed.js'
import type { ShapedRun } from '../shape/hb.js'
import { type BreakOpp, findBreaks, hyphenGlyph } from '../text/breaks.js'
import type { ItemizedParagraph, ItemizeEnv } from '../text/itemize.js'
import type { Exclusion } from './exclusions.js'
import { textGlyphs } from './fields.js'

/**
 * Available widths (Fx), left to right, of the segments of a line row whose top is `y` Fx below
 * the paragraph's first line top (space before excluded); never empty. The hook for wrap
 * exclusions; indents are subtracted by the caller.
 */
export type WidthAt = (y: Fx) => Fx[]

export interface ParaLine {
	/** Paragraph offsets; `to` includes trailing whitespace. */
	from: number
	to: number
	/** End of the painted text (trailing whitespace trimmed). */
	end: number
	/** Hyphen glyph drawn after `end` (Fx advance), on a hyphenated line. */
	hyphen?: { gid: number; advance: Fx }
	height: Fx
	/** Baseline below the line top. */
	baseline: Fx
	ascent: Fx
	descent: Fx
	/** x of every offset `from..to` (length to−from+1) relative to the column's left edge. */
	carets: Int32Array
	/** Justification space added after the cluster starting at each offset `from..to−1`. */
	extra: Int32Array
	/** Row index in the paragraph; the lines of a row share `height` and `baseline`. */
	row: number
	/** Segment index in the row's `WidthAt` widths. */
	seg: number
}

export interface ParaLayout {
	ip: ItemizedParagraph
	/** Per run, per glyph: Fx advance, tracking included (on the last glyph of each cluster). */
	adv: Int32Array[]
	lines: ParaLine[]
}

/** A hyphen break is taken only when it fills at least this much (em) more than the last word break. */
const HYPHEN_PENALTY_EM = 2
/** Justification: word-space stretch (1/1000 em) before letter-spacing is used. */
const SPACE_STRETCH = 500
/** Justification: letter-spacing cap (1/1000 em). */
const LETTER_SPACE_CAP = 50
const NEWLINE = /[\n\r\v\f\u0085\u2028\u2029]/
const SPACES = ' \u00a0\u3000'

function faceMetrics(font: FontRef, size: Fx): { ascent: Fx; descent: Fx } {
	const m = FONT_METRICS[font.file]
	if (!m) throw new Error(`typeset: no metrics for ${font.file}`)
	return {
		ascent: unitsToFx(m.ascender, size, font.upem),
		descent: unitsToFx(-m.descender, size, font.upem)
	}
}

/** The width-independent half of `layoutParagraph`, cached per itemized paragraph by `prepare`. */
export interface Prep {
	/** Natural Fx advance of the cluster starting at each offset (0 inside a cluster), length n+1. */
	cw: Float64Array
	/** 1 at each cluster start (and at 0 and n). */
	isStart: Uint8Array
	/** Prefix sums of `cw`: `px[o]` = natural x of offset `o`. */
	px: Float64Array
	/** As `ParaLayout.adv`. */
	adv: Int32Array[]
	/** `findBreaks(text, lang, style.hyphenate)`. */
	opps: BreakOpp[]
}

const preps = new WeakMap<ItemizedParagraph, Prep>()
const layouts = new WeakMap<ItemizedParagraph, Map<Fx, ParaLayout>>()

/**
 * Cluster advances, boundaries and break opportunities of `ip`, memoized by `ip` identity
 * (itemized paragraphs are immutable). The result is shared: never mutate it.
 */
export function prepare(ip: ItemizedParagraph): Prep {
	let prep = preps.get(ip)
	if (prep) return prep
	const { text, style, runs } = ip
	const n = text.length

	// Natural Fx advance of the cluster starting at each offset, cluster boundaries, prefix sums.
	const cw = new Float64Array(n + 1)
	const isStart = new Uint8Array(n + 1)
	isStart[0] = 1
	isStart[n] = 1
	const adv = runs.map((r) => {
		const s = r.shaped
		const track = Math.round((r.char.tracking * r.size) / 1000)
		const a = new Int32Array(s.glyphs.length)
		for (let i = 0; i < a.length; i++) {
			const c = s.clusters[i]
			const lastOfCluster = i + 1 === a.length || s.clusters[i + 1] !== c
			a[i] = unitsToFx(s.advances[i], r.size, r.font.upem) + (lastOfCluster ? track : 0)
			const o = r.from + c
			isStart[o] = 1
			if (!NEWLINE.test(text[o])) cw[o] += a[i]
		}
		return a
	})
	const px = new Float64Array(n + 1)
	for (let o = 0; o < n; o++) px[o + 1] = px[o] + cw[o]
	prep = { cw, isStart, px, adv, opps: findBreaks(text, ip.lang, style.hyphenate) }
	preps.set(ip, prep)
	return prep
}

/**
 * `layoutParagraph` at a constant width `w`, memoized by `ip` identity and `w`. The layout is
 * shared between callers: never mutate it (its `lines`, `carets`, `extra`).
 */
export function layoutParagraphAt(ip: ItemizedParagraph, env: ItemizeEnv, w: Fx): ParaLayout {
	let byW = layouts.get(ip)
	if (!byW) {
		byW = new Map()
		layouts.set(ip, byW)
	}
	let pl = byW.get(w)
	if (!pl) {
		pl = layoutParagraph(ip, env, () => [w])
		byW.set(w, pl)
	}
	return pl
}

/**
 * Greedy first-fit line breaking of one itemized paragraph, with a hyphen penalty, indents and
 * alignment (justify = word spaces first, then capped letter-spacing; the last line and lines
 * ending in a mandatory break stay left). Line height = max(leading, ascent + descent) of the
 * runs on the line. Space before/after is left to the caller. For a constant width prefer the
 * memoized `layoutParagraphAt`.
 */
export function layoutParagraph(
	ip: ItemizedParagraph,
	env: ItemizeEnv,
	widthAt: WidthAt
): ParaLayout {
	const { text, style, runs } = ip
	const n = text.length
	const { cw, isStart, px, adv, opps } = prepare(ip)

	const runAt = (o: number) => runs.find((r) => r.from <= o && o < r.to) ?? runs[runs.length - 1]
	const hyphenAt = (o: number) => {
		const r = runAt(o)
		const g = hyphenGlyph(r.font, env.shape)
		return { gid: g.gid, advance: unitsToFx(g.advance, r.size, r.font.upem) }
	}
	const trim = (a: number, b: number) => {
		while (b > a && /\s/.test(text[b - 1])) b--
		return b
	}
	const measure = (a: number, b: number, hyphen: boolean) => {
		const e = trim(a, b)
		return px[e] - px[a] + (hyphen && e > a ? hyphenAt(e - 1).advance : 0)
	}

	const makeLine = (
		a: number,
		b: number,
		hyphen: boolean,
		last: boolean,
		avail: Fx,
		indent: Fx,
		row: number,
		seg: number
	): ParaLine => {
		const end = trim(a, b)
		const hy = hyphen && end > a ? hyphenAt(end - 1) : undefined
		const natural = px[end] - px[a] + (hy?.advance ?? 0)

		let ascent = 0
		let descent = 0
		const on = runs.filter((r) => r.from < b && r.to > a)
		for (const m of on.length
			? on.map((r) => faceMetrics(r.font, r.size))
			: [faceMetrics(ip.font, style.size)]) {
			ascent = Math.max(ascent, m.ascent)
			descent = Math.max(descent, m.descent)
		}
		const height = Math.max(style.leading, ascent + descent)
		const baseline = Math.floor((height - ascent - descent) / 2) + ascent

		const slack = Math.max(0, avail - natural)
		const extra = new Int32Array(b - a)
		let x = indent
		if (style.align === 'right') x += slack
		else if (style.align === 'center') x += Math.floor(slack / 2)
		else if (style.align === 'justify' && !last && slack > 0) {
			const starts: number[] = []
			const spaces: number[] = []
			for (let o = a; o < end; o++) {
				if (!isStart[o]) continue
				starts.push(o)
				if (SPACES.includes(text[o])) spaces.push(o)
			}
			let rem = slack
			const stretch = Math.floor((style.size * SPACE_STRETCH) / 1000) * spaces.length
			if (rem > stretch && starts.length > 1) {
				const gaps = starts.length - 1
				const ls = Math.min(
					Math.floor((rem - stretch) / gaps),
					Math.floor((style.size * LETTER_SPACE_CAP) / 1000)
				)
				for (let i = 0; i < gaps; i++) extra[starts[i] - a] += ls
				rem -= ls * gaps
			}
			if (spaces.length) {
				const q = Math.floor(rem / spaces.length)
				const r = rem % spaces.length
				for (let i = 0; i < spaces.length; i++) extra[spaces[i] - a] += q + (i < r ? 1 : 0)
			}
		}

		// Carets: cluster starts get the running x, offsets inside a cluster are interpolated.
		const carets = new Int32Array(b - a + 1)
		for (let o = a; o < b; ) {
			let nb = o + 1
			while (nb < b && !isStart[nb]) nb++
			for (let k = o; k < nb; k++)
				carets[k - a] = x + Math.floor((cw[o] * (k - o)) / (nb - o))
			x += cw[o] + extra[o - a]
			o = nb
		}
		carets[b - a] = x
		return {
			from: a,
			to: b,
			end,
			hyphen: hy,
			height,
			baseline,
			ascent,
			descent,
			carets,
			extra,
			row,
			seg
		}
	}

	// Lines are cut from the paragraph-wide shaping (no reshape at line ends, `unsafeToBreak`
	// unused) and break opportunities inside a cluster are skipped; reshape edges if ligature or
	// kerning damage at hyphen points shows up.
	const penalty = HYPHEN_PENALTY_EM * style.size
	const lines: ParaLine[] = []
	let a = 0
	let top = 0
	let oi = 0
	let row = 0
	do {
		// A row: one line per segment, left to right, until the text runs out.
		const ws = widthAt(top)
		if (!ws.length) throw new TypeError('widthAt: no segments')
		const rs = lines.length
		// The roomiest segment (first on a tie) takes a word that fits nowhere; the start indent
		// moves to whichever segment emits first, so only the end indent tells them apart.
		const room = (k: number) => ws[k] - (k === ws.length - 1 ? style.indentEnd : 0)
		let force = 0
		for (let k = 1; k < ws.length; k++) if (room(k) > room(force)) force = k
		for (let seg = 0; seg < ws.length && (seg === 0 || a < n); seg++) {
			const lastSeg = seg === ws.length - 1
			// The indent goes on the row's first emitted line (a skipped segment emits none).
			const indent =
				lines.length === rs ? style.indentStart + (a === 0 ? style.indentFirst : 0) : 0
			const avail = ws[seg] - indent - (lastSeg ? style.indentEnd : 0)
			let b = 0
			let hyphen = false
			let last = true
			if (n) {
				let fit = -1
				let fitWord = -1
				for (; oi < opps.length; oi++) {
					const o = opps[oi]
					if (o.offset <= a || !isStart[o.offset]) continue
					if (measure(a, o.offset, o.kind === 'hyphen') > avail) break
					fit = oi
					if (o.kind !== 'hyphen') fitWord = oi
					if (o.kind === 'mandatory') break
				}
				if (fit < 0) {
					// Nothing fits: once the row has a line, end it (the next row may be wider);
					// else skip the segment, and only in the widest segment of a row that has
					// emitted nothing is the word broken between clusters, one cluster at least.
					if (lines.length > rs) break
					if (seg !== force) continue
					const limit = oi < opps.length ? opps[oi].offset : n
					b = a + 1
					while (!isStart[b]) b++
					for (let c = b + 1; c < limit; c++)
						if (isStart[c] && px[c] - px[a] <= avail) b = c
					last = false
				} else {
					let pick = fit
					if (
						opps[fit].kind === 'hyphen' &&
						fitWord >= 0 &&
						measure(a, opps[fitWord].offset, false) + penalty >=
							measure(a, opps[fit].offset, true)
					)
						pick = fitWord
					b = opps[pick].offset
					hyphen = opps[pick].kind === 'hyphen'
					last = opps[pick].kind === 'mandatory'
					oi = pick + 1
				}
			}
			lines.push(makeLine(a, b, hyphen, last, avail, indent, row, seg))
			a = b
			// A mandatory break ends the row.
			if (last) break
		}
		// The row's lines share one baseline (the lowest) and the height holding them all.
		let baseline = 0
		let below = 0
		for (let k = rs; k < lines.length; k++) {
			baseline = Math.max(baseline, lines[k].baseline)
			below = Math.max(below, lines[k].height - lines[k].baseline)
		}
		for (let k = rs; k < lines.length; k++) {
			lines[k].baseline = baseline
			lines[k].height = baseline + below
		}
		top += baseline + below
		row++
	} while (a < n)
	return { ip, adv, lines }
}

/** Cap on drop-cap lines: `dropCap` comes from peers unvalidated. */
const DROP_CAP_MAX = 10

export interface DropCap {
	/** The paragraph with its first cluster as a zero-width run that paints nothing: lay out this. */
	ip: ItemizedParagraph
	/** The cap's wrap box, relative to the column's left edge and the paragraph's first line top. */
	ex: Exclusion
	/** Its height (n lines at the style's line height) below the first line top. */
	h: Fx
	/** The enlarged cluster, its left edge at `x`, for a first line top at `top`. */
	item: (x: Fx, top: Fx, tag: number) => DLItem
}

const dropCaps = new WeakMap<ItemizedParagraph, DropCap | null>()

/**
 * Drop cap of `ip` (`style.dropCap` ≥ 2 lines): its first cluster, enlarged so its ascender lines up
 * with the first line's and its baseline sits on line n's (at the style's line height), indented by
 * `indentStart`; the first n lines wrap beside it through `ex` (plus a quarter-em gap). Memoized per
 * `ip` identity. None for an empty paragraph, a blank or RTL first cluster.
 */
// Aligns ascenders, not cap heights (no cap-height metric), so the cap sits a little low;
// read the glyph's bbox if designers notice.
export function dropCap(ip: ItemizedParagraph, env: ItemizeEnv): DropCap | undefined {
	const hit = dropCaps.get(ip)
	if (hit !== undefined) return hit ?? undefined
	const out = makeDropCap(ip, env)
	dropCaps.set(ip, out ?? null)
	return out
}

function makeDropCap(ip: ItemizedParagraph, env: ItemizeEnv): DropCap | undefined {
	const { style, text } = ip
	const n = Math.min(DROP_CAP_MAX, Math.floor(style.dropCap))
	const r0 = ip.runs[0]
	if (!(n >= 2) || !r0 || r0.from !== 0 || r0.level & 1 || r0.embed) return undefined
	const s = r0.shaped
	let end = r0.to
	for (const c of s.clusters) if (c > 0 && c < end) end = c
	const cap = text.slice(0, end)
	if (!cap.trim()) return undefined
	const keep: number[] = []
	for (let i = 0; i < s.glyphs.length; i++) if (s.clusters[i] >= end) keep.push(i)
	const rest: ShapedRun = {
		glyphs: Uint16Array.from(keep, (i) => s.glyphs[i]),
		clusters: Uint32Array.from(keep, (i) => s.clusters[i] - end),
		advances: Int32Array.from(keep, (i) => s.advances[i]),
		offsets: Int32Array.from(keep.flatMap((i) => [s.offsets[2 * i], s.offsets[2 * i + 1]])),
		unsafeToBreak: Uint8Array.from(keep, (i) => s.unsafeToBreak?.[i] ?? 0)
	}
	const none: ShapedRun = {
		glyphs: new Uint16Array(0),
		clusters: new Uint32Array(0),
		advances: new Int32Array(0),
		offsets: new Int32Array(0),
		unsafeToBreak: new Uint8Array(0)
	}
	const runs = [
		{ ...r0, to: end, shaped: none },
		...(end < r0.to ? [{ ...r0, from: end, shaped: rest }] : []),
		...ip.runs.slice(1)
	]
	const m = faceMetrics(ip.font, style.size)
	const lineH = Math.max(style.leading, m.ascent + m.descent)
	const base = Math.floor((lineH - m.ascent - m.descent) / 2) + m.ascent
	const ca = faceMetrics(r0.font, r0.size).ascent
	const size = ca > 0 ? Math.floor((r0.size * ((n - 1) * lineH + m.ascent)) / ca) : r0.size
	const g = textGlyphs(env, r0.font, size, cap, r0.features, r0.lang)
	let w = 0
	for (const a of g.advances) w += a
	const h = n * lineH
	return {
		ip: { ...ip, runs },
		ex: { x0: 0, y0: 0, x1: w + Math.floor(style.size / 4), y1: h, tb: false },
		h,
		item: (x, top, tag) => ({
			k: 'glyphs',
			font: r0.font,
			size,
			color: r0.char.color,
			x,
			y: top + (n - 1) * lineH + base,
			...g,
			// Fresh arrays per pass: `g` is memoized and the worker transfers (detaches) item buffers.
			glyphs: g.glyphs.slice(),
			advances: g.advances.slice(),
			clusters: g.clusters.slice(),
			...(g.offsets ? { offsets: g.offsets.slice() } : {}),
			tag
		})
	}
}

/** A placed line's `LineGeom` (`ox, oy`: the paragraph's origin). */
export function lineGeom(story: string, bid: string, line: ParaLine, ox: Fx, oy: Fx): LineGeom {
	return {
		story,
		bid,
		from: line.from,
		to: line.to,
		row: line.row,
		x: ox + line.carets[0],
		y: oy + line.baseline,
		ascent: line.ascent,
		descent: line.descent,
		carets: line.carets.map((c) => c + ox)
	}
}

/** Display list items of one line placed with its column's left edge at `ox` and its top at `oy`. */
export function emitLine(pl: ParaLayout, line: ParaLine, ox: Fx, oy: Fx, tag: number): DLItem[] {
	const { ip, adv } = pl
	const items: DLItem[] = []
	const base = oy + line.baseline
	for (let ri = 0; ri < ip.runs.length; ri++) {
		const r = ip.runs[ri]
		const from = Math.max(line.from, r.from)
		const to = Math.min(line.end, r.to)
		if (from >= to) continue
		const s = r.shaped
		const idx: number[] = []
		for (let i = 0; i < s.glyphs.length; i++) {
			const o = r.from + s.clusters[i]
			if (o >= from && o < to) idx.push(i)
		}
		const hy = line.hyphen && to === line.end ? line.hyphen : undefined
		const m = idx.length + (hy ? 1 : 0)
		// A run shaped to no glyphs (a drop cap's cluster, painted by `DropCap.item`) emits nothing.
		if (!m) continue
		const glyphs = new Uint16Array(m)
		const advances = new Int32Array(m)
		const clusters = new Uint32Array(m)
		const offsets = new Int32Array(2 * m)
		let anyOffset = false
		for (let j = 0; j < idx.length; j++) {
			const i = idx[j]
			const c = r.from + s.clusters[i]
			const lastOfCluster = i + 1 === s.glyphs.length || s.clusters[i + 1] !== s.clusters[i]
			glyphs[j] = s.glyphs[i]
			advances[j] = adv[ri][i] + (lastOfCluster ? line.extra[c - line.from] : 0)
			clusters[j] = c - from
			// HarfBuzz offsets are y-up; the display list is y-down.
			offsets[2 * j] = unitsToFx(s.offsets[2 * i], r.size, r.font.upem)
			offsets[2 * j + 1] = -unitsToFx(s.offsets[2 * i + 1], r.size, r.font.upem)
			if (offsets[2 * j] || offsets[2 * j + 1]) anyOffset = true
		}
		if (hy) {
			// The hyphen joins the last cluster: extracted text stays the unhyphenated word.
			glyphs[m - 1] = hy.gid
			advances[m - 1] = hy.advance
			clusters[m - 1] = m > 1 ? clusters[m - 2] : 0
		}
		const x = ox + line.carets[from - line.from]
		const y = base - r.char.baselineShift
		let w = 0
		for (const a of advances) w += a
		items.push({
			k: 'glyphs',
			font: r.font,
			size: r.size,
			color: r.char.color,
			x,
			y,
			glyphs,
			advances,
			...(anyOffset ? { offsets } : {}),
			text: ip.text.slice(from, to),
			clusters,
			tag
		})
		// Decoration position/thickness from the size, not the font's `post` table.
		const thick = Math.max(1, Math.round(r.size / 16))
		if (r.char.underline) {
			const ly = y + Math.round(r.size / 10)
			items.push({
				k: 'line',
				x1: x,
				y1: ly,
				x2: x + w,
				y2: ly,
				color: r.char.color,
				width: thick,
				tag
			})
		}
		if (r.char.strike) {
			const ly = y - Math.round((r.size * 3) / 10)
			items.push({
				k: 'line',
				x1: x,
				y1: ly,
				x2: x + w,
				y2: ly,
				color: r.char.color,
				width: thick,
				tag
			})
		}
		if (r.link)
			items.push({
				k: 'link',
				box: { x, y: base - line.ascent, w, h: line.ascent + line.descent },
				href: r.link
			})
	}
	return items
}

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Table of contents: a `{ toc: { levels } }` inline embed makes its paragraph the TOC of the whole
// publication — one entry per section-story paragraph whose style has a `tocLevel` ≤ `levels`, in
// the TOC paragraph's style (left-aligned, indented 1 em per level below 1), then a dot leader and
// the heading's page number right-aligned in a fixed box at the end of the entry's last line.
// Two passes: layout reserves the box (`BOX` in tabular figures, as wide as any 3-digit number,
// kept free by the entries' end indent) and emits placeholders; `fillToc` fills them in once every
// page has its number, so numbers and leaders never change a line break.

import type { DLItem, PageDL } from '../display-list.js'
import type { Fx } from '../fixed.js'
import type { Paragraph, Publication } from '../model.js'
import {
	type ItemizedParagraph,
	type ItemizeEnv,
	itemizeParagraph,
	paragraphText
} from '../text/itemize.js'
import { resolveParagraphStyle } from '../text/styles.js'
import { textGlyphs } from './fields.js'

/** Box of a page number. */
const BOX = '000'
const LEVELS_DEFAULT = 3
const LEVELS_MAX = 6

/** A heading listed in the TOC. */
export interface TocEntry {
	story: string
	bid: string
	level: number
	text: string
}

/** A TOC paragraph's entries, itemized; shared between passes: never mutate. */
export interface TocBlock {
	/** One paragraph per entry (no entries: one empty line, `e` absent). */
	items: { e?: TocEntry; ip: ItemizedParagraph }[]
	/** Gap between the text, the leader and the number. */
	gap: Fx
}

/** A placed entry of this pass: its two placeholder items on `pg`, the leader's start, the box's right edge. */
export interface TocSlot {
	pg: PageDL
	e: TocEntry
	lead: DLItem
	num: DLItem
	x0: Fx
	x1: Fx
	gap: Fx
}

/** `levels` of the paragraph's TOC embed (clamped to 1–6, default 3), `undefined` without one. */
export function tocLevels(p: Paragraph): number | undefined {
	if (!Array.isArray(p.runs)) return undefined
	for (const r of p.runs) {
		const e = r.embed
		if (!e || !('toc' in e)) continue
		const n = Math.floor(Number(e.toc?.levels))
		return n >= 1 ? Math.min(LEVELS_MAX, n) : LEVELS_DEFAULT
	}
	return undefined
}

/** Every section story's headings (`tocLevel` 1–6), in flow order; embeds dropped from the text. */
export function tocEntries(pub: Publication): TocEntry[] {
	const out: TocEntry[] = []
	for (const s of pub.sections) {
		for (const p of s.story.paragraphs) {
			if (!Array.isArray(p.runs)) continue
			const level = resolveParagraphStyle(pub.styles, p.style, p.overrides).tocLevel
			if (!level || level < 1 || level > 6) continue
			const text = paragraphText(p).replaceAll('￼', '')
			out.push({ story: s.story.id, bid: p.bid, level, text })
		}
	}
	return out
}

const blocks = new WeakMap<ItemizedParagraph, { key: string; b: TocBlock }>()

/**
 * The TOC of paragraph `p` (itemized `ip`): the `entries` up to `levels`. Memoized per (`ip`,
 * entries), so a changed heading is a new block of new entry paragraphs and cached layouts stay valid.
 */
export function tocBlock(
	p: Paragraph,
	ip: ItemizedParagraph,
	levels: number,
	entries: TocEntry[],
	pub: Publication,
	env: ItemizeEnv
): TocBlock {
	const es = entries.filter((e) => e.level <= levels)
	const key = JSON.stringify(es)
	const hit = blocks.get(ip)
	if (hit?.key === key) return hit.b
	const st = ip.style
	const gap = Math.floor(st.size / 2)
	let box = 0
	for (const a of textGlyphs(env, ip.font, st.size, BOX, ['tnum'], ip.lang).advances) box += a
	const item = (text: string, level: number): ItemizedParagraph =>
		itemizeParagraph(
			{
				bid: p.bid,
				style: p.style,
				overrides: {
					...p.overrides,
					align: 'left',
					indentFirst: 0,
					dropCap: 0,
					spanColumns: false,
					indentStart: st.indentStart + (level - 1) * st.size,
					indentEnd: st.indentEnd + box + gap
				},
				runs: [{ text, marks: {} }]
			},
			pub.styles,
			env,
			pub.lang
		)
	const b: TocBlock = {
		gap,
		items: es.length ? es.map((e) => ({ e, ip: item(e.text, e.level) })) : [{ ip: item('', 1) }]
	}
	blocks.set(ip, { key, b })
	return b
}

/**
 * Pass 2: each placed entry's number (`page` of its heading) right-aligned at `x1`, and a dot leader
 * from `x0` up to a gap before it (dots on a page-wide grid, so they line up across entries). An
 * entry whose page is unknown (overset, or past a partial pass) loses both placeholders.
 */
export function fillToc(
	slots: TocSlot[],
	page: (e: TocEntry) => string | undefined,
	env: ItemizeEnv,
	lang: string
): void {
	for (const s of slots) {
		const { num, lead } = s
		const items = s.pg.items
		if (num.k !== 'glyphs' || lead.k !== 'glyphs') continue
		const text = page(s.e)
		const g = text ? textGlyphs(env, num.font, num.size, text, ['tnum'], lang) : undefined
		let w = 0
		for (const a of g?.advances ?? []) w += a
		const nx = s.x1 - w
		const dot = textGlyphs(env, num.font, num.size, '.', [], lang)
		const step = (dot.advances[0] ?? 0) + Math.floor(num.size / 4)
		const x = step > 0 ? Math.ceil(s.x0 / step) * step : s.x0
		const n = g && dot.glyphs.length && step > 0 ? Math.floor((nx - s.gap - x) / step) : 0
		const li = items.indexOf(lead)
		if (li >= 0) {
			if (n > 0)
				items[li] = {
					...lead,
					x,
					text: '.'.repeat(n),
					glyphs: new Uint16Array(n).fill(dot.glyphs[0]),
					advances: new Int32Array(n).fill(step),
					clusters: Uint32Array.from({ length: n }, (_, k) => k)
				}
			else items.splice(li, 1)
		}
		const ni = items.indexOf(num)
		if (ni < 0) continue
		if (g) items[ni] = { ...num, ...g, x: nx }
		else items.splice(ni, 1)
	}
}

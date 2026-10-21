// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Footnotes: a `{ fn: storyId }` inline embed in a section story refers to a body story in
// `Publication.footnotes`. Refs are numbered per section; bodies are placed at the bottom of the
// column of their ref (see `FootnoteArea`).

import type { PageDL, TagNode } from '../display-list.js'
import type { Fx } from '../fixed.js'
import type { Box, Story } from '../model.js'
import type { ItemizedParagraph, ItemizeEnv } from '../text/itemize.js'
import { textGlyphs } from './fields.js'
import {
	emitLine,
	layoutParagraphAt,
	lineGeom,
	type ParaLayout,
	type ParaLine
} from './paragraph.js'
import { storyTagCount } from './table.js'

/** Height of the separator band atop a column's footnote area; its rule is at mid-height. */
export const FN_SEP: Fx = 8 * 1024
/** Separator rule width (0.5 pt); the rule is a third of the column wide. */
const FN_RULE: Fx = 512

/** One footnote reference of a flow. */
export interface FnRef {
	/** Paragraph index in the flow's story, and the ref's offset in that paragraph. */
	pi: number
	at: number
	/** The body story. */
	story: Story
	/** Number within the section, from 1. */
	num: number
	/** Tag id of its `Note`; its body paragraphs take `tag + 1 + paragraph index`. */
	tag: number
}

export interface FnNote extends FnRef {
	/** Itemized `story.paragraphs`. */
	paras: ItemizedParagraph[]
}

/**
 * The refs of `story` whose body exists in `footnotes`, in story order (table cells and captions
 * are not searched). Tag ids start after the story's own range (`storyTagCount`); `tags` = how
 * many the refs take (per ref one `Note` plus one per body paragraph).
 */
export function collectRefs(
	story: Story,
	footnotes: Record<string, Story> | undefined
): { refs: FnRef[]; tags: number } {
	const refs: FnRef[] = []
	const base = storyTagCount(story) + 1
	let tag = base
	if (!footnotes) return { refs, tags: 0 }
	story.paragraphs.forEach((p, pi) => {
		if (!Array.isArray(p.runs)) return
		let at = 0
		for (const r of p.runs) {
			const e = r.embed
			const fs =
				e && 'fn' in e && Object.hasOwn(footnotes, e.fn) ? footnotes[e.fn] : undefined
			if (fs) {
				refs.push({ pi, at, story: fs, num: refs.length + 1, tag })
				tag += 1 + fs.paragraphs.length
			}
			at += r.text.length
		}
	})
	return { refs, tags: tag - base }
}

const numbered = new WeakMap<ItemizedParagraph, { key: string; ip: ItemizedParagraph }>()

/**
 * `ip` with the ref runs of `refs` (this paragraph's) shaped as their superscript number, still one
 * character each. A copy, cached per (`ip`, numbers), so a renumbering is a new layout key and the
 * cached itemized paragraph is never touched.
 */
export function numberRefs(
	ip: ItemizedParagraph,
	refs: FnRef[],
	env: ItemizeEnv
): ItemizedParagraph {
	const key = refs.map((r) => `${r.at}:${r.num}`).join(',')
	const hit = numbered.get(ip)
	if (hit?.key === key) return hit.ip
	const out: ItemizedParagraph = {
		...ip,
		runs: ip.runs.map((r) => {
			const ref = r.embed && 'fn' in r.embed ? refs.find((f) => f.at === r.from) : undefined
			if (!ref) return r
			const size = Math.floor((r.size * 3) / 5)
			const s = env.shape(r.font, size, String(ref.num), { lang: r.lang })
			return {
				...r,
				size,
				char: {
					...r.char,
					size,
					baselineShift: r.char.baselineShift + Math.floor(r.size / 3)
				},
				shaped: { ...s, clusters: new Uint32Array(s.glyphs.length) }
			}
		})
	}
	numbered.set(ip, { key, ip: out })
	return out
}

/** A body line: its paragraph, layout and height (space before included). */
interface FnLine {
	pi: number
	pl: ParaLayout
	line: ParaLine
	h: Fx
}

/** Lines `[a, b)` of a note's body. */
interface FnPart {
	n: FnNote
	ls: FnLine[]
	a: number
	b: number
}

export interface FnMark {
	h: Fx
	parts: number
	carry: number
	full: boolean
}

/** Room left of the column for the number, in front of every body line. */
const hangOf = (n: FnNote): Fx => Math.floor(((n.paras[0]?.style.size ?? 0) * 3) / 2)

/** Body lines of `n` in a column `w` wide. */
// Tables and embeds in a footnote body are skipped; lay them out like fill.ts if needed.
function noteLines(n: FnNote, env: ItemizeEnv, w: Fx): FnLine[] {
	const out: FnLine[] = []
	const bw = Math.max(0, w - hangOf(n))
	n.paras.forEach((ip, pi) => {
		if (!Array.isArray(n.story.paragraphs[pi].runs)) return
		const pl = layoutParagraphAt(ip, env, bw)
		pl.lines.forEach((line, k) => {
			out.push({
				pi,
				pl,
				line,
				h: line.height + (k === 0 && out.length ? ip.style.spaceBefore : 0)
			})
		})
	})
	return out
}

/**
 * The footnote area of the current column: `h` is reserved at its bottom (separator included).
 * `fit` places the notes of a line row, `flush` paints the column's notes when it is done, `open`
 * starts the next column with the `carry` (bodies split at the previous column end). `full`: the
 * column ends in a split body, so no further ref may land in it (bodies stay in ref order).
 * All of it is fill state of a single pass, re-derived on every layout.
 */
// A carried body keeps the line breaks of the column it started in, and may fill a whole
// column (text at its top is then placed over it); re-break / cap the area if real documents hit it.
export class FootnoteArea {
	h: Fx = 0
	private parts: FnPart[] = []
	carry: FnPart[] = []
	private full = false

	constructor(private env: ItemizeEnv) {}

	mark(): FnMark {
		return { h: this.h, parts: this.parts.length, carry: this.carry.length, full: this.full }
	}

	reset(m: FnMark): void {
		this.h = m.h
		this.parts.length = m.parts
		this.carry.length = m.carry
		this.full = m.full
	}

	/**
	 * Place the bodies of `notes` (refs of a row whose bottom is `used` below `col`'s top): whole
	 * while they fit, the last one split across columns. False, with nothing changed, when a body
	 * cannot start in this column — unless `top` (the row is at the column top, moving it on would
	 * not help): then whatever does not fit goes to the next column.
	 */
	fit(notes: FnNote[], col: Box, used: Fx, top: boolean): boolean {
		const room = col.h - used
		let h = this.h
		let spill = this.full
		const parts: FnPart[] = []
		const carry: FnPart[] = []
		for (const n of notes) {
			const ls = noteLines(n, this.env, col.w)
			if (!ls.length) continue
			if (spill) {
				if (!top) return false
				carry.push({ n, ls, a: 0, b: ls.length })
				continue
			}
			let b = 0
			let need = h ? 0 : FN_SEP
			while (b < ls.length && h + need + ls[b].h <= room) need += ls[b++].h
			if (!b && !top) return false
			if (b) {
				parts.push({ n, ls, a: 0, b })
				h += need
			}
			if (b < ls.length) {
				carry.push({ n, ls, a: b, b: ls.length })
				spill = true
			}
		}
		this.h = h
		this.full = spill
		this.parts.push(...parts)
		this.carry.push(...carry)
		return true
	}

	/** A new column: place the carry while it fits (at least one line in an empty area). */
	open(col: Box): void {
		const c = this.carry
		this.carry = []
		for (const e of c) {
			if (this.full) {
				this.carry.push(e)
				continue
			}
			let b = e.a
			let need = this.h ? 0 : FN_SEP
			while (b < e.ls.length && this.h + need + e.ls[b].h <= col.h) need += e.ls[b++].h
			if (b === e.a && !this.h) need += e.ls[b++].h
			if (b > e.a) {
				this.parts.push({ ...e, b })
				this.h += need
			}
			if (b < e.ls.length) {
				this.carry.push({ ...e, a: b })
				this.full = true
			}
		}
	}

	/**
	 * Paint the column's notes on `pg` at the bottom of `col`: the separator rule (untagged), then
	 * each body with its number in the hang (on its first line only); one `Note` tag per note per
	 * page, its body paragraphs as `P` children. Clears the area (not the carry).
	 */
	flush(pg: PageDL, col: Box): void {
		let y = col.y + col.h - this.h
		if (this.parts.length) {
			const ry = y + Math.floor(FN_SEP / 2)
			const x2 = col.x + Math.floor(col.w / 3)
			pg.items.push({
				k: 'line',
				x1: col.x,
				y1: ry,
				x2,
				y2: ry,
				color: '#000000',
				width: FN_RULE
			})
			y += FN_SEP
		}
		for (const { n, ls, a, b } of this.parts) {
			const kids: TagNode[] = []
			pg.tags.push({ id: n.tag, role: 'Note', children: kids })
			const x = col.x + hangOf(n)
			for (let k = a; k < b; k++) {
				const { pi, pl, line, h } = ls[k]
				const ip = n.paras[pi]
				const top = y + h - line.height
				const tag = n.tag + 1 + pi
				if (kids[kids.length - 1]?.id !== tag) {
					const bid = n.story.paragraphs[pi].bid
					kids.push({ id: tag, role: 'P', bid, ...(ip.lang ? { lang: ip.lang } : {}) })
				}
				if (k === 0) {
					pg.items.push({
						k: 'glyphs',
						font: ip.font,
						size: ip.style.size,
						color: ip.style.color,
						x: col.x,
						y: top + line.baseline,
						...textGlyphs(this.env, ip.font, ip.style.size, String(n.num), [], ip.lang),
						tag: n.tag
					})
				}
				pg.items.push(...emitLine(pl, line, x, top, tag))
				pg.lines.push(lineGeom(n.story.id, n.story.paragraphs[pi].bid, line, x, top))
				y += h
			}
		}
		this.h = 0
		this.parts = []
		this.full = false
	}
}

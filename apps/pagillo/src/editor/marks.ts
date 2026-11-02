// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Hidden-character marks (View › Show hidden characters) of one page, in pt, from the page's
 * `PlacedLine`s and the story text. Overlay only: never in layout, thumbnails or export.
 */

import { FX } from '@cloudillo/typeset'
import type * as Y from 'yjs'

import { deltaOf, opsAt, storyTextOf } from '../crdt/delta-cache'
import { flowStories, framesOf } from '../crdt/entities'
import type { StoredTextFrameData, YPagilloDocument } from '../crdt/stored-types'
import { type DeltaOp, markerWins } from '../crdt/type-converters'
import { type GeomIndex, type PlacedLine, rotAttr } from './caret'
import { columnAt, type PageInfo } from './frames'

export type EmbedKind = 'field' | 'fn' | 'frame' | 'frame-unused'

export type MarkKind =
	| 'space'
	| 'nbsp'
	| 'ideo'
	| 'tab'
	| 'shy'
	| 'zw'
	| 'para'
	| 'lbr'
	| 'end'
	| 'page'
	| 'column'
	| 'frame'
	| 'frame-unused'
	| 'field'
	| 'fn'

/**
 * One mark, pt. Glyphs and ticks: `x` (spacing glyphs: centre), baseline `y`, font `size`.
 * Rules (`page` / `column`): `x`..`x2` at baseline `y`, `label` an i18n key.
 * Tints (`field` / `fn`): box `x`..`x2`, top `y`, height `size`.
 */
export interface Mark {
	k: MarkKind
	x: number
	y: number
	size: number
	rot?: string
	x2?: number
	label?: string
}

export interface MarksCtx {
	text(story: string): string
	/** Story offset → inline embed kind (embeds the overlay marks). */
	embeds(story: string): Map<number, EmbedKind>
	/** Lines of the story in flow order (`GeomIndex.stories`). */
	storyLines(story: string): PlacedLine[]
	/**
	 * `'end'`: `#` (the last section, a text box). Else a plain `¶` (a section boundary is not a
	 * character: the page label shows it) or, on footnotes, nothing past the `¶`.
	 */
	storyEnd(story: string): 'end' | 'none'
	/** Right edge of the line's column, Fx; absent = the paragraph's widest line on the page. */
	colRight?(pl: PlacedLine): number | undefined
}

const pt = (fx: number) => fx / FX

const CENTRED: Record<string, MarkKind> = {
	' ': 'space',
	'\u00a0': 'nbsp',
	'\u202f': 'nbsp',
	'\u3000': 'ideo',
	'\t': 'tab',
	'\u00ad': 'shy'
}
const ZW = /[\u200b\u2060\ufeff\u200e\u200f\u202a-\u202e\u2066-\u2069]/
const LBR = /[\v\u2028]/
const BRK_LABEL = { page: 'Page break', column: 'Column break' } as const

const positions = new WeakMap<PlacedLine[], Map<PlacedLine, number>>()
function indexIn(sl: PlacedLine[], pl: PlacedLine): number {
	let m = positions.get(sl)
	if (!m) {
		m = new Map(sl.map((l, i) => [l, i]))
		positions.set(sl, m)
	}
	return m.get(pl) ?? -1
}

/** A marker the selected frame's own anchor glyph already draws (`FrameOverlay`): not marked. */
export interface MarkSkip {
	story: string
	at: number
	page: number
}

export function pageMarks(lines: PlacedLine[], ctx: MarksCtx, skip?: MarkSkip): Mark[] {
	const out: Mark[] = []
	for (const pl of lines) {
		const l = pl.line
		const text = ctx.text(l.story)
		const emb = ctx.embeds(l.story)
		const cx = (o: number) => pt(l.carets[o - pl.from])
		const y = pt(l.y)
		const size = 0.8 * pt(l.ascent)
		const rot = rotAttr(l.rot)
		const add = (m: Omit<Mark, 'y' | 'size' | 'rot'> & Partial<Mark>) => {
			out.push({ y, size, ...m, ...(rot && { rot }) })
		}
		const paraEnd = pl.to >= text.length || text[pl.to] === '\n'
		for (let o = pl.from; o < pl.to; o++) {
			const ch = text[o]
			const c = CENTRED[ch] ?? (ch >= '\u2000' && ch <= '\u200a' ? 'space' : undefined)
			if (c) {
				// A soft hyphen ending a hyphenated line: the engine paints the hyphen.
				if (c === 'shy' && o === pl.to - 1 && !paraEnd) continue
				const a = cx(o)
				const b = cx(o + 1)
				if (c === 'tab' && a === b) {
					add({ k: 'zw', x: a })
					add({ k: 'tab', x: a, y: y - 0.75 * size, size: 0.6 * size })
				} else add({ k: c, x: (a + b) / 2 })
			} else if (ZW.test(ch)) add({ k: 'zw', x: cx(o) })
			else if (LBR.test(ch)) add({ k: 'lbr', x: cx(o) })
			else if (ch === '\ufffc') {
				const k = emb.get(o)
				if (k === 'field' || k === 'fn')
					add({
						k,
						x: cx(o),
						x2: cx(o + 1),
						y: pt(l.y - l.ascent),
						size: pt(l.ascent + l.descent)
					})
				else if (skip?.story === l.story && skip.at === o && skip.page === pl.page) continue
				else if (k === 'frame') add({ k, x: cx(o) })
				else if (k === 'frame-unused') add({ k, x: cx(o), label: 'Unused anchor' })
			}
		}
		const sl = ctx.storyLines(l.story)
		const i = indexIn(sl, pl)
		const right = () => {
			const r = ctx.colRight?.(pl)
			if (r !== undefined) return pt(r)
			let m = 0
			for (const s of sl)
				if (s.page === pl.page && s.line.bid === l.bid)
					m = Math.max(m, s.line.carets[s.line.carets.length - 1])
			return pt(m)
		}
		// A break paragraph first in its story: the rule just above its first line.
		if (l.brk && l.from === 0 && i <= 0)
			add({
				k: l.brk,
				x: pt(l.x),
				x2: right(),
				y: pt(l.y - l.ascent) - 0.3 * size,
				label: BRK_LABEL[l.brk]
			})
		if (!paraEnd) continue
		const x = cx(pl.to)
		const last = !pl.cell && pl.to >= text.length - 1
		const end = last ? ctx.storyEnd(l.story) : 'none'
		add({ k: end === 'end' ? 'end' : 'para', x })
		const next = i >= 0 ? sl[i + 1] : undefined
		const brk = next?.line.from === 0 ? next.line.brk : undefined
		if (brk)
			add({
				k: brk,
				x: x + 0.7 * size,
				x2: right(),
				y: y - 0.3 * size,
				label: BRK_LABEL[brk]
			})
	}
	return out
}

const embedMaps = new WeakMap<DeltaOp[], Map<number, EmbedKind>>()

/**
 * Offset → kind of the story's `{ field }`, `{ fn }` and `{ frame }` embeds, cached per delta.
 * Any non-empty marker reads 'frame' here; `marksCtx` demotes the non-winners (they depend on `doc.f`).
 */
export function embedsOf(t: Y.Text): Map<number, EmbedKind> {
	const ops = deltaOf(t)
	let m = embedMaps.get(ops)
	if (!m) {
		m = new Map()
		for (const [op, o] of opsAt(ops)) {
			const ins = op.insert
			if (ins && typeof ins === 'object') {
				const e = ins as Record<string, unknown>
				if ('field' in e) m.set(o, 'field')
				else if ('fn' in e) m.set(o, 'fn')
				else if ('frame' in e) m.set(o, e.frame ? 'frame' : 'frame-unused')
			}
		}
		embedMaps.set(ops, m)
	}
	return m
}

const NO_EMBEDS = new Map<number, EmbedKind>()

/** `MarksCtx` of the live document; `info(page)` = the global page's `PageDL.page`. */
export function marksCtx(
	doc: YPagilloDocument,
	index: GeomIndex,
	info: (page: number) => PageInfo | undefined
): MarksCtx {
	const flows = flowStories(doc)
	const last = [...flows.keys()].pop()
	let boxStories: Set<string> | undefined
	// Only a section flow story's winning markers (`markerWins`) count; the rest are unused.
	const classified = new Map<string, Map<number, EmbedKind>>()
	return {
		text: (s) => {
			const t = doc.tx.get(s)
			return t ? storyTextOf(t) : ''
		},
		embeds: (s) => {
			const t = doc.tx.get(s)
			if (!t) return NO_EMBEDS
			let m = classified.get(s)
			if (!m) {
				const raw = embedsOf(t)
				let wins: Set<number> | undefined
				m = new Map(raw)
				for (const [o, k] of raw) {
					if (k !== 'frame') continue
					wins ??= new Set(
						flows.has(s) ? [...markerWins(doc, s).values()].map((w) => w.at) : []
					)
					if (!wins.has(o)) m.set(o, 'frame-unused')
				}
				classified.set(s, m)
			}
			return m
		},
		storyLines: (s) => index.stories.get(s) ?? [],
		storyEnd: (s) => {
			if (flows.has(s)) return s === last ? 'end' : 'none'
			boxStories ??= new Set(
				framesOf(doc).flatMap(([, f]) => {
					const st = f.t === 'txt' && (f.data as StoredTextFrameData).story
					return st ? [st] : []
				})
			)
			return boxStories.has(s) ? 'end' : 'none'
		},
		colRight: (pl) => {
			const l = pl.line
			if (l.cell) return l.cell.x + l.cell.w
			const pg = flows.has(l.story) && !l.rot ? info(pl.page) : undefined
			if (!pg) return
			const c = columnAt(doc, pg, l.x, l.y)
			return c.x + c.w
		}
	}
}

// vim: ts=4

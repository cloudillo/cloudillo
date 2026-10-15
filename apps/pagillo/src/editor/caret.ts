// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Caret & selection model. Positions are Y.Text story offsets on the main thread, mapped to and
 * from the worker's `LineGeom` (no layout here). `LineGeom.from/to` are paragraph-relative;
 * `indexGeom` adds each paragraph's Y.Text start (`paragraphStarts`).
 */

import type * as Y from 'yjs'
import { FX, type LineGeom, type PageDL, type Rot } from '@cloudillo/typeset'

import type { YPagilloDocument } from '../crdt/stored-types'
import { deltaOf, storyTextOf } from '../crdt/delta-cache'
import { paragraphStarts, tableCells } from '../crdt/type-converters'

/** Local selection: Y.Text offsets within one story (never across stories). */
export interface EditorSelection {
	story: string
	anchor: number
	head: number
}

export const selFrom = (s: EditorSelection) => Math.min(s.anchor, s.head)
export const selTo = (s: EditorSelection) => Math.max(s.anchor, s.head)

/** A laid-out line with Y.Text offsets. */
export interface PlacedLine {
	line: LineGeom
	/** Global page index. */
	page: number
	from: number
	to: number
	/** Table cell paragraphs: row and cell id (`tableCells`). */
	cell?: { row: string; cell: string }
}

export interface GeomIndex {
	/** Lines of each story in flow order. */
	stories: Map<string, PlacedLine[]>
	/** Lines on each page (global index). */
	pages: Map<number, PlacedLine[]>
}

/** Caret drawing box, page space Fx. */
export interface CaretBox {
	page: number
	x: number
	top: number
	bottom: number
	/** The line's frame rotation: draw with `rotAttr`. */
	rot?: Rot
}

/** Page-space rectangle, Fx. */
export interface Rect {
	x: number
	y: number
	w: number
	h: number
	rot?: Rot
}

/** SVG `transform` drawing line geometry with its frame's rotation (page space in pt). */
export const rotAttr = (rot?: Rot) =>
	rot ? `rotate(${rot.deg} ${rot.cx / FX} ${rot.cy / FX})` : undefined

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const words = new Intl.Segmenter(undefined, { granularity: 'word' })

/** Story text with U+FFFC per embed (`Y.Text#toString` drops embeds). */
export const storyText = (t: Y.Text): string => storyTextOf(t)

/** Last caret offset: before the story's final '\n'. */
export const storyEnd = (txt: string) => (txt.endsWith('\n') ? txt.length - 1 : txt.length)

/** Lines of the laid-out pages (`keys` = page keys in flow order) with Y.Text offsets. */
export function indexGeom(
	pages: Map<string, PageDL>,
	keys: string[],
	doc: YPagilloDocument
): GeomIndex {
	const stories = new Map<string, PlacedLine[]>()
	const byPage = new Map<number, PlacedLine[]>()
	const starts = new Map<
		string,
		{ st: Map<string, number>; cells: Map<string, { row: string; cell: string }> }
	>()
	keys.forEach((key, page) => {
		const dl = pages.get(key)
		if (!dl) return
		const list: PlacedLine[] = []
		for (const line of dl.lines) {
			let sm = starts.get(line.story)
			if (!sm) {
				const t = doc.tx.get(line.story)
				const ops = t ? deltaOf(t) : []
				sm = { st: paragraphStarts(ops), cells: tableCells(ops) }
				starts.set(line.story, sm)
			}
			// A bid missing from the story is a stale layout of a deleted paragraph: no offsets.
			const s = sm.st.get(line.bid)
			if (s === undefined) continue
			const cell = sm.cells.get(line.bid)
			const pl: PlacedLine = {
				line,
				page,
				from: s + line.from,
				to: s + line.to,
				...(cell && { cell })
			}
			list.push(pl)
			let sl = stories.get(line.story)
			if (!sl) {
				sl = []
				stories.set(line.story, sl)
			}
			sl.push(pl)
		}
		byPage.set(page, list)
	})
	for (const sl of stories.values()) sl.sort((a, b) => a.from - b.from)
	return { stories, pages: byPage }
}

/** The line showing `off`: at a soft wrap the next line; between lines the previous one. */
export function lineAt(lines: PlacedLine[], off: number): PlacedLine | undefined {
	let prev: PlacedLine | undefined
	for (const pl of lines) {
		if (pl.from > off) break
		if (off < pl.to) return pl
		prev = pl
	}
	return prev ?? lines[0]
}

export function caretX(pl: PlacedLine, off: number): number {
	const c = pl.line.carets
	return c[Math.max(0, Math.min(c.length - 1, off - pl.from))]
}

export function caretBox(lines: PlacedLine[], off: number): CaretBox | undefined {
	const pl = lineAt(lines, off)
	if (!pl) return
	const l = pl.line
	return {
		page: pl.page,
		x: caretX(pl, off),
		top: l.y - l.ascent,
		bottom: l.y + l.descent,
		...(l.rot ? { rot: l.rot } : {})
	}
}

/** Offset of the caret position on `pl` nearest `x`. */
export function nearestCaret(pl: PlacedLine, x: number): number {
	const c = pl.line.carets
	let best = 0
	for (let i = 1; i < c.length; i++) if (Math.abs(c[i] - x) < Math.abs(c[best] - x)) best = i
	return pl.from + best
}

/** Horizontal distance from `x` to the line's caret span; 0 inside it. */
export const xDist = (l: PlacedLine, x: number) => {
	const c = l.line.carets
	return Math.max(0, c[0] - x, x - c[c.length - 1])
}

/** Both lines are segments of one row (a row split around a frame). */
export const sameRow = (a: PlacedLine, b: PlacedLine) =>
	a.page === b.page && a.line.bid === b.line.bid && a.line.row === b.line.row

/**
 * Up/down one line row (across columns and pages) keeping goal x. A row wrapped around a frame
 * holds several lines sharing a baseline; the one spanning goal x (else the nearest) is taken.
 */
export function lineMove(lines: PlacedLine[], off: number, dir: -1 | 1, goalX: number): number {
	const pl = lineAt(lines, off)
	if (!pl) return off
	let i = lines.indexOf(pl)
	while (lines[i] && sameRow(lines[i], pl)) i += dir
	// Off the caret cell's edge into another cell of its table row: skip the whole row.
	const row = pl.cell?.row
	if (row && lines[i]?.cell?.row === row && lines[i].cell?.cell !== pl.cell?.cell)
		while (lines[i]?.cell?.row === row) i += dir
	const next = lines[i]
	if (!next) return dir < 0 ? lines[0].from : lines[lines.length - 1].to
	let best = next
	const nrow = next.cell?.row
	if (nrow && nrow !== row) {
		// Into a table row: each cell's first (down) / last (up) line, nearest goal x.
		const seen = new Set<string>()
		for (let k = i; lines[k]?.cell?.row === nrow; k += dir) {
			const c = lines[k].cell?.cell ?? ''
			if (seen.has(c)) continue
			seen.add(c)
			if (xDist(lines[k], goalX) < xDist(best, goalX)) best = lines[k]
		}
	} else {
		for (let k = i; lines[k] && sameRow(lines[k], next); k += dir) {
			if (xDist(lines[k], goalX) < xDist(best, goalX)) best = lines[k]
		}
	}
	return nearestCaret(best, goalX)
}

/** Page up/down: the story's line on the next page nearest the same baseline, at goal x. */
export function pageMove(lines: PlacedLine[], off: number, dir: -1 | 1, goalX: number): number {
	const pl = lineAt(lines, off)
	if (!pl) return off
	let cand = lines.filter((l) => l.page === pl.page + dir)
	if (!cand.length) {
		const beyond = lines.filter((l) => (dir > 0 ? l.page > pl.page : l.page < pl.page))
		if (!beyond.length) return dir < 0 ? lines[0].from : lines[lines.length - 1].to
		const page = dir > 0 ? beyond[0].page : beyond[beyond.length - 1].page
		cand = beyond.filter((l) => l.page === page)
	}
	let best = cand[0]
	for (const l of cand) {
		const d = Math.abs(l.line.y - pl.line.y) - Math.abs(best.line.y - pl.line.y)
		if (d < 0 || (d === 0 && xDist(l, goalX) < xDist(best, goalX))) best = l
	}
	return nearestCaret(best, goalX)
}

/** Home/End of the visual line. */
// No caret affinity — End on a soft-wrapped line stops before the trailing space
// (its end offset is the next line's start); add affinity to EditorSelection if that bothers.
export function lineEdge(lines: PlacedLine[], off: number, dir: -1 | 1): number {
	const pl = lineAt(lines, off)
	if (!pl) return off
	if (dir < 0) return pl.from
	const next = lines[lines.indexOf(pl) + 1]
	return next && next.from === pl.to && pl.to > pl.from ? pl.to - 1 : pl.to
}

/** One grapheme left/right, within `[0, end]`. */
export function charMove(txt: string, off: number, dir: -1 | 1, end: number): number {
	if (dir < 0) {
		if (off <= 0) return 0
		const a = Math.max(0, off - 32)
		let last = a
		for (const s of graphemes.segment(txt.slice(a, off))) last = a + s.index
		return last
	}
	if (off >= end) return end
	const s = graphemes.segment(txt.slice(off, off + 32)).containing(0)
	return Math.min(end, off + (s?.segment.length ?? 1))
}

const paraStart = (txt: string, off: number) => txt.lastIndexOf('\n', off - 1) + 1
const paraEnd = (txt: string, off: number) => {
	const e = txt.indexOf('\n', off)
	return e < 0 ? txt.length : e
}

/** Previous word start / next word end (`Intl.Segmenter` words); paragraph edges stop once. */
export function wordMove(txt: string, off: number, dir: -1 | 1): number {
	if (dir < 0) {
		const ps = paraStart(txt, off)
		if (off === ps) return Math.max(0, off - 1)
		let to = ps
		for (const s of words.segment(txt.slice(ps, off))) if (s.isWordLike) to = ps + s.index
		return to
	}
	const pe = paraEnd(txt, off)
	if (off === pe) return Math.min(txt.length, off + 1)
	for (const s of words.segment(txt.slice(off, pe)))
		if (s.isWordLike) return off + s.index + s.segment.length
	return pe
}

/** Word around `off` (double click). */
export function wordAt(txt: string, off: number): [number, number] {
	const ps = paraStart(txt, off)
	const pe = paraEnd(txt, off)
	if (pe === ps) return [off, off]
	const s = words.segment(txt.slice(ps, pe)).containing(Math.min(off - ps, pe - ps - 1))
	return s ? [ps + s.index, ps + s.index + s.segment.length] : [off, off]
}

/** Paragraph around `off`, without its '\n' (triple click). */
export function paragraphAt(txt: string, off: number): [number, number] {
	return [paraStart(txt, off), paraEnd(txt, off)]
}

/** Drag after a double/triple click: grow the original unit `[a, b)` by whole units toward `off`. */
export function extendByUnit(
	txt: string,
	a: number,
	b: number,
	off: number,
	unit: 'word' | 'para'
): [anchor: number, head: number] {
	const [ua, ub] = unit === 'word' ? wordAt(txt, off) : paragraphAt(txt, off)
	return off < a ? [b, ua] : [a, Math.max(b, ub)]
}

/** Ctrl+Up: this / previous paragraph start; Ctrl+Down: next paragraph start. */
export function paragraphMove(txt: string, off: number, dir: -1 | 1): number {
	if (dir > 0) return Math.min(txt.length, paraEnd(txt, off) + 1)
	const ps = paraStart(txt, off)
	return ps < off ? ps : paraStart(txt, Math.max(0, ps - 1))
}

/** Selection rectangles per page for `[a, b)`; a line the selection runs past gets a stub. */
export function selectionRects(lines: PlacedLine[], a: number, b: number): Map<number, Rect[]> {
	const out = new Map<number, Rect[]>()
	for (const pl of lines) {
		if (pl.from >= b || pl.to < a || (pl.to === a && pl.from < a)) continue
		const x1 = caretX(pl, Math.max(a, pl.from))
		const x2 = caretX(pl, Math.min(b, pl.to)) + (b > pl.to ? 3 * FX : 0)
		if (x2 <= x1) continue
		const l = pl.line
		let r = out.get(pl.page)
		if (!r) {
			r = []
			out.set(pl.page, r)
		}
		r.push({
			x: x1,
			y: l.y - l.ascent,
			w: x2 - x1,
			h: l.ascent + l.descent,
			...(l.rot ? { rot: l.rot } : {})
		})
	}
	return out
}

/** `off` moved through a remote `Y.YTextEvent#delta` (an insert exactly at `off` lands after it). */
export function mapOffset(
	delta: { retain?: number; insert?: unknown; delete?: number }[],
	off: number
): number {
	let old = 0
	let out = off
	for (const d of delta) {
		if (old >= off) break
		if (d.retain) old += d.retain
		else if (d.delete) {
			out -= Math.min(d.delete, off - old)
			old += d.delete
		} else if (d.insert !== undefined) {
			out += typeof d.insert === 'string' ? d.insert.length : 1
		}
	}
	return out
}

/** Advance (Fx) of `ch` as laid out on `dl` (optimistic echo), else `fallback`. */
// First glyph of that character on the page, whatever its font/size; key by
// font+size if the echo visibly jumps on mixed formatting.
export function glyphAdvance(dl: PageDL | undefined, ch: string, fallback: number): number {
	for (const it of dl?.items ?? []) {
		if (it.k !== 'glyphs') continue
		for (let i = 0; i < it.clusters.length; i++)
			if (it.text[it.clusters[i]] === ch) return it.advances[i]
	}
	return fallback
}

// vim: ts=4

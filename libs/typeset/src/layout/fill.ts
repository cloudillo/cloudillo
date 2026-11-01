// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { DLItem, PageDL, TagNode, TagRole } from '../display-list.js'
import type { Fx } from '../fixed.js'
import type { Box, Frame, Story } from '../model.js'
import type { ItemizedParagraph, ItemizeEnv } from '../text/itemize.js'
import {
	type Exclusion,
	freeSpan,
	freeSpans,
	moved,
	nextFreeTop,
	type Span,
	wrapExclusions
} from './exclusions.js'
import { dropCap, emitLine, layoutParagraph, layoutParagraphAt, lineGeom } from './paragraph.js'
import { type FnMark, type FnNote, FootnoteArea } from './footnotes.js'
import { emitRows, rowsH, tableAt, tableTagCount } from './table.js'
import type { TocBlock, TocSlot } from './toc.js'

/** An embed record's alt text (`alt`), when set and not blank. */
export const embedAlt = (d: Record<string, unknown>): string | undefined =>
	typeof d.alt === 'string' && d.alt.trim() ? d.alt : undefined

/** One column to fill: the page it lies on and its rectangle in page space. */
export interface FlowSlot {
	pg: PageDL
	col: Box
	/** Wrap exclusions of the page (page space); absent = none. */
	ex?: Exclusion[]
	/**
	 * The column set the slot belongs to, as one box across all its columns (multi-column regions
	 * only; one object per set, so a new set is a new box). A span band's slot carries its own box.
	 */
	region?: Box
}

/**
 * Hands out the next column. `'page'` skips the rest of the page's columns; `'band'` ends the
 * current column set and returns a box across its whole region from page-space `top` down (no room:
 * the next multi-column region's set, as a band); `'cols'` starts a new set of the current region's
 * columns at `top` (no room: the next region's columns). `undefined` = no more pages.
 */
export type NextSlot = (kind?: 'page' | 'band' | 'cols', top?: Fx) => FlowSlot | undefined

/**
 * The winning text-anchor marker (`{ frame }` run) of a text-anchored frame in the flow's story:
 * paragraph index, offset in that paragraph, and the frame (`anchor.txt` = the story).
 */
export interface FrameMark {
	pi: number
	at: number
	f: Frame
}

/** A text-anchored frame placed by `fillFlow`: its page, page-space box and rotation as painted. */
export interface AnchorPlace {
	id: string
	pg: PageDL
	box: Box
	/** The frame's `rot`; negated for a `rel: 'page'` frame mirrored on a left-hand page. */
	rot: number
	/** A `rel: 'page'` frame not on its marker's page (deferred, or kept back at a section end). */
	late?: true
}

const isPage = (m: FrameMark) => 'txt' in m.f.anchor && m.f.anchor.rel === 'page'

/**
 * A `rel: 'page'` frame on `page`: `x`/`y`/`w`/`h` are right-hand-page coordinates, mirrored (x and
 * `rot`) on a left-hand page; scaled down (aspect kept) when larger than the page, moved into it.
 */
function pageFrame(f: Frame, page: PageDL['page']): Frame {
	const num = (v: number) => (Number.isFinite(v) ? v : 0)
	let w = Math.max(0, num(f.w))
	let h = Math.max(0, num(f.h))
	if (w > page.w) {
		h = Math.floor((h * page.w) / w)
		w = page.w
	}
	if (h > page.h) {
		w = Math.floor((w * page.h) / h)
		h = page.h
	}
	const left = page.side === 'l'
	const x = left ? page.w - num(f.x) - w : num(f.x)
	return {
		...f,
		x: Math.max(0, Math.min(x, page.w - w)),
		y: Math.max(0, Math.min(num(f.y), page.h - h)),
		w,
		h,
		rot: (left ? -num(f.rot) : num(f.rot)) || 0
	}
}

/** Whether an item already on `pg` overlaps the bounds of `ex` (glyphs: advance × size above the baseline). */
function covers(pg: PageDL, ex: Exclusion[]): boolean {
	return pg.items.some((q) => {
		const b: Box | undefined =
			q.k === 'glyphs'
				? { x: q.x, y: q.y - q.size, w: q.advances.reduce((s, a) => s + a, 0), h: q.size }
				: 'box' in q
					? q.box
					: undefined
		return (
			!!b && ex.some((e) => b.x < e.x1 && e.x0 < b.x + b.w && b.y < e.y1 && e.y0 < b.y + b.h)
		)
	})
}

/** Fill state at a paragraph start, restored for the one-time refill of a page (`rel: 'page'`). */
interface Snap {
	i: number
	slot: FlowSlot
	y: Fx
	off: number
	pageTop: boolean
	low: Fx
	inBand: boolean
	childTag: number
	tociTag: number
	toc: number
	out: number
	fa?: ReturnType<FootnoteArea['save']>
	items: number
	lines: number
	tags: number
	/** Restores the caller's `next` state (`anchors.save`). */
	back?: () => void
}

/** Narrowest usable free width beside a frame, in em of the paragraph (plus its indents). */
// Fixed 2 em; make it a paragraph prop if designers want slivers kept or dropped.
const WRAP_MIN_EM = 2
// ponytail: fixed ceilings on wrap re-layout passes, per band growth (ITER) and per paragraph
// (PASS); past either the band jumps to a bound no row can exceed, so text may sit lower beside a
// frame than needed but never overlaps it. Raise them if real documents hit them (constants, so
// layout stays deterministic).
const WRAP_ITER_MAX = 16
const WRAP_PASS_MAX = 64

/**
 * Flow the story's itemized paragraphs (`paras[i]` ↔ `story.paragraphs[i]`) through the columns
 * `next()` hands out, in order. `next()` creates pages as it needs them, and returns `undefined`
 * when no more may be created; `next('page')` skips the rest of the current page's columns. It is
 * called once up front, so even an empty story gets a column.
 * A line moves to the next column when it does not fit; a line taller than its column is placed
 * anyway at the column top. Space before is dropped at a column top. When a paragraph continues
 * into a column of another width, it is re-broken from that line on (the lines before it are
 * unchanged: greedy breaking only looks back).
 * Wrap: a line row takes every free interval of at least `WRAP_MIN_EM` of its column across its
 * band (`slot.ex`), one line each, left to right; a band with less than `WRAP_MIN_EM` free moves
 * down past the frames in the way.
 * Orphans and widows count rows.
 * Paragraph rules: `breakBefore` starts a new column/page (not at the top of one already);
 * `keepTogether` and `orphans` move a paragraph that would split badly whole to the next column,
 * and `widows` breaks it earlier — all within the paragraph, never re-placing an earlier one.
 * `keepNext` is measured ahead instead: the paragraph moves on when it, the following keepNext
 * paragraphs and the head of the one after (its first `orphans` lines, or all with
 * `keepTogether`) do not fit the rest of the column — unless they would not fit a fresh one.
 * Inline image/embed blocks (`EmbedBlock`) are never split; `paras[i]` of one is its caption
 * (itemized as the paragraph's text, or empty), which gets no `LineGeom`.
 * Tables (`layout/table.ts`) place whole row groups while they fit the column; a group taller than
 * a fresh column is clipped. The last header group keeps its first body group, and header rows
 * repeat (as an artifact) atop every continuation column. Rows move down past wrap exclusions,
 * never beside them. All of this is re-derived on every pass: no state outlives a layout.
 * Tags: one per paragraph per page, `id` = paragraph index + 1 (the same id on every page the
 * paragraph touches); a table's TR/TH/TD ids follow `1..paragraphs.length`, each table its
 * `tableTagCount` range in story order (`storyTagCount` in all). `LineGeom.from/to` are
 * paragraph-relative (`ParaLayout` line offsets); cell lines carry their cell paragraph's `bid`.
 * Footnotes (`notes`, refs of text paragraphs, `layout/footnotes.ts`): a line row with refs is
 * placed only when every body can start in the same column below it (bodies go to the column
 * bottom, the last one may continue in the next column); otherwise the row moves on like an
 * overflowing one. Everything else stops above the footnote area. Bodies left over at the story's
 * end get further columns. The area (reserved height, placed and carried bodies) is fill state
 * of this pass, rolled back with the lines.
 * Span bands (`spanColumns`, multi-column regions, `slot.region`): the paragraph ends the column
 * set and lays out in a band across the region, starting below the set's lowest content on the page
 * (a column holding footnotes counts as full); the next non-spanning paragraph starts a new column
 * set below the band. A band that overflows continues in plain columns.
 * Drop caps (`dropCap`, `layout/paragraph.ts`): a paragraph-relative `Exclusion` beside the first n
 * lines, through the same wrap path as frames; the paragraph is at least as tall as its cap.
 * Text-anchored frames (`anchors.marks`; zero-width `{ frame }` marker runs), `rel: 'text'`:
 * `wCol` of the column wide (else `w`, at most the column), aspect kept from `w`/`h`, at the
 * anchor's `side` of the free span (on a left-hand page the sides swap: 'l' = inside) with `x`
 * inward, its top `y` below the reference — the paragraph's first line top for a marker at
 * offset 0, else the top of the row after the marker's row — stepping down past the frames in the
 * way. Its wrap outline joins the slot's exclusions, so only text after the reference wraps it. A
 * frame that would overrun the column (not at its top) moves on to the next column with the text
 * after it; a paragraph moved on whole takes its start frames along.
 * `rel: 'page'`: at the end of its marker's row the frame is pinned to the current page
 * (`PageDL.page.index`) at page coordinates (`x`/`y`/`w`/`h` of a right-hand page, no `wCol`;
 * mirrored with `rot` on a left-hand page; moved into the page, shrunk when larger), and its wrap
 * outline joins every slot of that page. When the outline overlaps content already on the page,
 * the page is refilled once: the fill state at the start of the paragraph in progress at the
 * page's top (`y`, `off`, footnote area, the page's items/lines/tags lengths, …) is restored
 * together with the caller's `next` state (`anchors.save()` returns its restore; pages created
 * since are dropped), and the flow re-runs with the pin in place; a pin is never undone. A pinned
 * frame whose marker does not come on its page moves to the next page (once, before that page
 * fills), and its page is refilled again without it, so it leaves no hole (at most two refills per
 * frame); it is placed on the next page, flagged `late`. When the text ends before that page,
 * the frame goes back to its page, refilled a third time with it (its marker goes on, as before
 * the deferral), and is placed there, also flagged `late`.
 * Placements go to `anchors.out` in flow order and are rolled back with the lines.
 * TOC (`toc.blocks`, paragraphs with a `{ toc }` embed, `layout/toc.ts`): the entries' lines in
 * order, moved past frames, a `TOC` tag (with the paragraph's bid) per page holding one `TOCI` (no bid,
 * ids from `toc.tag` on, one per entry in order) per entry on that page, and one `LineGeom` (the
 * paragraph's whole text, on its first line); the leader and number of each entry are placeholders
 * collected in `toc.out`. Its frame markers all anchor at the block start (`rel: 'page'` ones at
 * the end of its first line).
 * Returns the overset: story characters left unplaced (each paragraph counted as its text plus
 * one newline, a block as one) plus footnote body characters left unplaced, 0 when everything fit.
 */
// Columns above a span band are not balanced, so a mid-page band usually starts below a
// full first column (often on the next page); balance the set when mid-page spans are used.
export function fillFlow(
	story: Story,
	paras: ItemizedParagraph[],
	next: NextSlot,
	env: ItemizeEnv,
	notes?: FnNote[],
	toc?: { blocks: Map<number, TocBlock>; out: TocSlot[]; tag: number },
	anchors?: { marks: FrameMark[]; out: AnchorPlace[]; save: () => () => void }
): number {
	let total = 0
	for (let i = 0; i < paras.length; i++) {
		total += (Array.isArray(story.paragraphs[i].runs) ? paras[i].text.length : 0) + 1
	}
	const first = next()
	if (!first) return total
	let slot = first
	let y = 0
	let off = 0
	/** `slot` is the first column of its page. */
	let pageTop = true
	const fa = notes?.length ? new FootnoteArea(env) : undefined
	/** Footnote area height of the current column. */
	const fh = () => fa?.h ?? 0
	const notesOf = new Map<number, FnNote[]>()
	for (const n of notes ?? []) {
		const l = notesOf.get(n.pi)
		if (l) l.push(n)
		else notesOf.set(n.pi, [n])
	}
	const marksOf = new Map<number, FrameMark[]>()
	for (const m of anchors?.marks ?? []) {
		if (!('txt' in m.f.anchor) || (m.f.anchor.rel !== 'text' && m.f.anchor.rel !== 'page'))
			continue
		const l = marksOf.get(m.pi)
		if (l) l.push(m)
		else marksOf.set(m.pi, [m])
	}
	const placedOut = anchors?.out
	/**
	 * `rel: 'page'` frames pinned to a page (`page.index`); `moved` = deferred once, `back` = the
	 * snapshot to refill from and the page index it was deferred from (until sent back there).
	 * The snapshot may start on an earlier page (a paragraph in progress at the page's top).
	 * Never rolled back.
	 */
	const pins = new Map<
		string,
		{ f: Frame; index: number; moved: boolean; back?: { snap: Snap; index: number } }
	>()
	/** Some frame is `rel: 'page'`: take a snapshot at every paragraph start. */
	const pageMode = !!anchors?.marks.some(isPage)
	/** Snapshot at the current paragraph's start, and at the start of the one in progress at the page's top. */
	let paraSnap: Snap | undefined
	let pageSnap: Snap | undefined
	/** Snapshot of a page to refill without the pin deferred from it. */
	let redo: Snap | undefined
	const placeOnPage = (f: Frame, pg: PageDL, late?: boolean) => {
		const { x, y, w, h, rot } = pageFrame(f, pg.page)
		placedOut?.push({ id: f.id, pg, box: { x, y, w, h }, rot, ...(late ? { late: true } : {}) })
	}
	/** `s` with the wrap outlines of the frames pinned to its page. */
	const withPins = (s: FlowSlot): FlowSlot => {
		const fs: Frame[] = []
		for (const p of pins.values())
			if (p.index === s.pg.page.index) fs.push(pageFrame(p.f, s.pg.page))
		const e = fs.length ? wrapExclusions(fs) : []
		return e.length ? { ...s, ex: [...(s.ex ?? []), ...e] } : s
	}
	/** Page-space bottom of the content of the column set's earlier columns on this page. */
	let low = Number.NEGATIVE_INFINITY
	/** `slot` is a span band. */
	let inBand = false
	const advance = (kind?: 'page' | 'band' | 'cols', top?: Fx): boolean => {
		// Footnotes go to the column bottom, or right above where the next band / column set starts.
		const c =
			kind !== 'page' && top !== undefined ? { ...slot.col, h: top - slot.col.y } : slot.col
		const bottom = fh() ? c.y + c.h : c.y + y
		fa?.flush(slot.pg, c)
		const s = next(kind, top)
		if (!s) return false
		if (s.pg !== slot.pg) {
			const leaving = pageSnap
			pageSnap = paraSnap
			// Pinned frames whose marker did not come on their page: on to this one (before it
			// fills), once; after that, placed on the page they were moved to.
			for (const p of pins.values()) {
				if (p.index !== slot.pg.page.index || placedOut?.some((a) => a.id === p.f.id))
					continue
				if (p.moved) placeOnPage(p.f, slot.pg, true)
				else {
					// If a later advance runs out of pages before the refill, the hole stays.
					p.back = leaving && { snap: leaving, index: p.index }
					p.index = s.pg.page.index
					p.moved = true
					redo ??= leaving
				}
			}
		}
		low =
			s.pg === slot.pg && s.region === slot.region
				? Math.max(low, bottom)
				: Number.NEGATIVE_INFINITY
		pageTop = s.pg !== slot.pg || (pageTop && kind === 'band' && y === 0)
		inBand = kind === 'band'
		slot = withPins(s)
		y = 0
		fa?.open(slot.col)
		return true
	}
	/** Move `y` to where a full-width band `h` tall fits (past frames, else on to the next column). */
	const place = (h: Fx): boolean => {
		for (;;) {
			const { col, ex = [] } = slot
			if (ex.length) y = nextFreeTop(col, ex, col.y + y, h, col.w) - col.y
			if (!(y > 0 && y + h > col.h - fh())) return true
			if (!advance()) return false
		}
	}
	/**
	 * Place `m`'s frame in the current column (see above), its reference at flow y `top`; its wrap
	 * outline joins this column's slot (the next `advance` drops it). `false`, nothing placed,
	 * when it would overrun the column below a used band — unless `force`.
	 */
	const placeMark = (m: FrameMark, top: Fx, force: boolean): boolean => {
		const { f } = m
		const { pg, col, ex = [] } = slot
		const fin = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0)
		const wc = f.wCol
		let w = Math.min(
			col.w,
			wc !== undefined && Number.isFinite(wc) && wc > 0
				? Math.floor(col.w * Math.min(1, wc))
				: fin(f.w)
		)
		let h = f.w > 0 && Number.isFinite(f.w) ? Math.floor((fin(f.h) * w) / f.w) : fin(f.h)
		// At most the column's height (a remote peer's frame can be any size), aspect kept.
		if (h > col.h) {
			w = Math.floor((w * col.h) / h)
			h = col.h
		}
		const dx = fin(f.x)
		const dy = fin(f.y)
		const fy = nextFreeTop(col, ex, col.y + top + dy, h, w + dx) - col.y
		if (!force && fy > dy && fy + h > col.h - fh()) return false
		const free = freeSpan(col, ex, col.y + fy, col.y + fy + h)
		// Facing pages: 'l' is the inside, the right side of a left-hand page.
		const r = ('side' in f.anchor && f.anchor.side === 'r') !== (pg.page.side === 'l')
		const box: Box = { x: r ? free.x + free.w - w - dx : free.x + dx, y: col.y + fy, w, h }
		placedOut?.push({ id: f.id, pg, box, rot: Number.isFinite(f.rot) ? f.rot : 0 })
		const e = wrapExclusions([{ ...f, ...box }])
		if (e.length) slot = { ...slot, ex: [...ex, ...e] }
		return true
	}
	const isText = (k: number) => k < paras.length && Array.isArray(story.paragraphs[k].runs)
	/** First tag id of the next table's TR/TH/TD range (see `storyTagCount`). */
	let childTag = story.paragraphs.length + 1
	/** Next TOCI tag id (reserved by paginate after the story's and its footnotes' ranges). */
	let tociTag = toc?.tag ?? 0
	const snap = (i: number): Snap => ({
		i,
		slot,
		y,
		off,
		pageTop,
		low,
		inBand,
		childTag,
		tociTag,
		toc: toc?.out.length ?? 0,
		out: placedOut?.length ?? 0,
		fa: fa?.save(),
		items: slot.pg.items.length,
		lines: slot.pg.lines.length,
		tags: slot.pg.tags.length,
		back: anchors?.save()
	})
	/** Back to `s` (the caller's later pages dropped); returns the paragraph index before `s.i`. */
	const restore = (s: Snap): number => {
		s.back?.()
		// The new pin too, when `s` is on the page to refill (its first one).
		slot = withPins(s.slot)
		y = s.y
		off = s.off
		pageTop = s.pageTop
		low = s.low
		inBand = s.inBand
		childTag = s.childTag
		tociTag = s.tociTag
		slot.pg.items.length = s.items
		slot.pg.lines.length = s.lines
		slot.pg.tags.length = s.tags
		if (s.fa) fa?.load(s.fa)
		if (toc) toc.out.length = s.toc
		if (placedOut) placedOut.length = s.out
		pageSnap = s
		return s.i - 1
	}
	/**
	 * `rel: 'page'` frame of `m` at its marker's row end (see above). `true`: its outline overlaps
	 * content already on the page, which must be refilled (the pin stays, so only once).
	 */
	const pageMark = (m: FrameMark): boolean => {
		const { pg } = slot
		const p = pins.get(m.f.id)
		if (p) {
			// Pinned elsewhere: placed when the flow left that page.
			if (p.index === pg.page.index) placeOnPage(m.f, pg, p.moved)
			return false
		}
		pins.set(m.f.id, { f: m.f, index: pg.page.index, moved: false })
		const e = wrapExclusions([pageFrame(m.f, pg.page)])
		if (covers(pg, e)) return true
		placeOnPage(m.f, pg)
		if (e.length) slot = { ...slot, ex: [...(slot.ex ?? []), ...e] }
		return false
	}

	/** keep-with-next of paragraph `i` (see above), measured at the column's width. */
	// Assumes the next column has this one's width and height, and ignores wrap
	// exclusions; re-measure through the real widthAt if mixed-geometry flows need it.
	const keepFits = (i: number): boolean => {
		const w = slot.col.w
		let need: Fx = 0
		for (let k = i; ; k++) {
			const st = paras[k].style
			const lines = layoutParagraphAt(paras[k], env, w).lines
			const n =
				st.keepNext || st.keepTogether
					? lines.length
					: Math.min(lines.length, Math.max(1, st.orphans))
			if (k > i) need += st.spaceBefore
			for (let j = 0; j < n; j++) need += lines[j].height
			if (!st.keepNext || !isText(k + 1) || paras[k + 1].style.breakBefore !== 'none') break
			need += st.spaceAfter
		}
		return y + paras[i].style.spaceBefore + need <= slot.col.h - fh() || need > slot.col.h
	}

	/**
	 * A deferred frame whose page the flow did not reach (the text ended before it): back to the
	 * page it was deferred from, to refill once more with it (its marker goes on, as with no deferral).
	 */
	const unreached = (): Snap | undefined => {
		for (const p of pins.values()) {
			const b = p.back
			if (!b || p.index === slot.pg.page.index || placedOut?.some((a) => a.id === p.f.id))
				continue
			p.index = b.index
			p.back = undefined
			return b.snap
		}
	}

	para: for (let i = 0; ; i++) {
		if (i >= story.paragraphs.length) redo ??= unreached()
		if (redo) {
			const r = redo
			redo = undefined
			i = restore(r)
			continue
		}
		if (i >= story.paragraphs.length) break
		if (pageMode) {
			paraSnap = snap(i)
			pageSnap ??= paraSnap
		}
		const p = story.paragraphs[i]
		const ip = paras[i]
		const blk = p.runs
		const st = ip.style
		const pageBreak = st.breakBefore === 'page'
		if (
			pageBreak
				? !(y === 0 && pageTop)
				: st.breakBefore === 'column'
					? y > 0
					: y > 0 && st.keepNext && isText(i) && !keepFits(i)
		) {
			if (!advance(pageBreak ? 'page' : undefined)) return total - off
		}
		const region = slot.region
		if (region && st.spanColumns !== inBand) {
			if (inBand) {
				if (!advance('cols', slot.col.y + y + fh())) return total - off
			} else {
				const top = Math.max(low, slot.col.y + y + fh())
				if (!advance('band', top > region.y ? top + st.spaceBefore : top))
					return total - off
			}
		}
		const tag = i + 1
		const minW = WRAP_MIN_EM * st.size + st.indentStart + st.indentEnd

		if (!Array.isArray(blk) && blk.k === 'table') {
			const base = childTag
			childTag += tableTagCount(blk)
			if (y > 0) y += st.spaceBefore
			/** Next row group to place. */
			let g = 0
			/** The current column continues the table: repeat its header. */
			let cont = false
			let node: TagNode | undefined
			let nodePg: PageDL | undefined
			for (;;) {
				const { pg, col, ex = [] } = slot
				const t = tableAt(ip, blk, env, Math.max(0, col.w - st.indentStart - st.indentEnd))
				const n = t.groups.length
				if (g >= n) break
				const gh = (k: number) => rowsH(t, t.groups[k][0], t.groups[k][1])
				const hh = rowsH(t, 0, t.head)
				const bot0 = col.h - fh()
				const rep = cont && t.head > 0 && t.groups[g][0] >= t.head && hh + gh(g) <= bot0
				let k = g + 1
				if (t.groups[g][1] === t.head && k < n) k++
				let lead = rep ? hh : 0
				for (let q = g; q < k; q++) lead += gh(q)
				if (ex.length) y = nextFreeTop(col, ex, col.y + y, lead, col.w) - col.y
				if (y > 0 && y + lead > bot0) {
					if (!advance()) return total - off
					cont = g > 0
					continue
				}
				let bot = y + lead
				while (k < n) {
					const h = gh(k)
					const top = col.y + bot
					if (bot + h > bot0 || (ex.length && freeSpan(col, ex, top, top + h).w < col.w))
						break
					bot += h
					k++
				}
				if (!node || nodePg !== pg) {
					node = { id: tag, role: 'Table', bid: p.bid, children: [] }
					pg.tags.push(node)
					nodePg = pg
				}
				y += emitRows(
					t,
					blk,
					{ from: t.groups[g][0], to: k < n ? t.groups[k][0] : blk.rows.length, rep },
					{ x: col.x + st.indentStart, top: col.y + y, limit: col.y + bot0 },
					pg,
					story.id,
					base,
					node
				)
				g = k
				cont = false
			}
			y += st.spaceAfter
			off += 1
			continue
		}

		if (!Array.isArray(blk)) {
			// Inline image/embed: at the first band with room, moved on whole when it does not fit.
			// Only the image's band (natural height) is checked against wrap exclusions,
			// not the caption's; check both if captions run into frames below.
			if (y > 0) y += st.spaceBefore
			for (;;) {
				const { pg, col, ex = [] } = slot
				y = nextFreeTop(col, ex, col.y + y, blk.h, minW) - col.y
				const top = col.y + y
				const sp = freeSpan(col, ex, top, top + blk.h)
				const bw = Math.min(sp.w, blk.w)
				const bh = blk.w > 0 ? Math.floor((blk.h * bw) / blk.w) : blk.h
				const cap = ip.text ? layoutParagraphAt(ip, env, sp.w) : undefined
				let need = bh
				for (const l of cap?.lines ?? []) need += l.height
				if (y > 0 && y + need > col.h - fh()) {
					if (!advance()) return total - off
					continue
				}
				const box = { x: sp.x + Math.floor((sp.w - bw) / 2), y: top, w: bw, h: bh }
				const img = blk.img
				const alt = img ? img.alt : embedAlt(blk.data)
				pg.tags.push(
					img?.deco
						? { id: tag, role: 'Artifact', bid: p.bid }
						: {
								id: tag,
								role: 'Figure',
								bid: p.bid,
								...(alt ? { alt } : {})
							}
				)
				if (!img) pg.items.push({ k: 'embed', frameId: p.bid, box, tag })
				else if (img.fileId)
					pg.items.push({
						k: 'image',
						fileId: img.fileId,
						box,
						crop: img.crop,
						fit: img.fit,
						tag
					})
				if (cap) {
					let ly = top + bh
					for (const l of cap.lines) {
						pg.items.push(...emitLine(cap, l, sp.x, ly, tag))
						ly += l.height
					}
				}
				y += need + st.spaceAfter
				break
			}
			off += 1
			continue
		}

		const tb = toc?.blocks.get(i)
		if (tb) {
			if (y > 0) y += st.spaceBefore
			// Frame markers: a marker's offset means nothing in generated text, so every frame
			// anchors at the block start; `rel: 'page'` ones at the end of its first line.
			const tmks = marksOf.get(i)
			for (const m of tmks ?? []) {
				if (isPage(m) || placeMark(m, y, false)) continue
				if (!advance()) return total - off
				placeMark(m, y, true)
			}
			let pinned = !tmks?.some(isPage)
			let tagged: PageDL | undefined
			let node: TagNode | undefined
			let geom = false
			for (const { e, ip: eip } of tb.items) {
				const pl = layoutParagraphAt(eip, env, slot.col.w)
				/** The entry's TOCI id; the lone empty line of an entry-less TOC is the TOC's own. */
				const ti = e ? tociTag++ : tag
				let itemPg: PageDL | undefined
				for (let j = 0; j < pl.lines.length; j++) {
					const line = pl.lines[j]
					if (!place(line.height)) return total - off
					const { pg, col } = slot
					if (tagged !== pg) {
						node = {
							id: tag,
							role: 'TOC',
							bid: p.bid,
							...(ip.lang ? { lang: ip.lang } : {}),
							children: []
						}
						pg.tags.push(node)
						tagged = pg
					}
					if (e && itemPg !== pg) {
						node?.children?.push({ id: ti, role: 'TOCI' })
						itemPg = pg
					}
					const oy = col.y + y
					pg.items.push(...emitLine(pl, line, col.x, oy, ti))
					if (!geom) {
						geom = true
						const x = col.x + line.carets[0]
						const n = ip.text.length
						pg.lines.push({
							story: story.id,
							bid: p.bid,
							from: 0,
							to: n,
							row: 0,
							x,
							y: oy + line.baseline,
							ascent: line.ascent,
							descent: line.descent,
							carets: Int32Array.from({ length: n + 1 }, (_, k) =>
								k < n ? x : col.x + col.w
							)
						})
					}
					if (e && toc && j === pl.lines.length - 1) {
						const ph = (): DLItem => ({
							k: 'glyphs',
							font: eip.font,
							size: eip.style.size,
							color: eip.style.color,
							x: 0,
							y: oy + line.baseline,
							glyphs: new Uint16Array(0),
							advances: new Int32Array(0),
							text: '',
							clusters: new Uint32Array(0),
							tag: ti
						})
						const lead = ph()
						const num = ph()
						pg.items.push(lead, num)
						toc.out.push({
							pg,
							e,
							lead,
							num,
							x0: col.x + line.carets[line.end - line.from] + tb.gap,
							x1: col.x + col.w - st.indentEnd,
							gap: tb.gap
						})
					}
					y += line.height
					if (!pinned) {
						pinned = true
						for (const m of tmks ?? []) {
							if (isPage(m) && pageMark(m) && pageSnap) {
								i = restore(pageSnap)
								continue para
							}
						}
					}
				}
			}
			y += st.spaceAfter
			off += ip.text.length + 1
			continue
		}

		const lvl = st.tocLevel
		const role: TagRole = lvl && lvl >= 1 && lvl <= 6 ? (`H${lvl}` as TagRole) : 'P'
		/** The paragraph starts at a column top: moving it on whole would not help. */
		let fresh = y === 0
		if (!fresh) y += st.spaceBefore
		const mks = marksOf.get(i)
		/** Frames anchored at the paragraph start: placed first, so its first line wraps them. */
		const starts = mks?.filter((m) => m.at === 0 && !isPage(m))
		/** Frames placed at their marker's row end (`rel: 'page'` ones at any offset). */
		const mids = mks?.filter((m) => m.at > 0 || isPage(m))
		/** Placement count before the start frames, to move them on with the paragraph. */
		const p0 = placedOut?.length ?? 0
		for (const m of starts ?? []) {
			if (placeMark(m, y, false)) continue
			if (!advance()) return total - off
			fresh = true
			placeMark(m, y, true)
		}
		const dc = dropCap(ip, env)
		/** The paragraph to lay out (a drop cap's cluster taken out). */
		const tp = dc?.ip ?? ip
		/** Paragraph-relative exclusions (x from the column's left edge, y from the first line top). */
		const pex: Exclusion[] = dc ? [dc.ex] : []
		/** Where the drop cap was painted: its column and page-space bottom. */
		let cap: { col: Box; bottom: Fx } | undefined
		let pl = layoutParagraphAt(tp, env, slot.col.w)
		// Wrap band of every line: the tallest line at the column width. Each placement segment
		// keeps its own band; a taller row after re-breaking (mixed sizes) grows only the last
		// segment's (`wrapLayout`), so rows already placed keep their widths.
		let band: Fx = 0
		for (const l of pl.lines) band = Math.max(band, l.height)
		/**
		 * Line placement by line top relative to the paragraph's first line; the last entry with
		 * `rel` ≤ the line's wins: the line at `rel` lies in `col` with its top at page y `top`.
		 */
		const segs: { rel: Fx; col: Box; ex: Exclusion[]; top: Fx; band: Fx; cap: boolean }[] = [
			{ rel: 0, col: slot.col, ex: slot.ex ?? [], top: slot.col.y + y, band, cap: true }
		]
		const spansAt = (ry: Fx): Span[] => {
			let s = segs[0]
			for (const g of segs) {
				if (ry >= g.rel) s = g
			}
			const t = s.top + ry - s.rel
			// The cap stays in line 0's column (`cap`), where line 0 was placed (the last rel-0
			// segment: a whole-paragraph move re-pushes one), not at a later segment's origin.
			let c0 = segs[0]
			for (const g of segs) if (g.rel === 0) c0 = g
			const ex =
				pex.length && s.cap
					? [...s.ex, ...pex.map((e) => moved(e, c0.col.x, c0.top - c0.rel))]
					: s.ex
			if (!ex.length) return [{ x: s.col.x, w: s.col.w }]
			const sp = freeSpans(s.col, ex, t, t + s.band, Math.min(minW, s.col.w))
			return sp.length ? sp : [{ x: s.col.x, w: 0 }]
		}
		const widthAt = (ry: Fx): Fx[] => spansAt(ry).map((s) => s.w)
		/** Wrap layout passes left for this paragraph. */
		let passes = WRAP_PASS_MAX
		/** Upper bound on any row height (one cluster per line), once needed. */
		let bound: Fx | undefined
		/**
		 * Lay out against the wrap; grow the last segment's band until every row in its span fits it
		 * (rows only get taller). A NaN or repeated infinite height stops the loop; no convergence
		 * within the pass limits takes the `bound` band.
		 */
		const wrapLayout = () => {
			const last = segs[segs.length - 1]
			const end = last.rel + last.col.y + last.col.h - last.top
			for (let n = 0; n < WRAP_ITER_MAX && passes > 0; n++) {
				passes--
				const l = layoutParagraph(tp, env, widthAt)
				let h = band
				// Row tops relative to the first line (a row's lines share `height`).
				let top: Fx = 0
				l.lines.forEach((x, k) => {
					if (top >= last.rel && top < end) h = Math.max(h, x.height)
					if (l.lines[k + 1]?.row !== x.row) top += x.height
				})
				if (!(h > band)) return l
				band = h
				last.band = h
			}
			if (bound === undefined) {
				let up: Fx = 0
				let down: Fx = 0
				for (const x of layoutParagraph(tp, env, () => [1]).lines) {
					up = Math.max(up, x.baseline)
					down = Math.max(down, x.height - x.baseline)
				}
				bound = up + down
			}
			if (bound > band) band = bound
			last.band = band
			return layoutParagraph(tp, env, widthAt)
		}
		if (slot.ex?.length || pex.length) pl = wrapLayout()
		let tagged: PageDL | undefined
		let rel: Fx = 0
		/** First line of the paragraph in the current column. */
		let cs = 0
		/** Page state before each line emitted in the current column (index j − cs), for rollback. */
		const marks: {
			items: number
			lines: number
			tags: number
			rel: Fx
			fn?: FnMark
			/** `anchors.out` length. */
			pl: number
		}[] = []
		const refs = notesOf.get(i)
		let j = 0
		while (j < pl.lines.length) {
			const { pg, col, ex = [] } = slot
			if (ex.length) {
				// No usable width in this band: move down past the frames in the way, re-break from here;
				// again if the re-break grew the band. Only a strict move counts (NaN y stops).
				for (let n = 0; n < WRAP_ITER_MAX; n++) {
					const ny = nextFreeTop(col, ex, col.y + y, band, minW) - col.y
					if (!(ny > y)) break
					y = ny
					segs.push({
						rel,
						col,
						ex,
						top: col.y + y,
						band,
						cap: segs[segs.length - 1].cap
					})
					pl = wrapLayout()
				}
			}
			const line = pl.lines[j]
			const fm = fa?.mark()
			let over = y > 0 && y + line.height > col.h - fh()
			if (!over && fa && refs && (j === cs || pl.lines[j - 1].row !== line.row)) {
				// The row's refs: from its first line to the end of its last.
				let k = j
				while (pl.lines[k + 1]?.row === line.row) k++
				const hi = pl.lines[k].to
				const rf = refs.filter((n) => n.at >= line.from && n.at < hi)
				if (rf.length) over = !fa.fit(rf, col, y + line.height, y === 0)
			}
			if (over) {
				// Break before line `b` ≤ j: whole paragraph (keep-together, orphans) or earlier (widows).
				// Line j starts a row; orphans and widows count rows.
				const rows = pl.lines[pl.lines.length - 1].row + 1
				let b = j
				if (cs === 0 && !fresh && (st.keepTogether || line.row < st.orphans)) b = 0
				else if (rows - line.row < st.widows) {
					const wr = rows - st.widows
					const w = pl.lines.findIndex((l) => l.row === wr)
					if (w > cs && (cs > 0 || wr >= st.orphans)) b = w
				}
				if (b < j) {
					const m = marks[b - cs]
					pg.items.length = m.items
					pg.lines.length = m.lines
					if (pg.tags.length > m.tags) {
						pg.tags.length = m.tags
						tagged = undefined
					}
					rel = m.rel
					if (m.fn) fa?.reset(m.fn)
					if (placedOut) placedOut.length = m.pl
					j = b
				}
				if (!advance()) return total - off - pl.lines[j].from
				if (j === 0) {
					fresh = true
					// The start frames move on with the paragraph.
					if (placedOut && starts?.length) {
						placedOut.length = p0
						for (const m of starts) placeMark(m, 0, true)
					}
				}
				cs = j
				marks.length = 0
				// The new column (width, top, exclusions) applies from line j on.
				segs.push({
					rel,
					col: slot.col,
					ex: slot.ex ?? [],
					top: slot.col.y,
					band,
					cap: rel === 0
				})
				pl = wrapLayout()
				continue
			}
			// Same spans layoutParagraph saw.
			const s = spansAt(rel)[line.seg]
			if (!s) throw new Error(`fill: no span for segment ${line.seg}`)
			const sx = s.x
			marks.push({
				items: pg.items.length,
				lines: pg.lines.length,
				tags: pg.tags.length,
				rel,
				fn: fm,
				pl: placedOut?.length ?? 0
			})
			if (tagged !== pg) {
				pg.tags.push({ id: tag, role, bid: p.bid, ...(ip.lang ? { lang: ip.lang } : {}) })
				tagged = pg
			}
			const oy = col.y + y
			const capX = col.x + st.indentStart
			// The cap first, so the text reads in order.
			if (dc && j === 0) {
				pg.items.push(dc.item(capX, oy, tag))
				cap = { col, bottom: oy + dc.h }
			}
			pg.items.push(...emitLine(pl, line, sx, oy, tag))
			const geom = lineGeom(story.id, p.bid, line, sx, oy)
			if (!ip.text && p.placeholder) geom.placeholder = p.placeholder
			if (j === 0 && st.breakBefore !== 'none') geom.brk = st.breakBefore
			if (dc && j === 0) {
				geom.x = capX
				geom.carets[0] = capX
			}
			pg.lines.push(geom)
			j++
			// Row end: the next line starts below (a row's lines share `height`).
			if (pl.lines[j]?.row !== line.row) {
				y += line.height
				rel += line.height
				// Frames anchored mid-paragraph in this row: below it, wrapping the rows after it.
				let k = j - 1
				while (k > 0 && pl.lines[k - 1].row === line.row) k--
				const lo = pl.lines[k].from
				const here = mids?.filter((m) => m.at >= lo && m.at < line.to)
				if (here?.length) {
					// Page frames first, while the flow is still on their marker's page.
					for (const m of here) {
						if (isPage(m) && pageMark(m) && pageSnap) {
							i = restore(pageSnap)
							continue para
						}
					}
					let onward = false
					for (const m of here) {
						if (isPage(m) || placeMark(m, y, false)) continue
						// The frame and the text after it move on to the next column.
						if (!advance()) return total - off - (pl.lines[j]?.from ?? ip.text.length)
						cs = j
						marks.length = 0
						onward = true
						placeMark(m, y, true)
					}
					segs.push({
						rel,
						col: slot.col,
						ex: slot.ex ?? [],
						top: slot.col.y + y,
						band,
						cap: !onward && segs[segs.length - 1].cap
					})
					pl = wrapLayout()
				}
			}
		}
		if (cap?.col === slot.col) y = Math.max(y, cap.bottom - slot.col.y)
		y += st.spaceAfter
		off += ip.text.length + 1
	}
	// Deferred frames on the page where the text ended (not placed by leaving it).
	for (const p of pins.values())
		if (p.moved && p.index === slot.pg.page.index && !placedOut?.some((a) => a.id === p.f.id))
			placeOnPage(p.f, slot.pg, true)
	if (!fa) return 0
	while (fa.carry.length) if (!advance()) break
	fa.flush(slot.pg, slot.col)
	// Footnote text that found no page counts as the section's overset.
	return fa.carry.reduce(
		(s, e) => s + e.ls.slice(e.a, e.b).reduce((t, l) => t + l.line.to - l.line.from, 0),
		0
	)
}

/**
 * Fill one region rectangle, starting a new page (same region) whenever it is full; column and
 * page breaks are the same thing here. Pages: `sec` = story id, `master` = '', `rev` = 0.
 * Otherwise as `fillFlow`.
 */
export function fillRegion(
	story: Story,
	paras: ItemizedParagraph[],
	region: Box,
	page: { w: Fx; h: Fx },
	env: ItemizeEnv
): PageDL[] {
	const pages: PageDL[] = []
	fillFlow(
		story,
		paras,
		() => {
			const pg: PageDL = {
				page: { sec: story.id, index: pages.length, w: page.w, h: page.h, master: '' },
				items: [],
				lines: [],
				tags: [],
				rev: 0
			}
			pages.push(pg)
			return { pg, col: region }
		},
		env
	)
	return pages
}

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { DLItem, PageDL, TagNode, TagRole } from '../display-list.js'
import type { Fx } from '../fixed.js'
import type { Box, Story } from '../model.js'
import type { ItemizedParagraph, ItemizeEnv } from '../text/itemize.js'
import { type Exclusion, freeSpan, freeSpans, moved, nextFreeTop, type Span } from './exclusions.js'
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
 * Floats (`EmbedBlock.float`): the block's box (a fraction of the column, aspect kept, caption
 * below) at the column side from the current flow y, taking no height; it joins the slot's wrap
 * exclusions, so the following paragraphs of this column wrap beside it.
 * TOC (`toc.blocks`, paragraphs with a `{ toc }` embed, `layout/toc.ts`): the entries' lines in
 * order, moved past frames, a `TOC` tag (with the paragraph's bid) per page holding one `TOCI` (no bid,
 * ids from `toc.tag` on, one per entry in order) per entry on that page, and one `LineGeom` (the
 * paragraph's whole text, on its first line); the leader and number of each entry are placeholders
 * collected in `toc.out`.
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
	toc?: { blocks: Map<number, TocBlock>; out: TocSlot[]; tag: number }
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
		low =
			s.pg === slot.pg && s.region === slot.region
				? Math.max(low, bottom)
				: Number.NEGATIVE_INFINITY
		pageTop = s.pg !== slot.pg || (pageTop && kind === 'band' && y === 0)
		inBand = kind === 'band'
		slot = s
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
	const isText = (k: number) => k < paras.length && Array.isArray(story.paragraphs[k].runs)
	/** First tag id of the next table's TR/TH/TD range (see `storyTagCount`). */
	let childTag = story.paragraphs.length + 1
	/** Next TOCI tag id (reserved by paginate after the story's and its footnotes' ranges). */
	let tociTag = toc?.tag ?? 0

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

	for (let i = 0; i < story.paragraphs.length; i++) {
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
			// A float takes no flow height: it becomes a wrap exclusion of this column.
			// A float steps down past exclusions (frames, earlier floats) like an inline image does.
			const fl =
				blk.float && (blk.float.side === 'l' || blk.float.side === 'r')
					? blk.float
					: undefined
			const frac = fl
				? Math.min(1, Math.max(0.1, Number.isFinite(fl.w) && fl.w > 0 ? fl.w : 0.5))
				: 0
			if (y > 0 && !fl) y += st.spaceBefore
			for (;;) {
				const { pg, col, ex = [] } = slot
				const fw = Math.floor(col.w * frac)
				const band = fl && blk.w > 0 ? Math.floor((blk.h * fw) / blk.w) : blk.h
				const fy = nextFreeTop(col, ex, col.y + y, band, fl ? fw : minW) - col.y
				if (!fl) y = fy
				const top = col.y + fy
				const free = freeSpan(col, ex, top, top + band)
				const sp: Span = fl
					? { x: fl.side === 'l' ? free.x : free.x + free.w - fw, w: fw }
					: free
				const bw = fl ? sp.w : Math.min(sp.w, blk.w)
				const bh = blk.w > 0 ? Math.floor((blk.h * bw) / blk.w) : blk.h
				const cap = ip.text ? layoutParagraphAt(ip, env, sp.w) : undefined
				let need = bh
				for (const l of cap?.lines ?? []) need += l.height
				if (fy > 0 && fy + need > col.h - fh()) {
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
				if (fl) {
					const gap = Math.floor(st.size / 2)
					const e: Exclusion = {
						x0: fl.side === 'l' ? col.x : sp.x - gap,
						y0: top,
						x1: fl.side === 'l' ? sp.x + sp.w + gap : col.x + col.w,
						y1: top + need + gap,
						tb: false
					}
					// Only this column's slot carries it: the next `advance` drops it.
					slot = { ...slot, ex: [...ex, e] }
				} else y += need + st.spaceAfter
				break
			}
			off += 1
			continue
		}

		const tb = toc?.blocks.get(i)
		if (tb) {
			if (y > 0) y += st.spaceBefore
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
		const marks: { items: number; lines: number; tags: number; rel: Fx; fn?: FnMark }[] = []
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
					j = b
				}
				if (!advance()) return total - off - pl.lines[j].from
				if (j === 0) fresh = true
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
				fn: fm
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
			}
		}
		if (cap?.col === slot.col) y = Math.max(y, cap.bottom - slot.col.y)
		y += st.spaceAfter
		off += ip.text.length + 1
	}
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

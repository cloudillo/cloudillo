// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { LineGeom, PageDL, TagRole } from '../display-list.js'
import type { Fx } from '../fixed.js'
import type { Box, Story } from '../model.js'
import type { ItemizedParagraph, ItemizeEnv } from '../text/itemize.js'
import { type Exclusion, freeSpan, freeSpans, nextFreeTop, type Span } from './exclusions.js'
import { emitLine, layoutParagraph, layoutParagraphAt } from './paragraph.js'

/** One column to fill: the page it lies on and its rectangle in page space. */
export interface FlowSlot {
	pg: PageDL
	col: Box
	/** Wrap exclusions of the page (page space); absent = none. */
	ex?: Exclusion[]
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
 * (itemized as the paragraph's text, or empty), which gets no `LineGeom`. Table blocks are skipped.
 * Tags: one per paragraph per page, `id` = paragraph index + 1 (the same id on every page the
 * paragraph touches). `LineGeom.from/to` are paragraph-relative (`ParaLayout` line offsets).
 * Returns the overset: story characters left unplaced (each paragraph counted as its text plus
 * one newline, a block as one), 0 when everything fit.
 */
export function fillFlow(
	story: Story,
	paras: ItemizedParagraph[],
	next: (kind?: 'page') => FlowSlot | undefined,
	env: ItemizeEnv
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
	const advance = (kind?: 'page'): boolean => {
		const s = next(kind)
		if (!s) return false
		pageTop = s.pg !== slot.pg
		slot = s
		y = 0
		return true
	}
	const isText = (k: number) => k < paras.length && Array.isArray(story.paragraphs[k].runs)

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
		return y + paras[i].style.spaceBefore + need <= slot.col.h || need > slot.col.h
	}

	for (let i = 0; i < story.paragraphs.length; i++) {
		const p = story.paragraphs[i]
		const ip = paras[i]
		const blk = p.runs
		// Table blocks are not laid out yet; they still count one newline.
		if (!Array.isArray(blk) && blk.k === 'table') {
			off += 1
			continue
		}
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
		const tag = i + 1
		const minW = WRAP_MIN_EM * st.size + st.indentStart + st.indentEnd

		if (!Array.isArray(blk)) {
			// Inline image/embed: at the first band with room, moved on whole when it does not fit.
			// Only the image's band (natural height) is checked against wrap exclusions,
			// not the caption's; check both if captions run into frames below.
			if (y > 0) y += st.spaceBefore
			for (;;) {
				const { pg, col, ex = [] } = slot
				y = nextFreeTop(col, ex, col.y + y, blk.h, minW) - col.y
				const top = col.y + y
				const sp: Span = freeSpan(col, ex, top, top + blk.h)
				const bw = Math.min(sp.w, blk.w)
				const bh = blk.w > 0 ? Math.floor((blk.h * bw) / blk.w) : blk.h
				const cap = ip.text ? layoutParagraphAt(ip, env, sp.w) : undefined
				let need = bh
				for (const l of cap?.lines ?? []) need += l.height
				if (y > 0 && y + need > col.h) {
					if (!advance()) return total - off
					continue
				}
				const box = { x: sp.x + Math.floor((sp.w - bw) / 2), y: top, w: bw, h: bh }
				const img = blk.img
				pg.tags.push(
					img?.deco
						? { id: tag, role: 'Artifact', bid: p.bid }
						: {
								id: tag,
								role: 'Figure',
								bid: p.bid,
								...(img?.alt ? { alt: img.alt } : {})
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

		const lvl = st.tocLevel
		const role: TagRole = lvl && lvl >= 1 && lvl <= 6 ? (`H${lvl}` as TagRole) : 'P'
		/** The paragraph starts at a column top: moving it on whole would not help. */
		let fresh = y === 0
		if (!fresh) y += st.spaceBefore
		let pl = layoutParagraphAt(ip, env, slot.col.w)
		// Wrap band of every line: the tallest line at the column width. Each placement segment
		// keeps its own band; a taller row after re-breaking (mixed sizes) grows only the last
		// segment's (`wrapLayout`), so rows already placed keep their widths.
		let band: Fx = 0
		for (const l of pl.lines) band = Math.max(band, l.height)
		/**
		 * Line placement by line top relative to the paragraph's first line; the last entry with
		 * `rel` ≤ the line's wins: the line at `rel` lies in `col` with its top at page y `top`.
		 */
		const segs: { rel: Fx; col: Box; ex: Exclusion[]; top: Fx; band: Fx }[] = [
			{ rel: 0, col: slot.col, ex: slot.ex ?? [], top: slot.col.y + y, band }
		]
		const spansAt = (ry: Fx): Span[] => {
			let s = segs[0]
			for (const g of segs) {
				if (ry >= g.rel) s = g
			}
			const t = s.top + ry - s.rel
			if (!s.ex.length) return [{ x: s.col.x, w: s.col.w }]
			const sp = freeSpans(s.col, s.ex, t, t + s.band, Math.min(minW, s.col.w))
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
				const l = layoutParagraph(ip, env, widthAt)
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
				for (const x of layoutParagraph(ip, env, () => [1]).lines) {
					up = Math.max(up, x.baseline)
					down = Math.max(down, x.height - x.baseline)
				}
				bound = up + down
			}
			if (bound > band) band = bound
			last.band = band
			return layoutParagraph(ip, env, widthAt)
		}
		if (slot.ex?.length) pl = wrapLayout()
		let tagged: PageDL | undefined
		let rel: Fx = 0
		/** First line of the paragraph in the current column. */
		let cs = 0
		/** Page state before each line emitted in the current column (index j − cs), for rollback. */
		const marks: { items: number; lines: number; tags: number; rel: Fx }[] = []
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
					segs.push({ rel, col, ex, top: col.y + y, band })
					pl = wrapLayout()
				}
			}
			const line = pl.lines[j]
			if (y > 0 && y + line.height > col.h) {
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
					j = b
				}
				if (!advance()) return total - off - pl.lines[j].from
				if (j === 0) fresh = true
				cs = j
				marks.length = 0
				// The new column (width, top, exclusions) applies from line j on.
				segs.push({ rel, col: slot.col, ex: slot.ex ?? [], top: slot.col.y, band })
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
				rel
			})
			if (tagged !== pg) {
				pg.tags.push({ id: tag, role, bid: p.bid, ...(ip.lang ? { lang: ip.lang } : {}) })
				tagged = pg
			}
			const oy = col.y + y
			pg.items.push(...emitLine(pl, line, sx, oy, tag))
			const geom: LineGeom = {
				story: story.id,
				bid: p.bid,
				from: line.from,
				to: line.to,
				row: line.row,
				x: sx + line.carets[0],
				y: oy + line.baseline,
				ascent: line.ascent,
				descent: line.descent,
				carets: line.carets.map((c) => c + sx)
			}
			if (!ip.text && p.placeholder) geom.placeholder = p.placeholder
			pg.lines.push(geom)
			j++
			// Row end: the next line starts below (a row's lines share `height`).
			if (pl.lines[j]?.row !== line.row) {
				y += line.height
				rel += line.height
			}
		}
		y += st.spaceAfter
		off += ip.text.length + 1
	}
	return 0
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

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Tables: column widths, cell layout (each cell's paragraphs are a mini-story), atomic row groups
// and painting. Pagination (which groups fit a column, header repeat) is in `fill.ts`.

import type { PageDL, TagNode } from '../display-list.js'
import { type Fx, ptToFx } from '../fixed.js'
import type { Paragraph, Story, TableBlock } from '../model.js'
import type { ItemizedParagraph, ItemizeEnv } from '../text/itemize.js'
import { emitLine, layoutParagraphAt, lineGeom, type ParaLayout } from './paragraph.js'

// Fixed cell padding, rule (0.5 pt black) and overset mark (6 pt red box); make them
// `TableBlock` props if designers ask. The mark is a DL item, so it prints too.
const PAD: Fx = ptToFx(3)
const RULE: Fx = ptToFx(0.5)
const RULE_COLOR = '#000000'
const MARK: Fx = ptToFx(6)
const MARK_COLOR = '#e00000'

/** A cell on the table grid, its paragraphs laid out at the cell's inner width. */
interface GridCell {
	/** Grid row and column, row and column span (rowSpan clamped to the table). */
	r: number
	c: number
	rs: number
	cs: number
	/** Tag id offset in the table's range (see `tableTagCount`). */
	tag: number
	head: boolean
	paras: Paragraph[]
	pls: ParaLayout[]
	/** Content height, padding included. */
	h: Fx
}

export interface TableLayout {
	/** Column edges from the table's left edge; the last one is the table width. */
	xs: Fx[]
	/** Row heights. */
	hs: Fx[]
	cells: GridCell[]
	/** Atomic row groups `[from, to)`: rows a rowSpan ties together are never split. */
	groups: [number, number][]
	/** Leading header rows (whole groups), repeated atop continuation columns. */
	head: number
}

/**
 * Tag ids a table uses besides its own (paragraph index + 1), as offsets from its range start:
 * 0 = the repeated-header Artifact, 1 + r = row r's TR, then one per cell in row-major order.
 */
export function tableTagCount(t: TableBlock): number {
	let n = 1 + t.rows.length
	for (const r of t.rows) n += r.cells.length
	return n
}

/** Tag ids a story's flow uses: `1..paragraphs.length`, then each table's range in story order. */
export function storyTagCount(story: Story): number {
	let n = story.paragraphs.length
	for (const p of story.paragraphs) {
		if (!Array.isArray(p.runs) && p.runs.k === 'table') n += tableTagCount(p.runs)
	}
	return n
}

/** Height of rows `[a, b)`. */
export function rowsH(t: TableLayout, a: number, b: number): Fx {
	let h: Fx = 0
	for (let r = a; r < b; r++) h += t.hs[r]
	return h
}

const tables = new WeakMap<ItemizedParagraph, Map<Fx, TableLayout>>()

/**
 * Layout of table `blk` (itemized as `ip`, cells in `ip.cells`) at width `w`, memoized per `ip`
 * and width. Shared: never mutate it.
 */
export function tableAt(
	ip: ItemizedParagraph,
	blk: TableBlock,
	env: ItemizeEnv,
	w: Fx
): TableLayout {
	let byW = tables.get(ip)
	if (!byW) {
		byW = new Map()
		tables.set(ip, byW)
	}
	let t = byW.get(w)
	if (!t) {
		t = layoutTable(blk, ip.cells ?? [], env, w)
		byW.set(w, t)
	}
	return t
}

/** Cap on a cell's colSpan: spans come from peers unvalidated (pagillo's `cellSpan` caps too). */
const MAX_SPAN = 64

/** A span clamped to [1, max]; NaN, ±Infinity and absent count as 1. */
const span = (v: number | undefined, max: number) =>
	Math.min(max, Math.max(1, Math.floor(Number.isFinite(v) ? (v as number) : 1)))

function layoutTable(
	blk: TableBlock,
	cells: ItemizedParagraph[][][],
	env: ItemizeEnv,
	w: Fx
): TableLayout {
	const nr = blk.rows.length
	// Grid placement: a cell takes the next column no rowSpan from above occupies.
	const occ: boolean[][] = blk.rows.map(() => [])
	const grid: (Omit<GridCell, 'pls' | 'h'> & { ips: ItemizedParagraph[] })[] = []
	let tag = 1 + nr
	let nc = blk.cols.length
	blk.rows.forEach((row, r) => {
		let c = 0
		row.cells.forEach((cell, k) => {
			while (occ[r][c]) c++
			const rs = span(cell.rowSpan, nr - r)
			const cs = span(cell.colSpan, MAX_SPAN)
			for (let i = r; i < r + rs; i++) {
				for (let j = c; j < c + cs; j++) occ[i][j] = true
			}
			grid.push({
				r,
				c,
				rs,
				cs,
				tag: tag++,
				head: !!row.header,
				paras: cell.paragraphs,
				ips: cells[r]?.[k] ?? []
			})
			c += cs
			nc = Math.max(nc, c)
		})
	})

	const weights = Array.from({ length: nc }, (_, c) => blk.cols[c] ?? 0)
	const equal = weights.some((x) => !(x > 0))
	let sum = 0
	for (const x of weights) sum += equal ? 1 : x
	const xs: Fx[] = [0]
	let pre = 0
	for (const x of weights) {
		pre += equal ? 1 : x
		xs.push(Math.floor((w * pre) / sum))
	}

	const out: GridCell[] = grid.map(({ ips, ...g }) => {
		const inner = Math.max(0, xs[g.c + g.cs] - xs[g.c] - 2 * PAD)
		const pls = ips.map((q) => layoutParagraphAt(q, env, inner))
		let h = 2 * PAD
		pls.forEach((pl, k) => {
			if (k > 0) h += pl.ip.style.spaceBefore
			pl.lines.forEach((l, j) => {
				if (pl.lines[j + 1]?.row !== l.row) h += l.height
			})
			if (k < pls.length - 1) h += pl.ip.style.spaceAfter
		})
		return { ...g, pls, h }
	})

	// Row heights: the tallest single-row cell; a spanning cell grows the last row it spans.
	const hs: Fx[] = blk.rows.map(() => 0)
	const end = blk.rows.map((_, r) => r + 1)
	for (const g of out) {
		if (g.rs === 1) hs[g.r] = Math.max(hs[g.r], g.h)
		end[g.r] = Math.max(end[g.r], g.r + g.rs)
	}
	for (const g of out) {
		if (g.rs === 1) continue
		let have: Fx = 0
		for (let i = g.r; i < g.r + g.rs; i++) have += hs[i]
		if (g.h > have) hs[g.r + g.rs - 1] += g.h - have
	}

	const groups: [number, number][] = []
	let head = 0
	for (let a = 0; a < nr; ) {
		let b = end[a]
		for (let k = a; k < b; k++) b = Math.max(b, end[k])
		groups.push([a, b])
		if (head === a && blk.rows.slice(a, b).every((r) => r.header)) head = b
		a = b
	}
	return { xs, hs, cells: out, groups, head }
}

/**
 * Paint rows `[from, to)` of table `t` (`blk`) into `pg`, the table's left edge at `x` and its
 * top at `top`, after the header rows repeated as an artifact when `rep`. Nothing is painted
 * below `limit`: lines crossing it are dropped and a red box marks the clipped table bottom.
 * Tags: TR/TH/TD nodes go under `node` (ids `base` + `tableTagCount` offsets); repeated header
 * items carry the `base` Artifact id and get no `LineGeom`. Cell lines are `LineGeom`s of the cell
 * paragraph's own `bid`, offsets relative to it. Returns the painted height.
 */
export function emitRows(
	t: TableLayout,
	blk: TableBlock,
	rows: { from: number; to: number; rep: boolean },
	at: { x: Fx; top: Fx; limit: Fx },
	pg: PageDL,
	story: string,
	base: number,
	node: TagNode
): Fx {
	const { x, top, limit } = at
	const list: number[] = []
	if (rows.rep) for (let r = 0; r < t.head; r++) list.push(r)
	for (let r = rows.from; r < rows.to; r++) list.push(r)
	const ys = new Map<number, Fx>()
	let y = top
	for (const r of list) {
		ys.set(r, y)
		y += t.hs[r]
	}
	const bottom = Math.min(y, limit)
	const art = (r: number) => rows.rep && r < t.head
	if (rows.rep) pg.tags.push({ id: base, role: 'Artifact' })
	const trs = new Map<number, TagNode[]>()
	for (const r of list) {
		if (art(r)) continue
		const children: TagNode[] = []
		trs.set(r, children)
		node.children?.push({ id: base + 1 + r, role: 'TR', children })
	}
	const borders = blk.borders ?? 'all'
	const tw = t.xs[t.xs.length - 1]

	for (const g of t.cells) {
		const cy = ys.get(g.r)
		if (cy === undefined || cy >= limit) continue
		const cb = Math.min(cy + rowsH(t, g.r, g.r + g.rs), limit)
		const a = art(g.r)
		const id = a ? base : base + g.tag
		if (!a) trs.get(g.r)?.push({ id, role: g.head ? 'TH' : 'TD' })
		const cx = x + t.xs[g.c]
		const cw = t.xs[g.c + g.cs] - t.xs[g.c]
		const ox = cx + PAD
		let ly = cy + PAD
		cell: for (let k = 0; k < g.pls.length; k++) {
			const pl = g.pls[k]
			const para = g.paras[k]
			if (k > 0) ly += pl.ip.style.spaceBefore
			for (let j = 0; j < pl.lines.length; j++) {
				const l = pl.lines[j]
				if (ly + l.height > limit) break cell
				pg.items.push(...emitLine(pl, l, ox, ly, id))
				if (!a && para) {
					const geom = lineGeom(story, para.bid, l, ox, ly)
					geom.cell = { x: cx, w: cw }
					if (!pl.ip.text && para.placeholder) geom.placeholder = para.placeholder
					pg.lines.push(geom)
				}
				if (pl.lines[j + 1]?.row !== l.row) ly += l.height
			}
			ly += pl.ip.style.spaceAfter
		}
		if (borders === 'all') {
			pg.items.push({
				k: 'rect',
				box: { x: cx, y: cy, w: cw, h: cb - cy },
				stroke: RULE_COLOR,
				strokeW: RULE
			})
		}
	}

	if (borders === 'outer') {
		pg.items.push({
			k: 'rect',
			box: { x, y: top, w: tw, h: bottom - top },
			stroke: RULE_COLOR,
			strokeW: RULE
		})
	}
	const hy = t.head > 0 ? ys.get(t.head - 1) : undefined
	if (borders === 'header' && hy !== undefined) {
		const ly = hy + t.hs[t.head - 1]
		if (ly <= limit)
			pg.items.push({
				k: 'line',
				x1: x,
				y1: ly,
				x2: x + tw,
				y2: ly,
				color: RULE_COLOR,
				width: RULE
			})
	}
	if (y > limit) {
		const mx = x + tw - MARK
		const my = bottom - MARK
		const q = MARK / 4
		pg.items.push({
			k: 'path',
			d: `M${mx} ${my}h${MARK}v${MARK}h${-MARK}Z M${mx + 2 * q} ${my + q}v${2 * q} M${mx + q} ${my + 2 * q}h${2 * q}`,
			stroke: MARK_COLOR,
			strokeW: RULE
		})
	}
	return bottom - top
}

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Static SVG of a cell range, for `embed:render.req` and the PDF export.
 *
 * Read-only against the document (`readSheet`). Geometry follows `naturalSize()` in
 * `embed-view.ts`: every visible row/column takes its size + a 1px grid line, hidden ones 0.
 * Output: one self-contained SVG per page, text as `<text>`, fonts by `@cloudillo/fonts`
 * family name only. Not drawn: conditional formats, text wrap/rotation, per-segment rich
 * text styles, images, checkboxes.
 */

import { escapeHtml, stripXmlControl } from '@cloudillo/core'
import type { Cell } from '@fortune-sheet/core'
import type * as Y from 'yjs'

import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT } from './embed-view'
import { fontFamily } from './fonts'
import type { ResolvedRange } from './named-ranges'
import { readSheet, transformSheetToCelldata } from './ydoc-helpers'
import type { YSheetStructure } from './yjs-types'

export interface RenderPage {
	/** Page size in CSS px (96 dpi) */
	w: number
	h: number
	/** Repeat the range's first row at the top of every page */
	repeatHead?: boolean
	/** Scale the whole range down to the page width; then only rows paginate */
	fitWidth?: boolean
}

/** A visible row or column: sheet index, offset from the range start, size incl. grid line */
interface Band {
	idx: number
	off: number
	size: number
}

interface Box {
	x: number
	y: number
	w: number
	h: number
}

type BorderSide = { style?: number; color?: string } | null | undefined
interface CellBorders {
	row_index: number
	col_index: number
	l?: BorderSide
	r?: BorderSide
	t?: BorderSide
	b?: BorderSide
}

interface Ctx {
	cells: Map<string, Cell>
	borders: Map<string, CellBorders>
	/** Per-render id prefix: renders get nested into one host SVG, so ids must not collide */
	uid: string
	nextId: number
}

const GRID_COLOR = '#e0e0e0'
/** Fortune's `space_width` / `space_height` */
const PAD = 2
/** Fortune border style → dash pattern (`setLineDash`) */
const DASHES: Record<number, string> = {
	2: '1 2',
	3: '2',
	4: '3',
	5: '2 5 2',
	6: '2 2 5 2 2',
	9: '3',
	10: '2 5 2',
	11: '2 2 5 2 2',
	12: '2 5 2'
}

const n = (x: number) => Math.round(x * 100) / 100

function bands(
	ids: string[],
	first: number,
	sizes: Y.Map<number>,
	hidden: Y.Map<boolean>,
	dflt: number
): Band[] {
	const out: Band[] = []
	let off = 0
	for (let i = 0; i < ids.length; i++) {
		if (hidden.get(ids[i])) continue
		const size = (sizes.get(ids[i]) ?? dflt) + 1
		out.push({ idx: first + i, off, size })
		off += size
	}
	return out
}

function rangeBands(sheet: YSheetStructure, r: ResolvedRange): { rows: Band[]; cols: Band[] } {
	return {
		rows: bands(
			sheet.rowOrder.toArray().slice(r.top, r.bottom + 1),
			r.top,
			sheet.rowHeights,
			sheet.hiddenRows,
			DEFAULT_ROW_HEIGHT
		),
		cols: bands(
			sheet.colOrder.toArray().slice(r.left, r.right + 1),
			r.left,
			sheet.colWidths,
			sheet.hiddenCols,
			DEFAULT_COL_WIDTH
		)
	}
}

function extent(b: Band[]): number {
	return b.length ? b[b.length - 1].off + b[b.length - 1].size - b[0].off : 0
}

/**
 * Greedy runs `[from, to)` of bands, each fitting `first` (the first run) or `next` (the rest).
 * A band larger than the room gets a run of its own; the page scales it down.
 */
function runs(b: Band[], first: number, next = first): Array<[number, number]> {
	const out: Array<[number, number]> = []
	let i = 0
	while (i < b.length) {
		const limit = b[i].off + (out.length ? next : first) + 0.01
		let j = i + 1
		while (j < b.length && b[j].off + b[j].size <= limit) j++
		out.push([i, j])
		i = j
	}
	return out.length ? out : [[0, 0]]
}

/** Colors come from peers and the PDF export skips `sanitizeSvg`: allow-list them */
export const safeColor = (c: unknown, d: string) =>
	typeof c === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i.test(c.trim())
		? c.trim()
		: d

function cellText(cell: Cell): string {
	const segs = cell.ct?.s
	const v =
		cell.ct?.t === 'inlineStr' && Array.isArray(segs)
			? segs.map((s: { v?: unknown }) => s.v ?? '').join('')
			: (cell.m ?? cell.v)
	// Single line; wrap (`tb: 2`) and line breaks need text measurement
	return v == null ? '' : stripXmlControl(String(v)).replace(/\r?\n/g, ' ')
}

function rect(b: Box, fill: string): string {
	return `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w - 1)}" height="${n(b.h - 1)}" fill="${escapeHtml(fill)}"/>`
}

function drawText(ctx: Ctx, cell: Cell, text: string, b: Box): string {
	const fontPx = ((Number(cell.fs) || 10) * 4) / 3
	const ht = String(cell.ht ?? 1)
	const vt = String(cell.vt ?? 0)
	const w = b.w - 1
	const h = b.h - 1
	const [x, anchor] =
		ht === '0'
			? [b.x + w / 2, 'middle']
			: ht === '2'
				? [b.x + w - PAD, 'end']
				: [b.x + PAD, 'start']
	// Baseline from fixed ascent/descent ratios, not the font's metrics
	const y =
		vt === '1'
			? b.y + PAD + fontPx * 0.8
			: vt === '2'
				? b.y + h - PAD - fontPx * 0.2
				: b.y + h / 2 + fontPx * 0.35
	const deco = [
		Number(cell.un) === 1 || Number(cell.un) === 3 ? 'underline' : '',
		Number(cell.cl) ? 'line-through' : ''
	]
		.filter(Boolean)
		.join(' ')
	// A clip costs 3 extra elements (sanitizeSvg caps the count), so skip it for text that
	// surely fits. 0.7em/char is a guess, wide glyphs past it overflow unclipped
	const fits = text.length * fontPx * 0.7 <= w - 2 * PAD && fontPx <= h
	const id = `${ctx.uid}c${ctx.nextId++}`
	return (
		(fits
			? '<text'
			: `<defs><clipPath id="${id}"><rect x="${n(b.x)}" y="${n(b.y)}" width="${n(w)}" height="${n(h)}"/></clipPath></defs>` +
				`<text clip-path="url(#${id})"`) +
		` x="${n(x)}" y="${n(y)}" text-anchor="${anchor}"` +
		` font-family="${escapeHtml(fontFamily(cell.ff))}" font-size="${n(fontPx)}"` +
		` fill="${escapeHtml(safeColor(cell.fc, '#000000'))}"` +
		(Number(cell.bl) ? ' font-weight="bold"' : '') +
		(Number(cell.it) ? ' font-style="italic"' : '') +
		(deco ? ` text-decoration="${deco}"` : '') +
		`>${escapeHtml(text)}</text>`
	)
}

function drawCell(ctx: Ctx, cell: Cell | undefined, b: Box, merged: boolean): string {
	// A merge always gets a fill, to hide the grid lines inside it
	const bg = safeColor(cell?.bg, merged ? '#ffffff' : '')
	const text = cell ? cellText(cell) : ''
	return (bg ? rect(b, bg) : '') + (cell && text ? drawText(ctx, cell, text, b) : '')
}

/** The part of a merge inside these bands; null when all of it is hidden or outside */
function mergeBox(
	rowAt: Map<number, Band>,
	colAt: Map<number, Band>,
	mc: NonNullable<Cell['mc']>
): Box | null {
	const span = (at: Map<number, Band>, from: number, count: number) => {
		let lo = Number.POSITIVE_INFINITY
		let hi = Number.NEGATIVE_INFINITY
		for (let i = from; i < from + count; i++) {
			const band = at.get(i)
			if (!band) continue
			lo = Math.min(lo, band.off)
			hi = Math.max(hi, band.off + band.size)
		}
		return lo < hi ? [lo, hi] : null
	}
	const xs = span(colAt, mc.c, mc.cs ?? 1)
	const ys = span(rowAt, mc.r, mc.rs ?? 1)
	return xs && ys ? { x: xs[0], y: ys[0], w: xs[1] - xs[0], h: ys[1] - ys[0] } : null
}

function drawSide(side: BorderSide, x1: number, y1: number, x2: number, y2: number): string {
	const style = side ? (side.style ?? 1) : 0
	if (!side || !style) return ''
	const width = style === 13 ? 3 : style >= 8 && style <= 11 ? 2 : 1
	const dash = DASHES[style]
	return (
		`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"` +
		` stroke="${escapeHtml(safeColor(side.color, '#000000'))}" stroke-width="${width}"` +
		(dash ? ` stroke-dasharray="${dash}"` : '') +
		'/>'
	)
}

/** Borders sit on the grid lines: left/top on the previous cell's, right/bottom on this one's */
function drawBorders(bd: CellBorders, b: Box, sx: number, sy: number): string {
	// Leading edges of the strip (sx, sy) would fall outside its clip, so pull them inside
	// Clamps by 0.5, so a 2-3px leading border is partly clipped
	const x0 = Math.max(b.x - 0.5, sx + 0.5)
	const y0 = Math.max(b.y - 0.5, sy + 0.5)
	const x1 = b.x + b.w - 0.5
	const y1 = b.y + b.h - 0.5
	return (
		drawSide(bd.t, x0, y0, x1, y0) +
		drawSide(bd.b, x0, y1, x1, y1) +
		drawSide(bd.l, x0, y0, x0, y1) +
		drawSide(bd.r, x1, y0, x1, y1)
	)
}

/** Everything in rows × cols, in range coordinates */
function drawStrip(ctx: Ctx, rows: Band[], cols: Band[]): string {
	const x0 = cols[0].off
	const y0 = rows[0].off
	const x1 = x0 + extent(cols)
	const y1 = y0 + extent(rows)
	const out = [
		`<rect x="${n(x0)}" y="${n(y0)}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" fill="#ffffff"/>`
	]
	// Leading grid lines, just inside the strip
	out.push(
		`<line x1="${n(x0 + 0.5)}" y1="${n(y0)}" x2="${n(x0 + 0.5)}" y2="${n(y1)}" stroke="${GRID_COLOR}" stroke-width="1"/>`,
		`<line x1="${n(x0)}" y1="${n(y0 + 0.5)}" x2="${n(x1)}" y2="${n(y0 + 0.5)}" stroke="${GRID_COLOR}" stroke-width="1"/>`
	)
	for (const c of cols) {
		const x = n(c.off + c.size - 0.5)
		out.push(
			`<line x1="${x}" y1="${n(y0)}" x2="${x}" y2="${n(y1)}" stroke="${GRID_COLOR}" stroke-width="1"/>`
		)
	}
	for (const r of rows) {
		const y = n(r.off + r.size - 0.5)
		out.push(
			`<line x1="${n(x0)}" y1="${y}" x2="${n(x1)}" y2="${y}" stroke="${GRID_COLOR}" stroke-width="1"/>`
		)
	}
	// Merges span only this strip's bands, so one split by a page break is drawn per page
	const rowAt = new Map(rows.map((r) => [r.idx, r]))
	const colAt = new Map(cols.map((c) => [c.idx, c]))
	const merges = new Set<string>()
	const borders: string[] = []
	for (const r of rows) {
		for (const c of cols) {
			const key = `${r.idx}_${c.idx}`
			const box = { x: c.off, y: r.off, w: c.size, h: r.size }
			const cell = ctx.cells.get(key)
			const bd = ctx.borders.get(key)
			if (bd) borders.push(drawBorders(bd, box, x0, y0))
			if (cell?.mc) {
				const master = `${cell.mc.r}_${cell.mc.c}`
				if (merges.has(master)) continue
				merges.add(master)
				const mbox = mergeBox(rowAt, colAt, cell.mc)
				if (mbox) out.push(drawCell(ctx, ctx.cells.get(master), mbox, true))
			} else if (cell) {
				out.push(drawCell(ctx, cell, box, false))
			}
		}
	}
	return out.join('') + borders.join('')
}

/** One page: strips stacked top-down (the repeated head, then the body), scaled to fit */
function pageSvg(ctx: Ctx, pw: number, ph: number, strips: Band[][], cols: Band[]): string {
	const cw = extent(cols)
	const ch = strips.reduce((acc, s) => acc + extent(s), 0)
	const k = Math.min(1, cw ? pw / cw : 1, ch ? ph / ch : 1)
	const body: string[] = []
	let y = 0
	for (const rows of strips) {
		const h = extent(rows)
		if (!h || !cw) continue
		const id = `${ctx.uid}p${ctx.nextId++}`
		body.push(
			`<defs><clipPath id="${id}"><rect x="0" y="${n(y)}" width="${n(cw)}" height="${n(h)}"/></clipPath></defs>`,
			`<g clip-path="url(#${id})"><g transform="translate(${n(-cols[0].off)} ${n(y - rows[0].off)})">`,
			drawStrip(ctx, rows, cols),
			'</g></g>'
		)
		y += h
	}
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${n(pw)}" height="${n(ph)}" viewBox="0 0 ${n(pw)} ${n(ph)}">` +
		`<g transform="scale(${n(k * 10000) / 10000})">${body.join('')}</g></svg>`
	)
}

/**
 * Render a range. Without `page`: one SVG at the natural size. With `page`: pages of `w`×`h`
 * px, down first then across, breaking only between rows / columns (`runs`).
 */
export function renderRangeSvg(yDoc: Y.Doc, r: ResolvedRange, page?: RenderPage): string[] {
	const sheet = readSheet(yDoc, r.sheetId)
	if (!sheet) throw new Error('Sheet not found')
	const { rows, cols } = rangeBands(sheet, r)
	// Masks the whole sheet (it is the only place display formats are applied);
	// a range-limited variant if renders of very large sheets get slow
	const { celldata, config } = transformSheetToCelldata(sheet)
	const borderInfo = ((config as { borderInfo?: Array<{ value: CellBorders }> } | undefined)
		?.borderInfo ?? []) as Array<{ value: CellBorders }>
	const ctx: Ctx = {
		cells: new Map(celldata.map((d) => [`${d.r}_${d.c}`, d.v])),
		borders: new Map(
			borderInfo.map(({ value }) => [`${value.row_index}_${value.col_index}`, value])
		),
		uid: `cr${Math.random().toString(36).slice(2, 8)}`,
		nextId: 0
	}
	const fullW = extent(cols)
	if (!page) return [pageSvg(ctx, fullW, extent(rows), [rows], cols)]

	const scale = page.fitWidth && fullW > page.w ? page.w / fullW : 1
	const room = page.h / scale
	const head = page.repeatHead && rows.length > 1 ? rows.slice(0, 1) : []
	// A head as tall as the page cannot repeat
	const headH = head.length && extent(head) < room ? extent(head) : 0
	const rowRuns = runs(rows, room, room - headH)
	const colRuns: Array<[number, number]> = page.fitWidth ? [[0, cols.length]] : runs(cols, page.w)
	const pages: string[] = []
	for (const [c0, c1] of colRuns) {
		for (const [r0, r1] of rowRuns) {
			const body = rows.slice(r0, r1)
			pages.push(
				pageSvg(
					ctx,
					page.w,
					page.h,
					headH && r0 > 0 ? [head, body] : [body],
					cols.slice(c0, c1)
				)
			)
		}
	}
	return pages
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Vector items (`rect`, `line`, `path`), the embed placeholder and link annotations, through
// pdfkit's public drawing API only. Emission is per backend on purpose (each has its own drawing
// API, cf. `apps/pagillo/src/view/draw-page.ts`); shared math and styling live in geometry.ts.
// User space is pt, y down (see glyph-ops.ts), so page-space Fx maps with `fxToPt` alone.

import type { DLItem } from '../display-list.js'
import { FX, fxToPt } from '../fixed.js'
import { EMBED_PLACEHOLDER, MISSING_IMAGE_ALPHA, safeHref } from '../geometry.js'
import type { PdfDoc } from './glyph-ops.js'

const hex2 = (v: number) =>
	Math.round(Math.min(255, Math.max(0, v)))
		.toString(16)
		.padStart(2, '0')

export interface PdfImage {
	width: number
	height: number
	/** EXIF orientation (JPEG); > 4 swaps width and height. */
	orientation?: number
}

export interface PdfOutline {
	addItem(title: string, opts?: { fit?: boolean; top?: number; left?: number }): PdfOutline
}

/** The public pdfkit drawing API on top of `PdfDoc`. */
export interface PdfGfx extends PdfDoc {
	save(): PdfGfx
	restore(): PdfGfx
	rotate(deg: number, opts: { origin: [number, number] }): PdfGfx
	transform(a: number, b: number, c: number, d: number, e: number, f: number): PdfGfx
	rect(x: number, y: number, w: number, h: number): PdfGfx
	moveTo(x: number, y: number): PdfGfx
	lineTo(x: number, y: number): PdfGfx
	path(d: string): PdfGfx
	lineWidth(w: number): PdfGfx
	fillColor(color: string, opacity?: number): PdfGfx
	strokeColor(color: string, opacity?: number): PdfGfx
	fill(): PdfGfx
	stroke(): PdfGfx
	fillAndStroke(): PdfGfx
	clip(): PdfGfx
	openImage(src: Uint8Array): PdfImage
	image(img: PdfImage, x: number, y: number, opts: { width: number; height: number }): PdfGfx
	link(x: number, y: number, w: number, h: number, url: string): PdfGfx
	outline: PdfOutline
}

/**
 * CSS colour (as accepted by the model: `#rgb[a]`, `#rrggbb[aa]`, `rgb[a](…)`, named) → pdfkit
 * colour + opacity (undefined = opaque). Undefined for `none`/`transparent`/unparseable.
 */
export function pdfColor(css: string): [string, number | undefined] | undefined {
	const s = css.trim().toLowerCase()
	if (!s || s === 'none' || s === 'transparent') return undefined
	const hex = /^#([0-9a-f]{3,8})$/.exec(s)
	if (hex) {
		let h = hex[1]
		if (h.length <= 4) h = Array.from(h, (d) => d + d).join('')
		if (h.length !== 6 && h.length !== 8) return undefined
		const a = h.length === 8 ? Number.parseInt(h.slice(6), 16) / 255 : 1
		return [`#${h.slice(0, 6)}`, a < 1 ? a : undefined]
	}
	const fn = /^rgba?\(([^)]*)\)$/.exec(s)
	if (fn) {
		const p = fn[1].split(/[\s,/]+/).filter(Boolean)
		const num = (v: string, full: number) =>
			v.endsWith('%') ? (Number.parseFloat(v) / 100) * full : Number.parseFloat(v)
		const rgb = p.slice(0, 3).map((v) => num(v, 255))
		if (rgb.length < 3 || rgb.some(Number.isNaN)) return undefined
		const a = p[3] === undefined ? 1 : num(p[3], 1)
		return [`#${rgb.map(hex2).join('')}`, a < 1 ? Math.max(0, a) : undefined]
	}
	return [s, undefined] // named: pdfkit's table
}

/** Set fill and/or stroke from CSS colours and paint the current path (or just end it). */
function paint(doc: PdfGfx, fill?: string, stroke?: string): void {
	const f = fill ? pdfColor(fill) : undefined
	const s = stroke ? pdfColor(stroke) : undefined
	if (f) doc.fillColor(f[0], f[1])
	if (s) doc.strokeColor(s[0], s[1])
	if (f && s) doc.fillAndStroke()
	else if (f) doc.fill()
	else if (s) doc.stroke()
	else doc.addContent('n')
}

type Item<K extends DLItem['k']> = Extract<DLItem, { k: K }>

export function writeRect(doc: PdfGfx, it: Item<'rect'>): void {
	const b = it.box
	doc.lineWidth(it.strokeW !== undefined ? fxToPt(it.strokeW) : 1)
	doc.rect(fxToPt(b.x), fxToPt(b.y), fxToPt(b.w), fxToPt(b.h))
	paint(doc, it.fill, it.stroke)
}

export function writeLine(doc: PdfGfx, it: Item<'line'>): void {
	doc.lineWidth(fxToPt(it.width))
	doc.moveTo(fxToPt(it.x1), fxToPt(it.y1)).lineTo(fxToPt(it.x2), fxToPt(it.y2))
	paint(doc, undefined, it.color)
}

/** `d` is in Fx: scale it, and keep the stroke width in Fx under the same scale. */
export function writePath(doc: PdfGfx, it: Item<'path'>): void {
	doc.save()
	doc.transform(1 / FX, 0, 0, 1 / FX, 0, 0)
	doc.lineWidth(it.strokeW ?? 1)
	doc.path(it.d)
	paint(doc, it.fill, it.stroke)
	doc.restore()
}

/** Placeholder box: embed content is not converted to PDF yet. */
export function writeEmbed(doc: PdfGfx, it: Item<'embed'>): void {
	const b = it.box
	const p = EMBED_PLACEHOLDER
	doc.lineWidth(p.width)
	doc.rect(fxToPt(b.x), fxToPt(b.y), fxToPt(b.w), fxToPt(b.h))
	doc.fillColor('black', p.fill).strokeColor('black', p.stroke).fillAndStroke()
}

/** Grey box where an image could not be loaded (as the canvas draws one still loading). */
export function writeMissingImage(doc: PdfGfx, box: Item<'image'>['box']): void {
	doc.rect(fxToPt(box.x), fxToPt(box.y), fxToPt(box.w), fxToPt(box.h))
	doc.fillColor('black', MISSING_IMAGE_ALPHA).fill()
}

/**
 * Link annotation, called with the page's own CTM (no item rotation applied): a rotated link
 * gets the bounding box of its rotated box. pdfkit's `_convertRect` maps only two corners (and
 * reuses the mapped x for y), so it cannot be given a rotated CTM.
 */
export function writeLink(doc: PdfGfx, it: Item<'link'>): void {
	// `#fragment` targets have no meaning in the PDF.
	const url = safeHref(it.href)
	if (!url || url.startsWith('#')) return
	const b = it.box
	let [x0, y0, x1, y1] = [b.x, b.y, b.x + b.w, b.y + b.h]
	if (it.rot) {
		const a = (it.rot.deg * Math.PI) / 180
		const cos = Math.cos(a)
		const sin = Math.sin(a)
		const { cx, cy } = it.rot
		const xs: number[] = []
		const ys: number[] = []
		for (const [x, y] of [
			[x0, y0],
			[x1, y0],
			[x0, y1],
			[x1, y1]
		]) {
			// Clockwise in y-down space, as the canvas's `rotate`.
			xs.push(cx + (x - cx) * cos - (y - cy) * sin)
			ys.push(cy + (x - cx) * sin + (y - cy) * cos)
		}
		;[x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
	}
	doc.link(fxToPt(x0), fxToPt(y0), fxToPt(x1 - x0), fxToPt(y1 - y0), url)
}

// vim: ts=4

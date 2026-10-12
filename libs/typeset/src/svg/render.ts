// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Display list → SVG string. Builds strings only (no `document`), so it also runs in a worker.
// Glyphs are outlines: one `<path id="g-<sha256>-<gid>">` per used glyph (font units, y flipped),
// each glyph run a `<g transform="translate(x y) scale(size/upem)">` of `<use>`s. No `<text>`.
// SVG user units are points; the display list is Fx (1/1024 pt).
// The static export/embed renderer; keep it visually in step with its interactive counterpart,
// `apps/pagillo/src/view/PageSvg.tsx`.

import type { DLItem, FontRef, PageDL } from '../display-list.js'
import { FX } from '../fixed.js'

export type GlyphPathFn = (font: FontRef, gid: number) => string

export interface RenderOptions {
	/** `href` of a glyph's `<path>` (e.g. `#g-…` into a shared `<defs>` the caller maintains). */
	glyphHref: (font: FontRef, gid: number) => string
}

/** Id of a glyph's `<path>`: `g-<sha256>-<gid>`. */
export function glyphId(font: FontRef, gid: number): string {
	return `g-${font.sha256}-${gid}`
}

/** Used glyphs per face (order of first use, gids ascending), for requesting outlines. */
export function collectGlyphs(dl: PageDL): { font: FontRef; gids: number[] }[] {
	const byFont = new Map<string, { font: FontRef; set: Set<number> }>()
	for (const it of dl.items) {
		if (it.k !== 'glyphs') continue
		let e = byFont.get(it.font.sha256)
		if (!e) {
			e = { font: it.font, set: new Set() }
			byFont.set(it.font.sha256, e)
		}
		for (const g of it.glyphs) e.set.add(g)
	}
	return [...byFont.values()].map(({ font, set }) => ({
		font,
		gids: [...set].sort((a, b) => a - b)
	}))
}

/** `<path>` defs of every used glyph, flipped to y down. */
export function glyphDefs(dl: PageDL, glyphPath: GlyphPathFn): string {
	let s = ''
	for (const { font, gids } of collectGlyphs(dl))
		for (const gid of gids)
			s += `<path id="${glyphId(font, gid)}" transform="scale(1 -1)" d="${esc(glyphPath(font, gid))}"/>`
	return s
}

/** Page SVG referencing glyph outlines held elsewhere (shared `<defs>`). */
export function renderPageSvg(dl: PageDL, opts: RenderOptions): string {
	return svg(dl, '', opts.glyphHref)
}

/** Self-contained page SVG: used outlines inlined, page text in `<title>`/`<desc>`. */
export function renderPageSvgStandalone(dl: PageDL, glyphPath: GlyphPathFn): string {
	const head =
		`<title>${esc(`Page ${dl.page.index + 1}`)}</title><desc>${esc(pageText(dl))}</desc>` +
		`<defs>${glyphDefs(dl, glyphPath)}</defs>`
	return svg(dl, head, (font, gid) => `#${glyphId(font, gid)}`)
}

function svg(dl: PageDL, head: string, href: RenderOptions['glyphHref']): string {
	const w = pt(dl.page.w)
	const h = pt(dl.page.h)
	let body = ''
	for (const it of dl.items) {
		const s = item(it, href)
		body += it.rot
			? `<g transform="rotate(${num(it.rot.deg)} ${pt(it.rot.cx)} ${pt(it.rot.cy)})">${s}</g>`
			: s
	}
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}pt" height="${h}pt" viewBox="0 0 ${w} ${h}">` +
		`${head}${body}</svg>`
	)
}

function item(it: DLItem, href: RenderOptions['glyphHref']): string {
	switch (it.k) {
		case 'glyphs': {
			const k = it.font.upem / it.size
			let s = `<g fill="${esc(it.color)}" transform="translate(${pt(it.x)} ${pt(it.y)}) scale(${num(it.size / FX / it.font.upem, 1e9)})">`
			let pen = 0
			for (let i = 0; i < it.glyphs.length; i++) {
				const dx = it.offsets ? it.offsets[2 * i] : 0
				const dy = it.offsets ? it.offsets[2 * i + 1] : 0
				const y = dy ? ` y="${num(dy * k)}"` : ''
				s += `<use href="${esc(href(it.font, it.glyphs[i]))}" x="${num((pen + dx) * k)}"${y}/>`
				pen += it.advances[i]
			}
			return `${s}</g>`
		}
		case 'rect': {
			const b = it.box
			return `<rect x="${pt(b.x)}" y="${pt(b.y)}" width="${pt(b.w)}" height="${pt(b.h)}"${paint(it.fill, it.stroke, it.strokeW)}/>`
		}
		case 'line':
			return `<line x1="${pt(it.x1)}" y1="${pt(it.y1)}" x2="${pt(it.x2)}" y2="${pt(it.y2)}" stroke="${esc(it.color)}" stroke-width="${pt(it.width)}"/>`
		case 'path':
			// `d` is in Fx: scale it, and keep the stroke width in Fx under the same scale.
			return `<path transform="scale(${num(1 / FX, 1e9)})" d="${esc(it.d)}"${paint(it.fill, it.stroke, it.strokeW, false)}/>`
		case 'image':
		case 'embed': {
			// Placeholder box only; the main thread resolves file/frame ids into content.
			const b = it.box
			const attr =
				it.k === 'image'
					? `data-file-id="${esc(it.fileId)}"`
					: `data-frame-id="${esc(it.frameId)}"`
			return `<rect ${attr} x="${pt(b.x)}" y="${pt(b.y)}" width="${pt(b.w)}" height="${pt(b.h)}" fill="none"/>`
		}
		case 'link': {
			// Authored hrefs: only http(s)/mailto/fragment links become clickable (no `javascript:`).
			if (!/^(https?:|mailto:|#)/i.test(it.href)) return ''
			const b = it.box
			return `<a href="${esc(it.href)}"><rect x="${pt(b.x)}" y="${pt(b.y)}" width="${pt(b.w)}" height="${pt(b.h)}" fill="transparent"/></a>`
		}
	}
}

function paint(fill?: string, stroke?: string, strokeW?: number, inPt = true): string {
	let s = ` fill="${esc(fill ?? 'none')}"`
	if (stroke) s += ` stroke="${esc(stroke)}"`
	if (stroke && strokeW !== undefined) s += ` stroke-width="${inPt ? pt(strokeW) : strokeW}"`
	return s
}

/** Page text for `<desc>`: paragraphs (tags) on their own line, lines joined by a space. */
function pageText(dl: PageDL): string {
	// A hyphenated line break reads as two words; use `lines` + story text if it matters.
	let s = ''
	let tag: number | undefined
	let y: number | undefined
	for (const it of dl.items) {
		if (it.k !== 'glyphs') continue
		if (tag !== undefined && it.tag !== tag) s += '\n'
		else if (y !== undefined && it.y !== y && !/\s$/.test(s)) s += ' '
		s += it.text
		tag = it.tag
		y = it.y
	}
	return s.trim()
}

/** Deterministic number text: rounded to 1/`prec`, no exponent for ordinary page values. */
function num(v: number, prec = 1000): string {
	const r = Math.round(v * prec) / prec
	return Object.is(r, -0) ? '0' : String(r)
}

function pt(fx: number): string {
	return num(fx / FX)
}

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

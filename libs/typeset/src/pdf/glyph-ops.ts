// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// The only module that touches pdfkit internals (pinned exactly in package.json). It writes our
// own glyph runs as TJ operators, so PDF glyph positions equal the display list's; pdfkit's text
// layout (`doc.text()`) reshapes with fontkit and drifts, so it is never used.
//
// Relied on, pdfkit 0.20.1 (`js/pdfkit.browser.mjs`):
// - `doc.font(bytes)._font` is an `EmbeddedFont`: `id` (`F<n>`), `font` (fontkit),
//   `subset.includeGlyph(gid)` → subset gid (0 = .notdef, then sequential), `widths[]` and
//   `unicode[]` indexed by subset gid — read by `embed()` / `toUnicodeCmap()` at `doc.end()`, so
//   both are set together for every new subset gid and never left with holes — `scale`
//   (1000 / upem) and `ref()`.
// - `doc.page.fonts[id] = font.ref()` puts the font in the page resources (as `_fragment` does).
// - `doc.addContent(str)` appends raw operators; `addPage` has already set the CTM to
//   `1 0 0 -1 0 h`, so user space is pt, y down.
// - Numbers in pdfkit objects (the `W` widths) are written rounded to 1e-6 (`PDFObject.number`).
// - A JS `String` object is written as a PDF string, a primitive string as a name (`PDFObject.convert`).
// - A structure element's `dictionary.data` is its dict until it is flushed (`setAlt`).
// - `doc.end()` writes the Info dict from `doc.info`, then `_addInfo()` copies Title/Author into
//   the XMP unescaped (`xmpSafeInfo`).

import type { DLItem } from '../display-list.js'
import { FX } from '../fixed.js'

export type GlyphsItem = Extract<DLItem, { k: 'glyphs' }>

/** The slice of pdfkit's `EmbeddedFont` used here. */
export interface PdfFace {
	id: string
	font: { getGlyph(gid: number): { advanceWidth: number; codePoints: number[] } }
	subset: { includeGlyph(gid: number): number }
	widths: number[]
	unicode: number[][]
	scale: number
	ref(): unknown
}

/** The slice of pdfkit's `PDFDocument` the writer uses. */
export interface PdfDoc {
	page: { fonts: Record<string, unknown> }
	_font: PdfFace
	font(src: Uint8Array): PdfDoc
	addPage(opts: { size: [number, number]; margin: number }): PdfDoc
	addContent(ops: string): PdfDoc
	fillColor(color: string): PdfDoc
	on(event: 'data', cb: (chunk: Uint8Array) => void): PdfDoc
	on(event: 'end', cb: () => void): PdfDoc
	end(): void
	// Tagging (pdfkit's public markings API, `tagged: true` document).
	markContent(tag: string): PdfDoc
	markStructureContent(tag: string): PdfStructContent
	endMarkedContent(): PdfDoc
	struct(type: string, opts?: { lang?: string }): PdfStruct
	addStructure(el: PdfStruct): PdfDoc
	appendXML(xml: string): void
	link(x: number, y: number, w: number, h: number, url: string, opts?: PdfLinkOpts): PdfDoc
}

/** pdfkit's `PDFStructureContent`: one marked-content sequence (MCID) on a page. */
export interface PdfStructContent {
	refs: unknown[]
}

/** pdfkit's `PDFStructureElement`. */
export interface PdfStruct {
	add(child: PdfStruct | PdfStructContent): PdfStruct
	end(): void
}

export interface PdfLinkOpts {
	/** The `Link` element the annotation is attached to (`/StructParent` + `OBJR`). */
	structParent: PdfStruct
	Contents: object
}

/** A raw dict value written as a PDF string, not a name. */
export function pdfString(s: string): object {
	// pdfkit tells strings from names by the wrapper object.
	return new String(s)
}

/** `/Alt` on a structure element, empty included (pdfkit's `alt` option drops ""). */
export function setAlt(el: PdfStruct, alt: string): void {
	;(el as unknown as { dictionary: { data: Record<string, unknown> } }).dictionary.data.Alt =
		pdfString(alt)
}

/** XML-illegal characters dropped, then `& < >` escaped. */
const xmlEscape = (s: string) =>
	s
		// biome-ignore lint/suspicious/noControlCharactersInRegex: control chars are illegal in XML
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')

/** Escape the info strings pdfkit interpolates into the XMP; the Info dict keeps them raw. */
export function xmpSafeInfo(doc: PdfDoc): void {
	const d = doc as unknown as { info: Record<string, unknown>; _addInfo(): void }
	const add = d._addInfo
	d._addInfo = () => {
		const info = d.info
		d.info = Object.fromEntries(
			Object.entries(info).map(([k, v]) => [k, typeof v === 'string' ? xmlEscape(v) : v])
		)
		try {
			add.call(d)
		} finally {
			d.info = info
		}
	}
}

/** Embed a TTF. Glyphs enter its subset as runs reference them. */
export function embedFace(doc: PdfDoc, bytes: Uint8Array): PdfFace {
	return doc.font(bytes)._font
}

/** pdfkit's number rounding, so what we compute with is what gets written (`|| 0` drops -0). */
const r6 = (n: number) => Math.round(n * 1e6) / 1e6 || 0
const hex4 = (n: number) => n.toString(16).padStart(4, '0')
const codePoints = (s: string) => Array.from(s, (ch) => ch.codePointAt(0) ?? 0xfffd)
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i])

function utf16(s: string): string {
	let h = 'FEFF'
	for (let i = 0; i < s.length; i++) h += hex4(s.charCodeAt(i))
	return `<${h}>`
}

/**
 * Write one `glyphs` item: `BT /F<n> size Tf 1 0 0 -1 x y Tm [<gid> kern …] TJ ET`.
 *
 * Glyph i sits at (`x + pen + dx`, `y + dy`) with `pen` the sum of the preceding `advances` — the
 * same walk as `svg/render.ts`. A TJ kern moves the pen from where the font's own advance left it
 * to that spot; a vertical offset re-sets `Tm`. The pen is tracked as written (rounded), so
 * rounding never accumulates along the run.
 *
 * ToUnicode comes from `text`/`clusters` (one-glyph clusters map to their text, so a ligature maps
 * to all its characters). A cluster with several glyphs, several characters, no text, or a glyph
 * whose ToUnicode entry already says something else is wrapped in a `/Span` with `/ActualText`.
 */
export function writeGlyphRun(doc: PdfDoc, f: PdfFace, it: GlyphsItem): void {
	if (doc.page.fonts[f.id] == null) doc.page.fonts[f.id] = f.ref()
	doc.fillColor(it.color)

	const size = r6(it.size / FX)
	const k = 1000 / size // text-space thousandths per pt
	const n = it.glyphs.length
	const starts = [...new Set(it.clusters)].sort((a, b) => a - b)
	const ends = new Map<number, number>()
	for (let s = 0; s < starts.length; s++) ends.set(starts[s], starts[s + 1] ?? it.text.length)

	const out = ['BT', `/${f.id} ${size} Tf`]
	let tj = ''
	const show = () => {
		if (tj) out.push(`[${tj}] TJ`)
		tj = ''
	}
	let cx = 0
	let cy = Number.NaN
	let pen = 0
	const subs: number[] = []
	for (let i = 0; i < n; ) {
		const c = it.clusters[i]
		let j = i + 1
		while (j < n && it.clusters[j] === c) j++
		const str = it.text.slice(c, ends.get(c))
		const cp = codePoints(str)
		let actual = j - i > 1 || cp.length !== 1

		subs.length = 0
		for (let g = i; g < j; g++) {
			const sub = f.subset.includeGlyph(it.glyphs[g])
			if (f.widths[sub] == null) {
				const glyph = f.font.getGlyph(it.glyphs[g])
				const uni = j - i === 1 && cp.length ? cp : glyph.codePoints
				f.widths[sub] = r6(glyph.advanceWidth * f.scale)
				f.unicode[sub] = uni.length ? uni : cp.length ? cp : [0xfffd]
			} else if (!same(f.unicode[sub], cp)) {
				actual = true
			}
			subs.push(sub)
		}

		if (actual) {
			show()
			out.push(`/Span <</ActualText ${utf16(str)}>> BDC`)
		}
		for (let g = i; g < j; g++) {
			const tx = r6((it.x + pen + (it.offsets?.[2 * g] ?? 0)) / FX)
			const ty = r6((it.y + (it.offsets?.[2 * g + 1] ?? 0)) / FX)
			if (ty !== cy) {
				show()
				out.push(`1 0 0 -1 ${tx} ${ty} Tm`)
				cx = tx
				cy = ty
			} else {
				const kern = r6((cx - tx) * k)
				if (kern) {
					tj += `${kern} `
					cx -= kern / k
				}
			}
			const sub = subs[g - i]
			tj += `<${hex4(sub)}>`
			cx += f.widths[sub] / k
			pen += it.advances[g]
		}
		if (actual) {
			show()
			out.push('EMC')
		}
		i = j
	}
	show()
	out.push('ET')
	doc.addContent(out.join('\n'))
}

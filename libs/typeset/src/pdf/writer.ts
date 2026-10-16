// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Display list → PDF. pdfkit is imported dynamically so it never lands in a bundle that only
// imports `@cloudillo/typeset` for layout; this module and its imports reference it by type only.

import type { DLItem, PageDL, TagNode } from '../display-list.js'
import { fxToPt } from '../fixed.js'
import { type FetchBytes, loadFace } from '../fonts/loader.js'
import { FontRegistry } from '../fonts/registry.js'
import { EMBED_PLACEHOLDER, safeDocRef } from '../geometry.js'
import type { Box } from '../model.js'
import { initHarfBuzz } from '../shape/hb.js'
import { embedFonts, embedOneFace } from './fonts.js'
import { type PdfFace, writeGlyphRun, xmpSafeInfo } from './glyph-ops.js'
import {
	linkRect,
	type PdfGfx,
	type PdfOutline,
	pdfColor,
	writeEmbed,
	writeLine,
	writeLink,
	writePath,
	writeRect
} from './graphics.js'
import { type ImageCache, writeImage } from './images.js'
import { type SvgPdfEnv, svgToPdf } from './svg-to-pdf.js'
import { PDFUA_XMP, Tagger } from './tagging.js'

export type PdfDownsample = 'none' | '300' | '150'

export interface PdfOptions {
	/** Document info `/Title`. */
	title?: string
	/** Document info `/Author`. */
	author?: string
	/** Catalog `/Lang` (BCP 47). */
	lang?: string
	pdfa: boolean
	/** Image variant passed to `PdfEnv.fetchImage`. */
	downsample: PdfDownsample
}

/** A pre-rendered embed, for the DL `embed` item with this `frameId`. */
export interface PdfEmbed {
	/** Sanitized render SVG; absent = the render failed. */
	svg?: string
	/** Source title, printed on the "Content unavailable" box. */
	title?: string
	/** `cl:` address: the "Content unavailable" box's link annotation, never printed. */
	address?: string
}

export interface PdfEnv {
	/** TTF source, as for `loadFace`: called with `fontUrl(ref)`, bytes checked against `sha256`. */
	fonts: FetchBytes
	/**
	 * Image bytes of a file, original or downsampled; must be JPEG or PNG. A failing fetch or
	 * another format is written as a grey placeholder box.
	 */
	fetchImage: (fileId: string, downsample: PdfDownsample) => Promise<ArrayBuffer>
	/** Called once per image written as a placeholder (fetch or decode failed). */
	onMissingImage?: (fileId: string) => void
	/**
	 * Render SVGs by DL embed `frameId`, drawn as vectors (`svgToPdf`); an embed without one is a
	 * "Content unavailable" box. Absent: every embed is a plain placeholder box.
	 */
	embeds?: Record<string, PdfEmbed>
	signal?: AbortSignal
	/** Called after each page is written. */
	onProgress?: (done: number, total: number) => void
}

/** A `Figure` tag without alt text anywhere in `tags`: the PDF then cannot claim PDF/UA. */
export function hasBareFigure(tags: TagNode[]): boolean {
	return tags.some((t) => (t.role === 'Figure' && !t.alt) || hasBareFigure(t.children ?? []))
}

export async function writePdf(
	pages: PageDL[],
	opts: PdfOptions,
	env: PdfEnv
): Promise<Uint8Array> {
	const { default: PDFDocument } = await import('pdfkit')
	env.signal?.throwIfAborted()
	const info: Record<string, string> = {}
	if (opts.title) info.Title = opts.title
	if (opts.author) info.Author = opts.author
	// `font: null` skips pdfkit's default Helvetica: no standard font is ever used.
	// The tagging is always written; PDF/UA-1 is claimed only when every figure has alt text.
	// 1.7 because pdfkit writes no XMP metadata for 1.3.
	const ua = pages.every((p) => !hasBareFigure(p.tags))
	const doc = new (PDFDocument as new (opts: object) => PdfGfx)({
		autoFirstPage: false,
		font: null,
		info,
		lang: opts.lang || undefined,
		pdfVersion: '1.7',
		tagged: true,
		displayTitle: true,
		// One subset only: PDF/A adds its XMP id and sRGB output intent, PDF/UA its XMP id.
		subset: opts.pdfa ? 'PDF/A-2a' : ua ? 'PDF/UA' : undefined
	})
	xmpSafeInfo(doc)
	if (opts.pdfa && ua) doc.appendXML(PDFUA_XMP)
	const tags = new Tagger(doc)
	const chunks: Uint8Array[] = []
	doc.on('data', (chunk) => {
		chunks.push(chunk)
	})
	const ended = new Promise<void>((resolve) => {
		doc.on('end', resolve)
	})

	const faces = await embedFonts(doc, pages, env.fonts)
	// Built on the first embed: exports without embeds never init HarfBuzz.
	let svgEnv: SvgPdfEnv | undefined
	const images: ImageCache = new Map()
	const fetchImage = (fileId: string) => env.fetchImage(fileId, opts.downsample)
	const outline: Outline = { stack: [], seen: new Set() }
	for (let i = 0; i < pages.length; i++) {
		env.signal?.throwIfAborted()
		const p = pages[i]
		doc.addPage({ size: [fxToPt(p.page.w), fxToPt(p.page.h)], margin: 0 })
		tags.page(p, i)
		for (const it of p.items) {
			// An annotation, not content: rotation is applied to its box (see `writeLink`), which
			// calls the tagger's `link` (struct parent + `/Contents`) through a doc view.
			if (it.k === 'link') {
				tags.link(p, it, (link) => {
					writeLink(Object.create(doc, { link: { value: link } }) as PdfGfx, it)
				})
				continue
			}
			// Every item in its own marked content and q/Q: rotation, clip and opacity never leak
			// into the next, and no marking stays open across a page.
			tags.open(it)
			let link: LinkItem | undefined
			doc.save()
			if (it.rot) doc.rotate(it.rot.deg, { origin: [fxToPt(it.rot.cx), fxToPt(it.rot.cy)] })
			switch (it.k) {
				case 'glyphs': {
					// Transparent text stays selectable; writeGlyphRun's own fillColor keeps the opacity.
					const [color, alpha] = pdfColor(it.color) ?? ['#000000', 0]
					doc.fillColor(color, alpha)
					writeGlyphRun(doc, faces.get(it.font.sha256)!, { ...it, color })
					break
				}
				case 'rect':
					writeRect(doc, it)
					break
				case 'line':
					writeLine(doc, it)
					break
				case 'path':
					writePath(doc, it)
					break
				case 'image':
					await writeImage(doc, it, images, fetchImage, env.signal, env.onMissingImage)
					break
				case 'embed':
					if (env.embeds) {
						svgEnv ??= await svgEnvOf(doc, faces, env.fonts)
						link = await writeSvgEmbed(doc, it, env.embeds[it.frameId], svgEnv)
					} else writeEmbed(doc, it)
					break
			}
			doc.restore()
			doc.endMarkedContent()
			// The `cl:` address is checked by `safeDocRef` (`writeLink` would drop it).
			if (link) tags.link(p, link, (fn) => fn(...linkRect(link), link.href))
		}
		addBookmarks(doc, p, i, outline)
		env.onProgress?.(i + 1, pages.length)
	}
	tags.end()
	doc.end()
	await ended

	const out = new Uint8Array(chunks.reduce((len, c) => len + c.length, 0))
	let at = 0
	for (const c of chunks) {
		out.set(c, at)
		at += c.length
	}
	return out
}

type LinkItem = Extract<DLItem, { k: 'link' }>

const UNAVAILABLE = 'Content unavailable'

/** Shaping + face embedding for `svgToPdf`: faces join `faces` (shared with the glyph runs) on first use. */
async function svgEnvOf(
	doc: PdfGfx,
	faces: Map<string, PdfFace>,
	fonts: FetchBytes
): Promise<SvgPdfEnv> {
	await initHarfBuzz()
	return {
		registry: new FontRegistry(),
		async face(ref) {
			await loadFace(ref, fonts)
			let f = faces.get(ref.sha256)
			if (!f) {
				f = await embedOneFace(doc, ref, fonts)
				faces.set(ref.sha256, f)
			}
			return f
		}
	}
}

const xml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A neutral box with the source title and "Content unavailable" (the address is not printed). */
function unavailableSvg(b: Box, title?: string, opaque = false): string {
	const w = fxToPt(b.w)
	const h = fxToPt(b.h)
	const p = EMBED_PLACEHOLDER
	const line = (y: number, s: string, size: number) =>
		`<text x="${w / 2}" y="${y}" text-anchor="middle" font-size="${size}" fill="#555555">${xml(s)}</text>`
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
		(opaque ? `<rect width="${w}" height="${h}" fill="#ffffff"/>` : '') +
		`<rect width="${w}" height="${h}" fill="#000000" fill-opacity="${p.fill}" stroke="#000000" stroke-opacity="${p.stroke}" stroke-width="${p.width}"/>` +
		(title ? line(h / 2 - 2, title, 10) : '') +
		line(title ? h / 2 + 11 : h / 2 + 3, UNAVAILABLE, 9) +
		'</svg>'
	)
}

/**
 * An embed from its render SVG. A missing or unusable one is the "Content unavailable" box; its
 * address link annotation is returned, to be written outside the item's marked content.
 */
async function writeSvgEmbed(
	doc: PdfGfx,
	it: Extract<DLItem, { k: 'embed' }>,
	e: PdfEmbed | undefined,
	env: SvgPdfEnv
): Promise<LinkItem | undefined> {
	let failed = false
	if (e?.svg) {
		doc.save()
		try {
			if (await svgToPdf(doc, e.svg, it.box, env)) return
		} catch (err) {
			// what painted before the throw stays in the content stream, hidden under an
			// opaque fallback (white, so it assumes a white page); dropping it needs content rollback.
			failed = true
			console.warn(`PDF: embed ${it.frameId} could not be converted`, err)
		} finally {
			doc.restore()
		}
	}
	doc.save()
	try {
		const title = typeof e?.title === 'string' ? e.title : undefined
		await svgToPdf(doc, unavailableSvg(it.box, title, failed), it.box, env)
	} catch (err) {
		// No usable face for the label: the plain placeholder box, no text.
		console.warn(`PDF: embed ${it.frameId} fallback could not be drawn`, err)
		writeEmbed(doc, it)
	} finally {
		doc.restore()
	}
	const href = safeDocRef(e?.address)
	return href ? { k: 'link', box: it.box, href, rot: it.rot } : undefined
}

interface Outline {
	/** Open bookmarks by heading level, outermost first. */
	stack: { lvl: number; item: PdfOutline }[]
	/** Headings already bookmarked (`bid`), so one split across pages is listed once. */
	seen: Set<string>
}

/** Bookmarks for the H1–H6 tags of page `p` (the current pdfkit page), in paint order. */
function addBookmarks(doc: PdfGfx, p: PageDL, index: number, o: Outline): void {
	const nodes = new Map<number, TagNode>()
	const walk = (ts: TagNode[]) => {
		for (const t of ts) {
			if (/^H[1-6]$/.test(t.role)) nodes.set(t.id, t)
			if (t.children) walk(t.children)
		}
	}
	walk(p.tags)
	if (!nodes.size) return

	// Heading text as `svg/render.ts` `pageText` joins it: a space between lines.
	const heads = new Map<number, { text: string; y: number; lastY: number }>()
	for (const it of p.items) {
		if (it.k !== 'glyphs' || !nodes.has(it.tag)) continue
		const h = heads.get(it.tag)
		if (!h) heads.set(it.tag, { text: it.text, y: it.y - it.size, lastY: it.y })
		else {
			if (it.y !== h.lastY && !/\s$/.test(h.text)) h.text += ' '
			h.text += it.text
			h.lastY = it.y
		}
	}
	for (const [tag, h] of heads) {
		const node = nodes.get(tag)!
		const key = node.bid ?? `${index}:${tag}`
		const title = h.text.replace(/\s+/g, ' ').trim()
		if (o.seen.has(key) || !title) continue
		o.seen.add(key)
		const lvl = Number(node.role.slice(1))
		while (o.stack.length && o.stack[o.stack.length - 1].lvl >= lvl) o.stack.pop()
		const parent = o.stack[o.stack.length - 1]?.item ?? doc.outline
		// pdfkit writes `/XYZ (width − left) (height − top)`: left = width puts x at 0, `top` is
		// the distance from the page top (here: the first line's baseline minus the font size).
		const item = parent.addItem(title, {
			fit: false,
			left: fxToPt(p.page.w),
			top: Math.max(0, fxToPt(h.y))
		})
		o.stack.push({ lvl, item })
	}
}

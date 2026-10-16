// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Paints one page's display list onto a 2D canvas: the on-screen twin of the export renderer
 * `renderPageSvgStandalone` (`libs/typeset/src/svg/render.ts`), keep the two visually in step.
 * Glyphs are filled from cached `Path2D` outlines (`LayoutState.glyphDefs`), never `fillText`:
 * HarfBuzz glyph ids are not characters. Links are not painted (they stay clickable SVG).
 */

import {
	cropGeom,
	cropOf,
	type DLItem,
	EMBED_PLACEHOLDER,
	FX,
	glyphId,
	MISSING_IMAGE_ALPHA,
	type PageDL,
	type Rect
} from '@cloudillo/typeset'

/** Fx → pt. */
const pt = (fx: number) => fx / FX

export interface DrawOptions {
	/** Device px per pt. */
	scale: number
	/** Part of the page to draw, pt, page space; the whole page if omitted. */
	region?: Rect
	/** glyphId → SVG path `d`, font units, y up. */
	glyphs: Map<string, string>
	/** Loaded images by `fileId`. */
	images: Map<string, HTMLImageElement>
	/** Embed renders by DL `frameId` (`useEmbedRenders`); missing → placeholder box. */
	embeds: Map<string, HTMLImageElement>
}

// Unbounded; keys are content-addressed (font sha256 + gid), so it only grows with the
// distinct glyphs ever drawn. Add an LRU if memory shows up in profiles.
const pathCache = new Map<string, Path2D>()

/** The cached `Path2D` of glyph `id`, built from `d` on first use. */
export function glyphPath2D(id: string, d: string): Path2D {
	let p = pathCache.get(id)
	if (!p) {
		p = new Path2D(d)
		pathCache.set(id, p)
	}
	return p
}

const paints = (c: string | undefined): c is string => !!c && c !== 'none'

/** Paints `it` in pt space; returns true if a glyph outline was missing. */
function drawItem(ctx: CanvasRenderingContext2D, it: DLItem, opts: DrawOptions): boolean {
	switch (it.k) {
		case 'glyphs': {
			// base · translate(pt(x) + (pen + dx)/FX, pt(y) + dy/FX) · scale(s, -s), per glyph.
			const m = ctx.getTransform()
			const s = it.size / FX / it.font.upem
			const x0 = pt(it.x)
			const y0 = pt(it.y)
			let missing = false
			let pen = 0
			ctx.fillStyle = it.color
			for (let i = 0; i < it.glyphs.length; i++) {
				const id = glyphId(it.font, it.glyphs[i])
				const d = opts.glyphs.get(id)
				if (d === undefined) missing = true
				else if (d) {
					const tx = x0 + (pen + (it.offsets ? it.offsets[2 * i] : 0)) / FX
					const ty = y0 + (it.offsets ? it.offsets[2 * i + 1] : 0) / FX
					ctx.setTransform(
						m.a * s,
						m.b * s,
						-m.c * s,
						-m.d * s,
						m.a * tx + m.c * ty + m.e,
						m.b * tx + m.d * ty + m.f
					)
					ctx.fill(glyphPath2D(id, d))
				}
				pen += it.advances[i]
			}
			ctx.setTransform(m)
			return missing
		}
		case 'rect': {
			const b = it.box
			if (paints(it.fill)) {
				ctx.fillStyle = it.fill
				ctx.fillRect(pt(b.x), pt(b.y), pt(b.w), pt(b.h))
			}
			if (paints(it.stroke)) {
				ctx.strokeStyle = it.stroke
				ctx.lineWidth = it.strokeW !== undefined ? pt(it.strokeW) : 1
				ctx.strokeRect(pt(b.x), pt(b.y), pt(b.w), pt(b.h))
			}
			return false
		}
		case 'line':
			ctx.beginPath()
			ctx.moveTo(pt(it.x1), pt(it.y1))
			ctx.lineTo(pt(it.x2), pt(it.y2))
			ctx.strokeStyle = it.color
			ctx.lineWidth = pt(it.width)
			ctx.stroke()
			return false
		case 'path': {
			// `d` is in Fx: scale it, and keep the stroke width in Fx under the same scale.
			if (!paints(it.fill) && !paints(it.stroke)) return false
			const p = new Path2D(it.d)
			ctx.save()
			ctx.scale(1 / FX, 1 / FX)
			if (paints(it.fill)) {
				ctx.fillStyle = it.fill
				ctx.fill(p)
			}
			if (paints(it.stroke)) {
				ctx.strokeStyle = it.stroke
				ctx.lineWidth = it.strokeW ?? 1
				ctx.stroke(p)
			}
			ctx.restore()
			return false
		}
		case 'image': {
			const b = it.box
			const box = { x: pt(b.x), y: pt(b.y), w: pt(b.w), h: pt(b.h) }
			const img = opts.images.get(it.fileId)
			if (!img) {
				ctx.fillStyle = `rgb(0 0 0 / ${MISSING_IMAGE_ALPHA})`
				ctx.fillRect(box.x, box.y, box.w, box.h)
				return false
			}
			// Uncropped is the full crop: fill stretches, contain letterboxes (meet), cover clips
			// to the box (slice) — the same geometry as PageImage's preserveAspectRatio.
			const aspect = img.naturalWidth / img.naturalHeight
			const { full, clip } = cropGeom(box, cropOf(it.crop), it.fit, aspect)
			ctx.save()
			ctx.beginPath()
			ctx.rect(clip.x, clip.y, clip.w, clip.h)
			ctx.clip()
			ctx.drawImage(img, full.x, full.y, full.w, full.h)
			ctx.restore()
			return false
		}
		case 'embed': {
			const b = it.box
			const img = opts.embeds.get(it.frameId)
			if (img) {
				// Contain-fit: a resized frame shows its old render scaled until the new one lands.
				const box = { x: pt(b.x), y: pt(b.y), w: pt(b.w), h: pt(b.h) }
				const iw = img.naturalWidth || box.w
				const ih = img.naturalHeight || box.h
				const s = Math.min(box.w / iw, box.h / ih)
				const w = iw * s
				const h = ih * s
				ctx.drawImage(img, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h)
				return false
			}
			// Placeholder box until the render arrives (or when it failed).
			const p = EMBED_PLACEHOLDER
			ctx.fillStyle = `rgb(0 0 0 / ${p.fill})`
			ctx.fillRect(pt(b.x), pt(b.y), pt(b.w), pt(b.h))
			ctx.strokeStyle = `rgb(0 0 0 / ${p.stroke})`
			ctx.lineWidth = p.width
			ctx.strokeRect(pt(b.x), pt(b.y), pt(b.w), pt(b.h))
			return false
		}
		case 'link':
			return false
	}
}

/**
 * Clears the canvas and paints `dl.items` in order. Device px = `scale` × (pt − region origin).
 * `missingGlyphs`: some outline was not in `opts.glyphs` yet (redraw when it arrives).
 */
export function drawPage(
	ctx: CanvasRenderingContext2D,
	dl: PageDL,
	opts: DrawOptions
): { missingGlyphs: boolean } {
	const S = opts.scale
	const r = opts.region ?? { x: 0, y: 0, w: pt(dl.page.w), h: pt(dl.page.h) }
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.clearRect(0, 0, r.w * S, r.h * S)
	ctx.setTransform(S, 0, 0, S, -r.x * S, -r.y * S)
	// No culling of items outside `region`; canvas clips them cheaply. Add bbox culling if
	// region-mode redraws show up in profiles.
	let missingGlyphs = false
	for (const it of dl.items) {
		if (it.rot) {
			const cx = pt(it.rot.cx)
			const cy = pt(it.rot.cy)
			ctx.save()
			ctx.translate(cx, cy)
			ctx.rotate((it.rot.deg * Math.PI) / 180)
			ctx.translate(-cx, -cy)
		}
		if (drawItem(ctx, it, opts)) missingGlyphs = true
		if (it.rot) ctx.restore()
	}
	return { missingGlyphs }
}

// vim: ts=4

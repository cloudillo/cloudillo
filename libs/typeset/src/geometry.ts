// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Item geometry and placeholder styling shared by the renderers (canvas, frame overlay, SVG, PDF).

import type { Crop, ImageFrameData } from './model.js'

export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 }

/** The crop to draw: an uncropped item (`w` = 1) shows the whole source. */
export const cropOf = (c: Crop): Crop => (c.w < 1 ? c : FULL_CROP)

/** Black fill opacity of an image that is loading or could not be loaded. */
export const MISSING_IMAGE_ALPHA = 0.06

/** Embed placeholder box: black fill / stroke opacity, stroke width (pt). */
export const EMBED_PLACEHOLDER = { fill: 0.04, stroke: 0.2, width: 0.5 }

/** Authored link target, or undefined: only http(s), mailto and `#fragment` (no `javascript:`). */
export function safeHref(href: string): string | undefined {
	const s = href.trim()
	if (s.startsWith('#')) return s
	try {
		const u = new URL(s)
		return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:'
			? u.href
			: undefined
	} catch {
		return undefined
	}
}

/**
 * An embed's `cl:<appId>/<owner>:<fileId>[?nav=…]` address, or undefined (mirrors
 * `parseDocRef` in `@cloudillo/core`, which typeset does not depend on). `safeHref` rejects
 * `cl:`, so the PDF writer hands `writeLink` a stand-in href and the tagger this real one.
 */
export function safeDocRef(address: unknown): string | undefined {
	return typeof address === 'string' &&
		/^cl:[^/?\s]+\/[^/?\s:]+:[^/?\s]+(?:\?[^\s]*)?$/.test(address)
		? address
		: undefined
}

export interface Rect {
	x: number
	y: number
	w: number
	h: number
}

/**
 * Crop geometry of frame `box` showing crop `c` (fractions of the source) under `fit`:
 * `r` where the cropped region lands, `full` where the whole source image lands, `clip` the
 * visible part (`r` ∩ `box`). `aspect` = source width / height; without it `r` is the box.
 */
export function cropGeom(
	box: Rect,
	c: Rect,
	fit: ImageFrameData['fit'],
	aspect?: number
): { r: Rect; full: Rect; clip: Rect } {
	let r = box
	if (fit !== 'fill' && aspect) {
		const ra = (aspect * c.w) / c.h
		const w = (fit === 'cover') === ra > box.w / box.h ? box.h * ra : box.w
		const h = w / ra
		r = { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
	}
	const fw = r.w / c.w
	const fh = r.h / c.h
	const x = Math.max(r.x, box.x)
	const y = Math.max(r.y, box.y)
	return {
		r,
		full: { x: r.x - c.x * fw, y: r.y - c.y * fh, w: fw, h: fh },
		clip: {
			x,
			y,
			w: Math.min(r.x + r.w, box.x + box.w) - x,
			h: Math.min(r.y + r.h, box.y + box.h) - y
		}
	}
}

// vim: ts=4

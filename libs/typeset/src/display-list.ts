// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Display list: the engine ↔ renderers contract.
// All coordinates are Fx (1/1024 pt) in page space, y down, origin top-left.

import type { Fx } from './fixed.js'
import type { Box, Crop, ImageFrameData } from './model.js'

/** A resolved font face. Identity is `sha256` of the TTF bytes. */
export interface FontRef {
	family: string
	weight: number
	italic: boolean
	/** `<dir>/<File>.ttf` under `@cloudillo/fonts` `fonts/`. */
	file: string
	sha256: string
	upem: number
}

export type TagRole =
	| 'Document'
	| 'P'
	| 'H1'
	| 'H2'
	| 'H3'
	| 'H4'
	| 'H5'
	| 'H6'
	| 'Figure'
	| 'Artifact'
	| 'Table'
	| 'TR'
	| 'TH'
	| 'TD'
	| 'Note'
	| 'TOC'
	| 'TOCI'

/** Structure tree node (PDF/UA, a11y mirror). `DLItem.tag` refers to `id`. */
export interface TagNode {
	id: number
	role: TagRole
	/** Block id of the paragraph this node stands for. */
	bid?: string
	alt?: string
	lang?: string
	/** Id of the page-anchored frame it was laid out in; absent = the section's flow. */
	frame?: string
	children?: TagNode[]
}

/** Render-only rotation of a rotated frame's items: `deg` clockwise about (`cx`, `cy`). */
export interface Rot {
	deg: number
	cx: Fx
	cy: Fx
}

export type DLItem = (
	| {
			k: 'glyphs'
			font: FontRef
			size: Fx
			color: string
			/** Baseline origin of the first glyph. */
			x: Fx
			y: Fx
			glyphs: Uint16Array
			/** Per-glyph advance in Fx, justification and tracking included. */
			advances: Int32Array
			/** Per-glyph [dx, dy] pairs in Fx (length 2 × glyphs), omitted when all zero. */
			offsets?: Int32Array
			text: string
			/** Per-glyph UTF-16 offset into `text`. */
			clusters: Uint32Array
			tag: number
	  }
	| { k: 'rect'; box: Box; fill?: string; stroke?: string; strokeW?: Fx; tag?: number }
	| { k: 'line'; x1: Fx; y1: Fx; x2: Fx; y2: Fx; color: string; width: Fx; tag?: number }
	| {
			k: 'path'
			/** SVG path data in Fx. */
			d: string
			fill?: string
			stroke?: string
			strokeW?: Fx
			tag?: number
	  }
	| { k: 'image'; fileId: string; box: Box; crop: Crop; fit: ImageFrameData['fit']; tag: number }
	/** Filled by render SVG / live iframe. `frameId` = frame id, or the block's `bid` inline. */
	| { k: 'embed'; frameId: string; box: Box; tag: number }
	| { k: 'link'; box: Box; href: string }
) & { rot?: Rot }

/** Hit-testing / caret / a11y geometry of one line (not painted). */
export interface LineGeom {
	story: string
	bid: string
	/**
	 * Offsets within paragraph `bid` of `story` (its text, inline embeds one character each), not
	 * story offsets: an edit in one paragraph leaves every other paragraph's lines unchanged. To
	 * get a story offset, add the paragraph's start. Tag ids (paragraph index + 1) still shift when
	 * a paragraph is inserted or deleted.
	 */
	from: number
	to: number
	/** Row index in paragraph `bid`; lines of a row wrapped around a frame share it (and `y`). */
	row: number
	x: Fx
	/** Baseline. */
	y: Fx
	ascent: Fx
	descent: Fx
	/** Absolute x of each cluster boundary. */
	carets: Int32Array
	/** Ghost prompt of an empty paragraph with a placeholder; overlay only. */
	placeholder?: string
	/** Table cell lines: the cell's horizontal extent (absolute), for hit-testing. */
	cell?: { x: Fx; w: Fx }
	/** Its rotated frame's rotation; the fields above are in the frame's unrotated space. */
	rot?: Rot
}

export interface PageDL {
	page: { sec: string; index: number; w: Fx; h: Fx; master: string; side?: 'l' | 'r' }
	/** Paint order. */
	items: DLItem[]
	lines: LineGeom[]
	tags: TagNode[]
	rev: number
}

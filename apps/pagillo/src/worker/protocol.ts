// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Main ↔ layout worker messages. Type-only: imported by both sides.
 * The worker keeps a mirror Y.Doc (`init` = full state, then every main-doc `update`), lays out
 * with `@cloudillo/typeset` and posts `fonts` (new glyph outlines), `pages` (changed page display
 * lists, viewport first; typed arrays transferred) and `layout` (always, once per pass) in that order.
 */

import type { EngineLayout, FontRef, PageDL } from '@cloudillo/typeset'

export type MainToWorker =
	/** `fontBase` prefixes `fontUrl(ref)` (`/fonts/<dir>/<File>.ttf`); harfbuzz.wasm is found beside the worker bundle. */
	| { type: 'init'; update: Uint8Array; fontBase: string }
	| { type: 'update'; u: Uint8Array }
	/** Global page indices `[from, to)` laid out / listed first. */
	| { type: 'viewport'; pages: [number, number] }
	/**
	 * IME composition shown before commit (local only, never in Y.Text): `text` is laid out
	 * underlined at Y.Text `offset` of `story`; `text: ''` clears it.
	 */
	| ({ type: 'compose' } & Composition)

export interface Composition {
	story: string
	offset: number
	text: string
}

/** Outlines of glyphs not sent before: font units, y up (`glyphPath`), keyed by gid. */
export interface FaceGlyphs {
	ref: FontRef
	unitsPerEm: number
	glyphs: Record<number, string>
}

export type WorkerToMain =
	| { type: 'fonts'; faces: FaceGlyphs[] }
	| { type: 'pages'; rev: number; pages: PageDL[] }
	| {
			type: 'layout'
			rev: number
			/** Count of `update` messages applied before this pass: pending while main sent more. */
			seq: number
			pageCount: number
			sections: EngineLayout['sections']
			overset: EngineLayout['overset']
	  }
	/** Worker/WASM/font failure: the engine stopped. */
	| { type: 'error'; message: string }

// vim: ts=4

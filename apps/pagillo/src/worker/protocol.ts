// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Main ↔ layout worker messages. Imported by both sides (types and `pageKey` only).
 * The worker keeps a mirror Y.Doc (`init` = full state, then every main-doc `update`), lays out
 * with `@cloudillo/typeset` and posts `fonts` (new glyph outlines), `pages` (changed page display
 * lists, viewport first; typed arrays transferred) and `layout` (always, once per pass) in that order.
 */

import type { EngineLayout, FontRef, PageDL } from '@cloudillo/typeset'
import type { PdfDownsample } from '@cloudillo/typeset/pdf'

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
	/** Write a PDF (one job at a time; a new one cancels the running one). `id` tags its replies. */
	| { type: 'pdf.export'; id: number; options: PdfExportOptions }
	| { type: 'pdf.cancel' }
	/** Spell checking on/off and the user's dictionary words (either may be absent). */
	| { type: 'spell.config'; on?: boolean; words?: string[] }
	/** Suggestions for `word` in `lang`; `id` tags the `spell.suggestions` reply. */
	| { type: 'spell.suggest'; id: number; word: string; lang: string }

/** Key of a page in `LayoutState.pages`. */
export function pageKey(sec: string, index: number): string {
	return `${sec}/${index}`
}

export interface PdfExportOptions {
	/** Page keys (`pageKey`) to write, in flow order; absent = every page. */
	pages?: string[]
	pdfa: boolean
	downsample: PdfDownsample
	/** Document title (`/Title`), main's fallback already applied. */
	title: string
	/**
	 * Image source: `<api>/files/<fileId>?variant=…` (`api` = `getApiUrl(ownerTag)`), the token
	 * sent as `Authorization: Bearer`.
	 */
	files: { api: string; token?: string }
}

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

/**
 * A misspelt word: offsets within its paragraph (like `LineGeom.from/to`); `lang` of the check.
 * `word` is the text checked, to tell a range gone stale by later edits.
 */
export interface SpellRange {
	from: number
	to: number
	lang: string
	word: string
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
	/** PDF job: fires after each written page. */
	| { type: 'pdf.progress'; id: number; done: number; total: number }
	/** `missing` = images written as blank placeholders (fetch or decode failed). */
	| { type: 'pdf.done'; id: number; blob: Blob; missing: number }
	/** The job failed (a cancelled job posts nothing). */
	| { type: 'pdf.error'; id: number; message: string }
	/** Misspellings of paragraph `bid` of `story`; `[]` clears it. */
	| { type: 'spell'; story: string; bid: string; ranges: SpellRange[] }
	| { type: 'spell.suggestions'; id: number; words: string[] }

// vim: ts=4

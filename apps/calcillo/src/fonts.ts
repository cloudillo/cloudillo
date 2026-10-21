// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Calcillo's font list: the editor and the PDF/SVG render draw the same bundled faces.
 *
 * The toolbar stores names; a missing or `0` `ff` is the default (`CALC_FONTS[0]`). A stored numeric
 * `ff` 1–3 (old/imported data) indexes Fortune's original list: every read path maps it via
 * `legacyFontName` before the editor or a render sees it, and the app rewrites it to the name on
 * load when it can write. On write, `setCell` turns an editor index into `CALC_FONTS[i]`. Legacy system
 * names (`'Arial'`, `'Times New Roman'`, …) are aliased in the editor to the file
 * `resolveFontFamily` picks for the PDF.
 */

import {
	FALLBACK_FONTS,
	FONTS,
	getFontFileUrl,
	loadFontFaces,
	resolveFontFamily
} from '@cloudillo/fonts'
import { type Cell, locale, type Sheet } from '@fortune-sheet/core'

/** Index 0 is the default for cells with no `ff` */
export const CALC_FONTS: string[] = [
	'Lato',
	...FONTS.map((f) => f.family).filter((f) => f !== 'Lato')
]

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'system-ui'])
const WEIGHTS = ['normal', 'bold'] as const
const STYLES = ['normal', 'italic'] as const
const FONT_LOAD_TIMEOUT_MS = 3000

/** Fortune's original `fontarray`, which numeric `ff`s from old/imported data index */
const LEGACY_FONTS = ['Times New Roman', 'Arial', 'Tahoma', 'Verdana']

/** The legacy name a numeric `ff` 1–3 stands for; undefined for 0/missing/names */
export function legacyFontName(ff: Cell['ff']): string | undefined {
	if (ff == null || ff === '') return undefined
	const i = Number(ff)
	return Number.isInteger(i) && i >= 1 && i <= 3 ? LEGACY_FONTS[i] : undefined
}

/** A numeric `ff` i (≠ 0) from the editor is the `CALC_FONTS[i]` it showed; anything else unchanged */
export function editorFontName(ff: Cell['ff']): Cell['ff'] {
	if (ff == null || ff === '') return ff
	const i = Number(ff)
	return Number.isInteger(i) && i !== 0 ? (CALC_FONTS[i] ?? ff) : ff
}

/** The family a cell's `ff` names in the editor (unresolved) */
function cellFamily(ff: Cell['ff']): string {
	const legacy = legacyFontName(ff)
	if (legacy) return legacy
	const named = typeof ff === 'string' && ff !== '' && Number.isNaN(Number(ff))
	return named ? ff.replace(/["']/g, '') : CALC_FONTS[0]
}

/** The bundled family a cell's `ff` draws with */
export function fontFamily(ff: Cell['ff']): string {
	return resolveFontFamily(cellFamily(ff))
}

/** Swap Fortune's font list and alias legacy system names. Once, before the Workbook mounts. */
export function installCalcFonts(): void {
	// Mutates Fortune's locale object; Fortune has no font-list prop
	const fa = locale({ lang: 'en' } as never).fontarray
	fa.splice(0, fa.length, ...CALC_FONTS)

	for (const [name, target] of Object.entries(FALLBACK_FONTS)) {
		if (GENERIC.has(name)) continue
		for (const weight of WEIGHTS) {
			for (const style of STYLES) {
				const url = getFontFileUrl(target, weight, style)
				if (url) document.fonts.add(new FontFace(name, `url(${url})`, { weight, style }))
			}
		}
	}
}

/**
 * Load the default family and every family the sheets' cells use, all four faces each.
 * Fortune caches text measurements per font string and its canvas doesn't repaint when a font
 * arrives, so this has to finish before the first paint.
 */
export async function loadCalcFonts(sheets: Sheet[]): Promise<void> {
	const families = new Set([CALC_FONTS[0]])
	for (const s of sheets) {
		for (const c of s.celldata ?? []) {
			if (c.v && typeof c.v === 'object' && c.v.ff != null) families.add(cellFamily(c.v.ff))
		}
	}
	// Fonts picked later from the toolbar, or arriving after the timeout, show on the next redraw
	await loadFontFaces(
		[...families].flatMap((family) =>
			WEIGHTS.flatMap((weight) => STYLES.map((style) => ({ family, weight, style })))
		),
		FONT_LOAD_TIMEOUT_MS
	)
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Register bundled TTF fonts with a jsPDF instance — structurally typed, so this package has no
 * runtime jsPDF dependency.
 */

import { type FontFaceRef, fetchFontBase64, getFontFileUrl } from './font-files.js'

/** The slice of jsPDF that font registration needs */
export interface PdfFontTarget {
	addFileToVFS(filename: string, data: string): unknown
	addFont(filename: string, family: string, fontStyle: string): unknown
}

/** Faces already registered, per PDF instance (`family|weight|style`) */
const registered = new WeakMap<PdfFontTarget, Set<string>>()

function jsPdfStyle(face: FontFaceRef): string {
	if (face.weight === 'bold') return face.style === 'italic' ? 'bolditalic' : 'bold'
	return face.style === 'italic' ? 'italic' : 'normal'
}

/** The family's bundled faces (up to four) as react-pdf `Font.register` sources */
export function fontFaceSources(
	family: string
): { src: string; fontWeight: 400 | 700; fontStyle: 'normal' | 'italic' }[] {
	const out: { src: string; fontWeight: 400 | 700; fontStyle: 'normal' | 'italic' }[] = []
	for (const weight of ['normal', 'bold'] as const) {
		for (const fontStyle of ['normal', 'italic'] as const) {
			const src = getFontFileUrl(family, weight, fontStyle)
			if (src) out.push({ src, fontWeight: weight === 'bold' ? 700 : 400, fontStyle })
		}
	}
	return out
}

/**
 * Register each face with `pdf` under the family name given (the file follows the fallback map,
 * so `Arial` registers Lato's file as `Arial`). Faces are registered once per PDF; unknown or
 * unloadable faces are skipped with a warning. `onProgress(done, total)` fires after each face.
 * Resolves to the number of faces available in `pdf` afterwards.
 */
export async function registerPdfFonts(
	pdf: PdfFontTarget,
	faces: Iterable<FontFaceRef>,
	onProgress?: (done: number, total: number) => void
): Promise<number> {
	let done = registered.get(pdf)
	if (!done) {
		done = new Set()
		registered.set(pdf, done)
	}
	const list = Array.from(faces)
	let ok = 0
	for (const [i, face] of list.entries()) {
		const key = `${face.family}|${face.weight}|${face.style}`
		if (done.has(key)) ok++
		else {
			const url = getFontFileUrl(face.family, face.weight, face.style)
			const data = url && (await fetchFontBase64(url))
			if (url && data) {
				const filename = url.slice(url.lastIndexOf('/') + 1)
				try {
					pdf.addFileToVFS(filename, data)
					pdf.addFont(filename, face.family, jsPdfStyle(face))
					done.add(key)
					ok++
				} catch (error) {
					console.warn(`Failed to register font ${face.family}:`, error)
				}
				// svg2pdf measures text (for `text-anchor`) in the browser: load the same face there
				try {
					await globalThis.document?.fonts?.load(
						`${face.style === 'italic' ? 'italic ' : ''}${face.weight === 'bold' ? 'bold ' : ''}16px "${face.family}"`
					)
				} catch (error) {
					console.warn(`Failed to load font ${face.family} in the browser:`, error)
				}
			}
		}
		onProgress?.(i + 1, list.length)
	}
	return ok
}

// vim: ts=4

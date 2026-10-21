// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Font file lookup: CSS family name → static TTF file served by the shell at
 * `/fonts/<dir>/<Base>-<Regular|Bold>[Italic].ttf` (app-relative absolute path, no origin).
 */

import { FONTS } from './metadata.js'

export type FontFileWeight = 'normal' | 'bold'
export type FontFileStyle = 'normal' | 'italic'

/** One concrete face of a family */
export interface FontFaceRef {
	family: string
	weight: FontFileWeight
	style: FontFileStyle
}

/** Family → directory under `fonts/` and the faces it ships, derived from `FONTS` */
const FONT_DIRS = new Map(
	FONTS.map((f) => [
		f.family,
		{
			dir: f.directory,
			bold: f.weights.some((w) => w.value >= 700),
			italic: f.hasItalic
		}
	])
)

/** System fonts and generic CSS family names → closest bundled family */
export const FALLBACK_FONTS: Readonly<Record<string, string>> = {
	// CSS generic font families
	'system-ui': 'Lato',
	'sans-serif': 'Lato',
	serif: 'DM Serif Display',
	monospace: 'JetBrains Mono',

	// System font names -> closest Google Font equivalent
	Arial: 'Lato',
	Helvetica: 'Lato',
	'Times New Roman': 'Merriweather',
	Georgia: 'Lora',
	Verdana: 'Open Sans',
	Tahoma: 'Roboto',
	'Courier New': 'JetBrains Mono',
	Monaco: 'JetBrains Mono'
}

/** The bundled family to use for `family`: itself, its fallback, or 'Lato' */
export function resolveFontFamily(family: string): string {
	if (FONT_DIRS.has(family)) return family
	const fallback = FALLBACK_FONTS[family]
	return fallback && FONT_DIRS.has(fallback) ? fallback : 'Lato'
}

/** `dm-sans` → `DmSans` (the file base name convention) */
function baseName(directory: string): string {
	return directory
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('')
}

/**
 * TTF URL for a face, following the fallback map; null for unknown families. A face the
 * family doesn't ship falls back to the closest one it does (Regular, non-italic).
 * Origin-relative: relies on the API domain serving `/fonts/` with CORS (app iframes have an opaque origin).
 */
export function getFontFileUrl(
	family: string,
	weight: FontFileWeight,
	style: FontFileStyle
): string | null {
	const font = FONT_DIRS.get(family) ?? FONT_DIRS.get(FALLBACK_FONTS[family] ?? '')
	if (!font) return null
	const { dir } = font
	const weightPart = weight === 'bold' && font.bold ? 'Bold' : 'Regular'
	const stylePart = style === 'italic' && font.italic ? 'Italic' : ''
	return `/fonts/${dir}/${baseName(dir)}-${weightPart}${stylePart}.ttf`
}

const base64Cache = new Map<string, Promise<string | null>>()

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	let binary = ''
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
	}
	return btoa(binary)
}

/** Fetch a font file as base64, cached per URL; null (warned, not cached) on failure */
export function fetchFontBase64(url: string): Promise<string | null> {
	let pending = base64Cache.get(url)
	if (!pending) {
		pending = (async () => {
			try {
				const res = await fetch(url)
				if (res.ok) return arrayBufferToBase64(await res.arrayBuffer())
				console.warn(`Font not found: ${url}`)
			} catch (error) {
				console.warn(`Failed to fetch font ${url}:`, error)
			}
			base64Cache.delete(url)
			return null
		})()
		base64Cache.set(url, pending)
	}
	return pending
}

// vim: ts=4

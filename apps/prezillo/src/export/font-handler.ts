// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Font handler for PDF export
 *
 * This module handles font loading and registration for jsPDF.
 * jsPDF requires TTF fonts to be registered before they can be used in PDFs.
 */

import type { jsPDF } from 'jspdf'
import type { PrezilloObject, TextObject, YPrezilloDocument, ViewNode } from '../crdt'
import { resolveTextStyle } from '../crdt'

/**
 * Font variant key for lookup
 */
interface FontVariant {
	weight: 'normal' | 'bold'
	style: 'normal' | 'italic'
}

/**
 * Font file mapping - maps font family to directory and file naming pattern
 */
interface FontMapping {
	directory: string
	baseName: string
}

/**
 * All fonts now have static TTF files for PDF embedding.
 * Variable fonts are converted to static using fonttools instancer.
 * This set includes all supported fonts.
 */
const SUPPORTED_FONTS = new Set([
	// Sans-serif
	'Lato',
	'Poppins',
	'Roboto',
	'Open Sans',
	'Montserrat',
	'Inter',
	'Nunito Sans',
	'Work Sans',
	'Raleway',
	'DM Sans',
	'Source Sans 3',
	// Serif
	'DM Serif Display',
	'Playfair Display',
	'Merriweather',
	'Lora',
	'Crimson Pro',
	'Source Serif 4',
	// Display
	'Bebas Neue',
	'Abril Fatface',
	'Permanent Marker',
	'Oswald',
	// Monospace
	'JetBrains Mono'
])

/**
 * Mapping from CSS font-family names to font directory info
 * All fonts now have static TTF files for PDF embedding
 */
const FONT_MAPPINGS: Record<string, FontMapping> = {
	// Sans-serif
	Lato: { directory: 'lato', baseName: 'Lato' },
	Poppins: { directory: 'poppins', baseName: 'Poppins' },
	Roboto: { directory: 'roboto', baseName: 'Roboto' },
	'Open Sans': { directory: 'open-sans', baseName: 'OpenSans' },
	Montserrat: { directory: 'montserrat', baseName: 'Montserrat' },
	Inter: { directory: 'inter', baseName: 'Inter' },
	'Nunito Sans': { directory: 'nunito-sans', baseName: 'NunitoSans' },
	'Work Sans': { directory: 'work-sans', baseName: 'WorkSans' },
	Raleway: { directory: 'raleway', baseName: 'Raleway' },
	'DM Sans': { directory: 'dm-sans', baseName: 'DmSans' },
	'Source Sans 3': { directory: 'source-sans-3', baseName: 'SourceSans3' },
	// Serif
	'DM Serif Display': { directory: 'dm-serif-display', baseName: 'DmSerifDisplay' },
	'Playfair Display': { directory: 'playfair-display', baseName: 'PlayfairDisplay' },
	Merriweather: { directory: 'merriweather', baseName: 'Merriweather' },
	Lora: { directory: 'lora', baseName: 'Lora' },
	'Crimson Pro': { directory: 'crimson-pro', baseName: 'CrimsonPro' },
	'Source Serif 4': { directory: 'source-serif-4', baseName: 'SourceSerif4' },
	// Display
	'Bebas Neue': { directory: 'bebas-neue', baseName: 'BebasNeue' },
	'Abril Fatface': { directory: 'abril-fatface', baseName: 'AbrilFatface' },
	'Permanent Marker': { directory: 'permanent-marker', baseName: 'PermanentMarker' },
	Oswald: { directory: 'oswald', baseName: 'Oswald' },
	// Monospace
	'JetBrains Mono': { directory: 'jetbrains-mono', baseName: 'JetbrainsMono' }
}

/**
 * Fallback font mapping for system fonts and generic CSS font names.
 * All Google Fonts now have static TTFs, so only system fonts need fallbacks.
 */
const FALLBACK_FONTS: Record<string, string> = {
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

/**
 * Cache for loaded font data
 */
const fontCache = new Map<string, string>()

/**
 * Track which fonts have been registered with a PDF instance
 */
const registeredFonts = new WeakMap<jsPDF, Set<string>>()

/**
 * Get the TTF filename for a font variant
 */
function getTTFFilename(
	baseName: string,
	weight: 'normal' | 'bold',
	style: 'normal' | 'italic'
): string {
	const weightPart = weight === 'bold' ? 'Bold' : 'Regular'
	const stylePart = style === 'italic' ? 'Italic' : ''

	// Naming convention: Roboto-Regular.ttf, Roboto-Bold.ttf, Roboto-RegularItalic.ttf, Roboto-BoldItalic.ttf
	return `${baseName}-${weightPart}${stylePart}.ttf`
}

/**
 * Get the URL for a TTF font file
 * All supported fonts now have static TTF files available.
 */
function getTTFUrl(
	family: string,
	weight: 'normal' | 'bold',
	style: 'normal' | 'italic'
): string | null {
	const mapping = FONT_MAPPINGS[family]
	if (!mapping) {
		// Try fallback for system fonts and generic font names
		const fallback = FALLBACK_FONTS[family]
		if (fallback && FONT_MAPPINGS[fallback]) {
			return getTTFUrl(fallback, weight, style)
		}
		return null
	}

	const filename = getTTFFilename(mapping.baseName, weight, style)
	return `/fonts/${mapping.directory}/${filename}`
}

/**
 * Fetch a TTF font file and convert to base64
 */
async function fetchFontAsBase64(url: string): Promise<string | null> {
	// Check cache first
	if (fontCache.has(url)) {
		return fontCache.get(url)!
	}

	try {
		const response = await fetch(url)
		if (!response.ok) {
			console.warn(`Font not found: ${url}`)
			return null
		}

		const arrayBuffer = await response.arrayBuffer()
		const base64 = arrayBufferToBase64(arrayBuffer)
		fontCache.set(url, base64)
		return base64
	} catch (error) {
		console.warn(`Failed to fetch font ${url}:`, error)
		return null
	}
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	let binary = ''
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i])
	}
	return btoa(binary)
}

/**
 * Get jsPDF font style string
 */
function getJsPDFFontStyle(weight: 'normal' | 'bold', style: 'normal' | 'italic'): string {
	if (weight === 'bold' && style === 'italic') return 'bolditalic'
	if (weight === 'bold') return 'bold'
	if (style === 'italic') return 'italic'
	return 'normal'
}

/**
 * Register a single font variant with jsPDF
 */
async function registerFontVariant(
	pdf: jsPDF,
	family: string,
	weight: 'normal' | 'bold',
	style: 'normal' | 'italic'
): Promise<boolean> {
	const fontKey = `${family}-${weight}-${style}`

	// Check if already registered
	let registered = registeredFonts.get(pdf)
	if (!registered) {
		registered = new Set()
		registeredFonts.set(pdf, registered)
	}

	if (registered.has(fontKey)) {
		return true
	}

	// Get font URL
	const url = getTTFUrl(family, weight, style)
	if (!url) {
		return false
	}

	// Fetch font data
	const fontData = await fetchFontAsBase64(url)
	if (!fontData) {
		return false
	}

	// Get filename for VFS
	const mapping = FONT_MAPPINGS[family] || FONT_MAPPINGS[FALLBACK_FONTS[family] || '']
	if (!mapping) {
		return false
	}

	const filename = getTTFFilename(mapping.baseName, weight, style)
	const fontStyle = getJsPDFFontStyle(weight, style)

	try {
		// Add font to jsPDF virtual file system
		pdf.addFileToVFS(filename, fontData)

		// Register the font
		pdf.addFont(filename, family, fontStyle)

		registered.add(fontKey)
		return true
	} catch (error) {
		console.warn(`Failed to register font ${family}:`, error)
		return false
	}
}

/**
 * Collect all unique fonts used in a document
 */
export function collectUsedFonts(
	doc: YPrezilloDocument,
	_views?: ViewNode[]
): Set<{ family: string; weight: 'normal' | 'bold'; style: 'normal' | 'italic' }> {
	const fonts = new Set<{
		family: string
		weight: 'normal' | 'bold'
		style: 'normal' | 'italic'
	}>()

	// Track unique combinations using string keys
	const fontKeys = new Set<string>()

	function addFont(family: string, weight: number | string, italic: boolean) {
		const normalizedFamily = family || 'Roboto'
		const normalizedWeight: 'normal' | 'bold' = Number(weight) >= 700 ? 'bold' : 'normal'
		const normalizedStyle: 'normal' | 'italic' = italic ? 'italic' : 'normal'

		const key = `${normalizedFamily}|${normalizedWeight}|${normalizedStyle}`
		if (!fontKeys.has(key)) {
			fontKeys.add(key)
			fonts.add({
				family: normalizedFamily,
				weight: normalizedWeight,
				style: normalizedStyle
			})
		}
	}

	// Iterate through all objects in the document
	doc.o.forEach((stored) => {
		// Check for text objects (t === 'T' means text type)
		if (stored.t === 'T') {
			// Use resolveTextStyle to get the fully resolved font info (includes styles)
			const textStyle = resolveTextStyle(doc, stored)
			const fontFamily = textStyle.fontFamily || 'Roboto'
			const fontWeight = textStyle.fontWeight || 400
			const fontItalic = textStyle.fontItalic || false

			addFont(fontFamily, fontWeight, fontItalic)
		}
	})

	return fonts
}

/**
 * Register all fonts used in a document with jsPDF
 *
 * All Google Fonts now have static TTF files available for embedding.
 * Variable fonts are converted to static using fonttools instancer during build.
 */
export async function registerUsedFonts(
	pdf: jsPDF,
	doc: YPrezilloDocument,
	_views?: ViewNode[],
	onProgress?: (loaded: number, total: number) => void
): Promise<void> {
	const usedFonts = collectUsedFonts(doc)
	const fontArray = Array.from(usedFonts)
	let loaded = 0

	// Always register default font (Lato) as fallback
	if (!fontArray.some((f) => getPDFFontFamily(f.family) === 'Lato')) {
		await registerFontVariant(pdf, 'Lato', 'normal', 'normal')
		await registerFontVariant(pdf, 'Lato', 'bold', 'normal')
	}

	for (const font of fontArray) {
		// Get the actual font family (may fall back for system fonts)
		const actualFamily = getPDFFontFamily(font.family)

		// Register the font if it's a supported font
		if (SUPPORTED_FONTS.has(actualFamily)) {
			await registerFontVariant(pdf, actualFamily, font.weight, font.style)
		}

		loaded++
		onProgress?.(loaded, fontArray.length)
	}
}

/**
 * Register a specific font with jsPDF (for on-demand loading)
 */
export async function registerFont(
	pdf: jsPDF,
	family: string,
	weight: 'normal' | 'bold' = 'normal',
	style: 'normal' | 'italic' = 'normal'
): Promise<boolean> {
	return registerFontVariant(pdf, family, weight, style)
}

/**
 * Get the actual font family to use in PDF (handles fallbacks)
 * All Google Fonts now have static TTF files available.
 * Only system fonts need fallback mapping.
 */
export function getPDFFontFamily(family: string): string {
	// If this font is directly supported, use it
	if (SUPPORTED_FONTS.has(family)) {
		return family
	}

	// Try fallback for system fonts and generic CSS font names
	if (FALLBACK_FONTS[family] && SUPPORTED_FONTS.has(FALLBACK_FONTS[family])) {
		return FALLBACK_FONTS[family]
	}

	// Default fallback to Lato
	return 'Lato'
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Font files (TTF lookup, base64 fetch)
export {
	FALLBACK_FONTS,
	type FontFaceRef,
	type FontFileStyle,
	type FontFileWeight,
	fetchFontBase64,
	getFontFileUrl,
	resolveFontFamily
} from './font-files.js'
// Font metadata
export {
	FONTS,
	getFontsByCategory,
	getFontsByRole
} from './metadata.js'
// Font pairings
export {
	getSuggestedBodyFonts,
	getSuggestedHeadingFonts
} from './pairings.js'
// PDF (jsPDF) font registration
export { fontFaceSources, type PdfFontTarget, registerPdfFonts } from './pdf-fonts.js'
// SVG font collection
export { collectSvgFonts, firstFamily, loadFontFaces } from './svg-fonts.js'
// Types
export type {
	FontCategory,
	FontMetadata,
	FontPairing,
	FontRole,
	FontWeight
} from './types.js'

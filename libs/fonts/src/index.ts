// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Types

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
export type {
	FontCategory,
	FontMetadata,
	FontPairing,
	FontRole,
	FontWeight
} from './types.js'

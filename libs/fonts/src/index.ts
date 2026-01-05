// Types
export type {
	FontCategory,
	FontRole,
	FontWeight,
	FontMetadata,
	FontPairing
} from './types.js'

// Font metadata
export {
	FONTS,
	getFontByFamily,
	getFontsByCategory,
	getFontsByRole
} from './metadata.js'

// Font pairings
export {
	FONT_PAIRINGS,
	getPairingById,
	getPairingsForFont,
	getSuggestedBodyFonts,
	getSuggestedHeadingFonts
} from './pairings.js'

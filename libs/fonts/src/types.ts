/**
 * Font category classification
 */
export type FontCategory = 'sans-serif' | 'serif' | 'display' | 'monospace'

/**
 * Intended use role for a font
 */
export type FontRole = 'heading' | 'body' | 'display' | 'mono'

/**
 * Font weight definition
 */
export interface FontWeight {
	value: number
	label: string
	italic?: boolean
}

/**
 * Complete metadata for a single font family
 */
export interface FontMetadata {
	/** CSS font-family value (e.g., 'Roboto') */
	family: string
	/** Human-readable display name */
	displayName: string
	/** Font category for grouping */
	category: FontCategory
	/** Suitable roles for this font */
	roles: FontRole[]
	/** Available font weights */
	weights: FontWeight[]
	/** Whether italic variants are available */
	hasItalic: boolean
	/** License identifier */
	license: 'OFL' | 'Apache-2.0'
	/** Directory name in fonts/ folder */
	directory: string
}

/**
 * A curated font pairing (heading + body)
 */
export interface FontPairing {
	/** Unique identifier */
	id: string
	/** Human-readable name */
	name: string
	/** Font family for headings */
	heading: string
	/** Font family for body text */
	body: string
	/** Brief description of the pairing style */
	description: string
}

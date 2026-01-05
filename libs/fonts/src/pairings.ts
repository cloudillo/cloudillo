import type { FontPairing } from './types.js'

/**
 * Curated font pairings - heading + body combinations that work well together
 */
export const FONT_PAIRINGS: FontPairing[] = [
	{
		id: 'modern-professional',
		name: 'Modern Professional',
		heading: 'Oswald',
		body: 'Roboto',
		description: 'Clean, authoritative look for business presentations'
	},
	{
		id: 'elegant-editorial',
		name: 'Elegant Editorial',
		heading: 'Playfair Display',
		body: 'Source Sans 3',
		description: 'Sophisticated style for articles and long-form content'
	},
	{
		id: 'clean-modern',
		name: 'Clean Modern',
		heading: 'Montserrat',
		body: 'Open Sans',
		description: 'Contemporary geometric pairing for tech and startups'
	},
	{
		id: 'readable-classic',
		name: 'Readable Classic',
		heading: 'Merriweather',
		body: 'Lato',
		description: 'Warm, readable combination for blogs and documentation'
	},
	{
		id: 'contemporary-tech',
		name: 'Contemporary Tech',
		heading: 'Poppins',
		body: 'Inter',
		description: 'Modern geometric fonts for digital products'
	},
	{
		id: 'literary-warm',
		name: 'Literary Warm',
		heading: 'Lora',
		body: 'Nunito Sans',
		description: 'Classic serif heading with friendly body text'
	},
	{
		id: 'light-minimalist',
		name: 'Light Minimalist',
		heading: 'Raleway',
		body: 'Work Sans',
		description: 'Elegant, lightweight pairing for minimal designs'
	},
	{
		id: 'academic-formal',
		name: 'Academic Formal',
		heading: 'Crimson Pro',
		body: 'DM Sans',
		description: 'Scholarly serif with clean sans-serif body'
	},
	{
		id: 'bold-impact',
		name: 'Bold Impact',
		heading: 'Bebas Neue',
		body: 'Source Serif 4',
		description: 'High-contrast combination for impactful headlines'
	},
	{
		id: 'geometric-harmony',
		name: 'Geometric Harmony',
		heading: 'DM Serif Display',
		body: 'DM Sans',
		description: 'Cohesive DM family pairing with serif headings'
	}
]

/**
 * Get pairing by ID
 */
export function getPairingById(id: string): FontPairing | undefined {
	return FONT_PAIRINGS.find((p) => p.id === id)
}

/**
 * Get pairings that use a specific font
 */
export function getPairingsForFont(fontFamily: string): FontPairing[] {
	return FONT_PAIRINGS.filter((p) => p.heading === fontFamily || p.body === fontFamily)
}

/**
 * Get suggested body fonts for a given heading font
 */
export function getSuggestedBodyFonts(headingFont: string): string[] {
	return FONT_PAIRINGS.filter((p) => p.heading === headingFont).map((p) => p.body)
}

/**
 * Get suggested heading fonts for a given body font
 */
export function getSuggestedHeadingFonts(bodyFont: string): string[] {
	return FONT_PAIRINGS.filter((p) => p.body === bodyFont).map((p) => p.heading)
}

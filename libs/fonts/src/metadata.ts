import type { FontMetadata } from './types.js'

/**
 * Curated font collection metadata
 * All fonts are from Google Fonts, licensed under OFL or Apache 2.0
 */
export const FONTS: FontMetadata[] = [
	// Sans-serif fonts
	{
		family: 'Roboto',
		displayName: 'Roboto',
		category: 'sans-serif',
		roles: ['body', 'heading'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'Apache-2.0',
		directory: 'roboto'
	},
	{
		family: 'Open Sans',
		displayName: 'Open Sans',
		category: 'sans-serif',
		roles: ['body'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'open-sans'
	},
	{
		family: 'Montserrat',
		displayName: 'Montserrat',
		category: 'sans-serif',
		roles: ['heading', 'body'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'montserrat'
	},
	{
		family: 'Lato',
		displayName: 'Lato',
		category: 'sans-serif',
		roles: ['body'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'lato'
	},
	{
		family: 'Poppins',
		displayName: 'Poppins',
		category: 'sans-serif',
		roles: ['heading', 'body'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'poppins'
	},
	{
		family: 'Inter',
		displayName: 'Inter',
		category: 'sans-serif',
		roles: ['body'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'inter'
	},
	{
		family: 'Nunito Sans',
		displayName: 'Nunito Sans',
		category: 'sans-serif',
		roles: ['body'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'nunito-sans'
	},
	{
		family: 'Work Sans',
		displayName: 'Work Sans',
		category: 'sans-serif',
		roles: ['body'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'work-sans'
	},
	{
		family: 'Raleway',
		displayName: 'Raleway',
		category: 'sans-serif',
		roles: ['heading'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'raleway'
	},
	{
		family: 'DM Sans',
		displayName: 'DM Sans',
		category: 'sans-serif',
		roles: ['body'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'dm-sans'
	},
	{
		family: 'Source Sans 3',
		displayName: 'Source Sans 3',
		category: 'sans-serif',
		roles: ['body'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'source-sans-3'
	},

	// Serif fonts
	{
		family: 'Playfair Display',
		displayName: 'Playfair Display',
		category: 'serif',
		roles: ['heading', 'display'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'playfair-display'
	},
	{
		family: 'Merriweather',
		displayName: 'Merriweather',
		category: 'serif',
		roles: ['heading', 'body'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'merriweather'
	},
	{
		family: 'Lora',
		displayName: 'Lora',
		category: 'serif',
		roles: ['heading', 'body'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'lora'
	},
	{
		family: 'Crimson Pro',
		displayName: 'Crimson Pro',
		category: 'serif',
		roles: ['heading', 'body'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'crimson-pro'
	},
	{
		family: 'Source Serif 4',
		displayName: 'Source Serif 4',
		category: 'serif',
		roles: ['body'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'source-serif-4'
	},
	{
		family: 'DM Serif Display',
		displayName: 'DM Serif Display',
		category: 'serif',
		roles: ['heading', 'display'],
		weights: [{ value: 400, label: 'Regular' }],
		hasItalic: true,
		license: 'OFL',
		directory: 'dm-serif-display'
	},

	// Display fonts
	{
		family: 'Oswald',
		displayName: 'Oswald',
		category: 'display',
		roles: ['heading', 'display'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: false,
		license: 'OFL',
		directory: 'oswald'
	},
	{
		family: 'Bebas Neue',
		displayName: 'Bebas Neue',
		category: 'display',
		roles: ['heading', 'display'],
		weights: [{ value: 400, label: 'Regular' }],
		hasItalic: false,
		license: 'OFL',
		directory: 'bebas-neue'
	},
	{
		family: 'Abril Fatface',
		displayName: 'Abril Fatface',
		category: 'display',
		roles: ['display'],
		weights: [{ value: 400, label: 'Regular' }],
		hasItalic: false,
		license: 'OFL',
		directory: 'abril-fatface'
	},
	{
		family: 'Permanent Marker',
		displayName: 'Permanent Marker',
		category: 'display',
		roles: ['display'],
		weights: [{ value: 400, label: 'Regular' }],
		hasItalic: false,
		license: 'Apache-2.0',
		directory: 'permanent-marker'
	},

	// Monospace
	{
		family: 'JetBrains Mono',
		displayName: 'JetBrains Mono',
		category: 'monospace',
		roles: ['mono'],
		weights: [
			{ value: 400, label: 'Regular' },
			{ value: 700, label: 'Bold' }
		],
		hasItalic: true,
		license: 'OFL',
		directory: 'jetbrains-mono'
	}
]

/**
 * Get font metadata by family name
 */
export function getFontByFamily(family: string): FontMetadata | undefined {
	return FONTS.find((f) => f.family === family)
}

/**
 * Get fonts filtered by category
 */
export function getFontsByCategory(category: FontMetadata['category']): FontMetadata[] {
	return FONTS.filter((f) => f.category === category)
}

/**
 * Get fonts filtered by role
 */
export function getFontsByRole(role: FontMetadata['roles'][number]): FontMetadata[] {
	return FONTS.filter((f) => f.roles.includes(role))
}

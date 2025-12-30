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
 * Preset palettes/themes for the Prezillo presentation app
 *
 * Categories:
 * - Professional: Corporate, business-appropriate themes
 * - Vibrant: Bold, energetic color schemes
 * - Pastel: Soft, muted tones
 * - Dark: Dark backgrounds with vibrant accents
 */

import type { Palette } from './runtime-types'

export interface PalettePreset {
	id: string
	name: string
	category: 'professional' | 'vibrant' | 'pastel' | 'dark'
	palette: Palette
}

/**
 * All available palette presets
 */
export const PALETTE_PRESETS: PalettePreset[] = [
	// =========================================================================
	// Professional (3)
	// =========================================================================
	{
		id: 'corporate-blue',
		name: 'Corporate Blue',
		category: 'professional',
		palette: {
			name: 'Corporate Blue',
			background: { color: '#ffffff' },
			text: { color: '#1a1a2e' },
			accent1: { color: '#0066cc' }, // Primary blue
			accent2: { color: '#00a3e0' }, // Light blue
			accent3: { color: '#7ab800' }, // Green
			accent4: { color: '#ff6f00' }, // Orange
			accent5: { color: '#6b5b95' }, // Purple
			accent6: { color: '#88b04b' }, // Sage
			gradient1: {
				type: 'linear',
				angle: 135,
				stops: [
					{ color: '#0066cc', position: 0 },
					{ color: '#00a3e0', position: 1 }
				]
			},
			gradient2: {
				type: 'linear',
				angle: 180,
				stops: [
					{ color: '#0066cc', position: 0 },
					{ color: '#003d7a', position: 1 }
				]
			},
			gradient3: {
				type: 'radial',
				centerX: 0.5,
				centerY: 0.5,
				stops: [
					{ color: '#00a3e0', position: 0 },
					{ color: '#0066cc', position: 1 }
				]
			},
			gradient4: {
				type: 'linear',
				angle: 90,
				stops: [
					{ color: '#6b5b95', position: 0 },
					{ color: '#0066cc', position: 1 }
				]
			}
		}
	},
	{
		id: 'executive-gray',
		name: 'Executive Gray',
		category: 'professional',
		palette: {
			name: 'Executive Gray',
			background: { color: '#fafafa' },
			text: { color: '#2d3436' },
			accent1: { color: '#4a4a4a' }, // Charcoal
			accent2: { color: '#636e72' }, // Slate
			accent3: { color: '#00b894' }, // Teal
			accent4: { color: '#e17055' }, // Coral
			accent5: { color: '#74b9ff' }, // Sky blue
			accent6: { color: '#a29bfe' }, // Lavender
			gradient1: {
				type: 'linear',
				angle: 180,
				stops: [
					{ color: '#4a4a4a', position: 0 },
					{ color: '#2d3436', position: 1 }
				]
			},
			gradient2: {
				type: 'linear',
				angle: 135,
				stops: [
					{ color: '#636e72', position: 0 },
					{ color: '#4a4a4a', position: 1 }
				]
			},
			gradient3: {
				type: 'radial',
				centerX: 0.5,
				centerY: 0.5,
				stops: [
					{ color: '#74b9ff', position: 0 },
					{ color: '#0984e3', position: 1 }
				]
			},
			gradient4: {
				type: 'linear',
				angle: 90,
				stops: [
					{ color: '#00b894', position: 0 },
					{ color: '#00cec9', position: 1 }
				]
			}
		}
	},
	{
		id: 'modern-minimal',
		name: 'Modern Minimal',
		category: 'professional',
		palette: {
			name: 'Modern Minimal',
			background: { color: '#ffffff' },
			text: { color: '#2d3436' },
			accent1: { color: '#2d3436' }, // Near black
			accent2: { color: '#00cec9' }, // Cyan
			accent3: { color: '#636e72' }, // Gray
			accent4: { color: '#ff7675' }, // Coral pink
			accent5: { color: '#fdcb6e' }, // Yellow
			accent6: { color: '#00b894' }, // Green
			gradient1: {
				type: 'linear',
				angle: 135,
				stops: [
					{ color: '#2d3436', position: 0 },
					{ color: '#636e72', position: 1 }
				]
			},
			gradient2: {
				type: 'linear',
				angle: 90,
				stops: [
					{ color: '#00cec9', position: 0 },
					{ color: '#00b894', position: 1 }
				]
			},
			gradient3: {
				type: 'radial',
				centerX: 0.5,
				centerY: 0.5,
				stops: [
					{ color: '#ff7675', position: 0 },
					{ color: '#d63031', position: 1 }
				]
			},
			gradient4: {
				type: 'linear',
				angle: 180,
				stops: [
					{ color: '#fdcb6e', position: 0 },
					{ color: '#f39c12', position: 1 }
				]
			}
		}
	},

	// =========================================================================
	// Vibrant (3)
	// =========================================================================
	{
		id: 'sunset-glow',
		name: 'Sunset Glow',
		category: 'vibrant',
		palette: {
			name: 'Sunset Glow',
			background: { color: '#fff5f5' },
			text: { color: '#2d1f3d' },
			accent1: { color: '#ff6b6b' }, // Coral red
			accent2: { color: '#ffa502' }, // Orange
			accent3: { color: '#ff4757' }, // Hot pink
			accent4: { color: '#ffc048' }, // Gold
			accent5: { color: '#a55eea' }, // Purple
			accent6: { color: '#ff9ff3' }, // Pink
			gradient1: {
				type: 'linear',
				angle: 135,
				stops: [
					{ color: '#ff6b6b', position: 0 },
					{ color: '#ffa502', position: 1 }
				]
			},
			gradient2: {
				type: 'linear',
				angle: 180,
				stops: [
					{ color: '#ff4757', position: 0 },
					{ color: '#a55eea', position: 1 }
				]
			},
			gradient3: {
				type: 'radial',
				centerX: 0.3,
				centerY: 0.3,
				stops: [
					{ color: '#ffc048', position: 0 },
					{ color: '#ff6b6b', position: 1 }
				]
			},
			gradient4: {
				type: 'linear',
				angle: 90,
				stops: [
					{ color: '#a55eea', position: 0 },
					{ color: '#ff9ff3', position: 0.5 },
					{ color: '#ff6b6b', position: 1 }
				]
			}
		}
	},
	{
		id: 'ocean-breeze',
		name: 'Ocean Breeze',
		category: 'vibrant',
		palette: {
			name: 'Ocean Breeze',
			background: { color: '#f0f9ff' },
			text: { color: '#0c2461' },
			accent1: { color: '#0984e3' }, // Ocean blue
			accent2: { color: '#00cec9' }, // Turquoise
			accent3: { color: '#00b894' }, // Sea green
			accent4: { color: '#6c5ce7' }, // Indigo
			accent5: { color: '#74b9ff' }, // Sky blue
			accent6: { color: '#55efc4' }, // Mint
			gradient1: {
				type: 'linear',
				angle: 135,
				stops: [
					{ color: '#0984e3', position: 0 },
					{ color: '#00cec9', position: 1 }
				]
			},
			gradient2: {
				type: 'linear',
				angle: 180,
				stops: [
					{ color: '#6c5ce7', position: 0 },
					{ color: '#0984e3', position: 1 }
				]
			},
			gradient3: {
				type: 'radial',
				centerX: 0.5,
				centerY: 0.5,
				stops: [
					{ color: '#55efc4', position: 0 },
					{ color: '#00b894', position: 1 }
				]
			},
			gradient4: {
				type: 'linear',
				angle: 90,
				stops: [
					{ color: '#74b9ff', position: 0 },
					{ color: '#0984e3', position: 0.5 },
					{ color: '#6c5ce7', position: 1 }
				]
			}
		}
	},
	{
		id: 'electric-pop',
		name: 'Electric Pop',
		category: 'vibrant',
		palette: {
			name: 'Electric Pop',
			background: { color: '#ffffff' },
			text: { color: '#1e272e' },
			accent1: { color: '#e056fd' }, // Magenta
			accent2: { color: '#00d2d3' }, // Cyan
			accent3: { color: '#ff9f43' }, // Tangerine
			accent4: { color: '#5f27cd' }, // Violet
			accent5: { color: '#01a3a4' }, // Teal
			accent6: { color: '#ff6b6b' }, // Coral
			gradient1: {
				type: 'linear',
				angle: 135,
				stops: [
					{ color: '#e056fd', position: 0 },
					{ color: '#5f27cd', position: 1 }
				]
			},
			gradient2: {
				type: 'linear',
				angle: 180,
				stops: [
					{ color: '#00d2d3', position: 0 },
					{ color: '#01a3a4', position: 1 }
				]
			},
			gradient3: {
				type: 'radial',
				centerX: 0.5,
				centerY: 0.5,
				stops: [
					{ color: '#ff9f43', position: 0 },
					{ color: '#ff6b6b', position: 1 }
				]
			},
			gradient4: {
				type: 'linear',
				angle: 90,
				stops: [
					{ color: '#5f27cd', position: 0 },
					{ color: '#e056fd', position: 0.5 },
					{ color: '#00d2d3', position: 1 }
				]
			}
		}
	},

	// =========================================================================
	// Pastel (1)
	// =========================================================================
	{
		id: 'soft-dreams',
		name: 'Soft Dreams',
		category: 'pastel',
		palette: {
			name: 'Soft Dreams',
			background: { color: '#fdf6f9' },
			text: { color: '#4a4a68' },
			accent1: { color: '#dfe6e9' }, // Light gray
			accent2: { color: '#fab1a0' }, // Peach
			accent3: { color: '#a29bfe' }, // Lavender
			accent4: { color: '#81ecec' }, // Aqua
			accent5: { color: '#ffeaa7' }, // Pale yellow
			accent6: { color: '#b2bec3' }, // Cool gray
			gradient1: {
				type: 'linear',
				angle: 135,
				stops: [
					{ color: '#a29bfe', position: 0 },
					{ color: '#fab1a0', position: 1 }
				]
			},
			gradient2: {
				type: 'linear',
				angle: 180,
				stops: [
					{ color: '#81ecec', position: 0 },
					{ color: '#a29bfe', position: 1 }
				]
			},
			gradient3: {
				type: 'radial',
				centerX: 0.5,
				centerY: 0.5,
				stops: [
					{ color: '#ffeaa7', position: 0 },
					{ color: '#fab1a0', position: 1 }
				]
			},
			gradient4: {
				type: 'linear',
				angle: 90,
				stops: [
					{ color: '#fab1a0', position: 0 },
					{ color: '#ffeaa7', position: 0.5 },
					{ color: '#81ecec', position: 1 }
				]
			}
		}
	},

	// =========================================================================
	// Dark (1)
	// =========================================================================
	{
		id: 'midnight',
		name: 'Midnight',
		category: 'dark',
		palette: {
			name: 'Midnight',
			background: { color: '#1a1a2e' },
			text: { color: '#eaeaea' },
			accent1: { color: '#e94560' }, // Hot pink
			accent2: { color: '#0f3460' }, // Dark blue
			accent3: { color: '#16c79a' }, // Mint
			accent4: { color: '#ffd369' }, // Gold
			accent5: { color: '#7868e6' }, // Purple
			accent6: { color: '#00fff5' }, // Cyan
			gradient1: {
				type: 'linear',
				angle: 135,
				stops: [
					{ color: '#e94560', position: 0 },
					{ color: '#0f3460', position: 1 }
				]
			},
			gradient2: {
				type: 'linear',
				angle: 180,
				stops: [
					{ color: '#7868e6', position: 0 },
					{ color: '#1a1a2e', position: 1 }
				]
			},
			gradient3: {
				type: 'radial',
				centerX: 0.5,
				centerY: 0.5,
				stops: [
					{ color: '#16c79a', position: 0 },
					{ color: '#0f3460', position: 1 }
				]
			},
			gradient4: {
				type: 'linear',
				angle: 90,
				stops: [
					{ color: '#00fff5', position: 0 },
					{ color: '#7868e6', position: 0.5 },
					{ color: '#e94560', position: 1 }
				]
			}
		}
	}
]

/**
 * Get a preset by its ID
 */
export function getPresetById(id: string): PalettePreset | undefined {
	return PALETTE_PRESETS.find((preset) => preset.id === id)
}

/**
 * Get all presets in a category
 */
export function getPresetsByCategory(category: PalettePreset['category']): PalettePreset[] {
	return PALETTE_PRESETS.filter((preset) => preset.category === category)
}

/**
 * Get category display name
 */
export function getCategoryDisplayName(category: PalettePreset['category']): string {
	const names: Record<PalettePreset['category'], string> = {
		professional: 'Professional',
		vibrant: 'Vibrant',
		pastel: 'Pastel',
		dark: 'Dark'
	}
	return names[category]
}

/**
 * All categories in display order
 */
export const PRESET_CATEGORIES: PalettePreset['category'][] = [
	'professional',
	'vibrant',
	'pastel',
	'dark'
]

// vim: ts=4

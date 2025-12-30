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
 * Predefined gradient presets for quick selection.
 * Organized by category: light, dark, vibrant, pastel, nature
 */

import type { GradientPreset, GradientPresetCategory } from '../types/gradient'

/**
 * All gradient presets, organized by category.
 */
export const GRADIENT_PRESETS: GradientPreset[] = [
	// =========================================================================
	// Light Backgrounds (professional presentations)
	// =========================================================================
	{
		id: 'light-subtle',
		name: 'Subtle',
		category: 'light',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#ffffff', position: 0 },
				{ color: '#f5f5f5', position: 1 }
			]
		}
	},
	{
		id: 'light-cloud',
		name: 'Cloud',
		category: 'light',
		gradient: {
			type: 'radial',
			centerX: 0.5,
			centerY: 0.3,
			stops: [
				{ color: '#ffffff', position: 0 },
				{ color: '#e8e8e8', position: 1 }
			]
		}
	},
	{
		id: 'light-sky',
		name: 'Sky',
		category: 'light',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#e0f0ff', position: 0 },
				{ color: '#ffffff', position: 1 }
			]
		}
	},
	{
		id: 'light-warm',
		name: 'Warm Glow',
		category: 'light',
		gradient: {
			type: 'radial',
			centerX: 0.5,
			centerY: 0.5,
			stops: [
				{ color: '#fff8f0', position: 0 },
				{ color: '#f0e8e0', position: 1 }
			]
		}
	},
	{
		id: 'light-mint',
		name: 'Mint',
		category: 'light',
		gradient: {
			type: 'linear',
			angle: 135,
			stops: [
				{ color: '#f0fff4', position: 0 },
				{ color: '#e0f0e8', position: 1 }
			]
		}
	},
	{
		id: 'light-lavender',
		name: 'Lavender',
		category: 'light',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#f8f0ff', position: 0 },
				{ color: '#f0e8f8', position: 1 }
			]
		}
	},
	{
		id: 'light-peach',
		name: 'Peach',
		category: 'light',
		gradient: {
			type: 'linear',
			angle: 135,
			stops: [
				{ color: '#fff5f0', position: 0 },
				{ color: '#ffe8e0', position: 1 }
			]
		}
	},
	{
		id: 'light-cream',
		name: 'Cream',
		category: 'light',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#fffef8', position: 0 },
				{ color: '#f8f0e0', position: 1 }
			]
		}
	},

	// =========================================================================
	// Dark Backgrounds (dramatic presentations)
	// =========================================================================
	{
		id: 'dark-charcoal',
		name: 'Charcoal',
		category: 'dark',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#2a2a2a', position: 0 },
				{ color: '#1a1a1a', position: 1 }
			]
		}
	},
	{
		id: 'dark-midnight',
		name: 'Midnight',
		category: 'dark',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#1a1a2e', position: 0 },
				{ color: '#0f0f1a', position: 1 }
			]
		}
	},
	{
		id: 'dark-spotlight',
		name: 'Spotlight',
		category: 'dark',
		gradient: {
			type: 'radial',
			centerX: 0.5,
			centerY: 0.4,
			stops: [
				{ color: '#3a3a4a', position: 0 },
				{ color: '#1a1a1a', position: 1 }
			]
		}
	},
	{
		id: 'dark-purple',
		name: 'Deep Purple',
		category: 'dark',
		gradient: {
			type: 'linear',
			angle: 135,
			stops: [
				{ color: '#2d1b4e', position: 0 },
				{ color: '#1a1025', position: 1 }
			]
		}
	},
	{
		id: 'dark-blue',
		name: 'Navy',
		category: 'dark',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#1a2a4a', position: 0 },
				{ color: '#0a1525', position: 1 }
			]
		}
	},
	{
		id: 'dark-emerald',
		name: 'Emerald Night',
		category: 'dark',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#1a3a2a', position: 0 },
				{ color: '#0a1a15', position: 1 }
			]
		}
	},
	{
		id: 'dark-wine',
		name: 'Wine',
		category: 'dark',
		gradient: {
			type: 'linear',
			angle: 135,
			stops: [
				{ color: '#3a1a2a', position: 0 },
				{ color: '#1a0a15', position: 1 }
			]
		}
	},
	{
		id: 'dark-carbon',
		name: 'Carbon',
		category: 'dark',
		gradient: {
			type: 'linear',
			angle: 45,
			stops: [
				{ color: '#2a2a2a', position: 0 },
				{ color: '#1a1a1a', position: 0.5 },
				{ color: '#2a2a2a', position: 1 }
			]
		}
	},

	// =========================================================================
	// Vibrant (bold, attention-grabbing)
	// =========================================================================
	{
		id: 'vibrant-sunset',
		name: 'Sunset',
		category: 'vibrant',
		gradient: {
			type: 'linear',
			angle: 135,
			stops: [
				{ color: '#ff6b35', position: 0 },
				{ color: '#f7931e', position: 0.5 },
				{ color: '#ffcc00', position: 1 }
			]
		}
	},
	{
		id: 'vibrant-ocean',
		name: 'Ocean',
		category: 'vibrant',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#0077b6', position: 0 },
				{ color: '#00b4d8', position: 0.5 },
				{ color: '#90e0ef', position: 1 }
			]
		}
	},
	{
		id: 'vibrant-aurora',
		name: 'Aurora',
		category: 'vibrant',
		gradient: {
			type: 'linear',
			angle: 135,
			stops: [
				{ color: '#667eea', position: 0 },
				{ color: '#764ba2', position: 0.5 },
				{ color: '#f093fb', position: 1 }
			]
		}
	},
	{
		id: 'vibrant-fire',
		name: 'Fire',
		category: 'vibrant',
		gradient: {
			type: 'linear',
			angle: 0,
			stops: [
				{ color: '#f12711', position: 0 },
				{ color: '#f5af19', position: 1 }
			]
		}
	},
	{
		id: 'vibrant-neon',
		name: 'Neon',
		category: 'vibrant',
		gradient: {
			type: 'linear',
			angle: 90,
			stops: [
				{ color: '#00f5d4', position: 0 },
				{ color: '#00bbf9', position: 0.5 },
				{ color: '#9b5de5', position: 1 }
			]
		}
	},
	{
		id: 'vibrant-tropical',
		name: 'Tropical',
		category: 'vibrant',
		gradient: {
			type: 'linear',
			angle: 135,
			stops: [
				{ color: '#11998e', position: 0 },
				{ color: '#38ef7d', position: 1 }
			]
		}
	},
	{
		id: 'vibrant-berry',
		name: 'Berry',
		category: 'vibrant',
		gradient: {
			type: 'linear',
			angle: 135,
			stops: [
				{ color: '#833ab4', position: 0 },
				{ color: '#fd1d1d', position: 0.5 },
				{ color: '#fcb045', position: 1 }
			]
		}
	},
	{
		id: 'vibrant-electric',
		name: 'Electric',
		category: 'vibrant',
		gradient: {
			type: 'linear',
			angle: 90,
			stops: [
				{ color: '#4776e6', position: 0 },
				{ color: '#8e54e9', position: 1 }
			]
		}
	},

	// =========================================================================
	// Pastel (soft, gentle)
	// =========================================================================
	{
		id: 'pastel-cotton',
		name: 'Cotton Candy',
		category: 'pastel',
		gradient: {
			type: 'linear',
			angle: 135,
			stops: [
				{ color: '#ffecd2', position: 0 },
				{ color: '#fcb69f', position: 1 }
			]
		}
	},
	{
		id: 'pastel-rose',
		name: 'Rose',
		category: 'pastel',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#fbc2eb', position: 0 },
				{ color: '#a6c1ee', position: 1 }
			]
		}
	},
	{
		id: 'pastel-spring',
		name: 'Spring',
		category: 'pastel',
		gradient: {
			type: 'linear',
			angle: 135,
			stops: [
				{ color: '#c1ffc1', position: 0 },
				{ color: '#a8edea', position: 1 }
			]
		}
	},
	{
		id: 'pastel-blush',
		name: 'Blush',
		category: 'pastel',
		gradient: {
			type: 'radial',
			centerX: 0.5,
			centerY: 0.5,
			stops: [
				{ color: '#ffeef8', position: 0 },
				{ color: '#ffe0f0', position: 1 }
			]
		}
	},
	{
		id: 'pastel-sky',
		name: 'Pastel Sky',
		category: 'pastel',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#a1c4fd', position: 0 },
				{ color: '#c2e9fb', position: 1 }
			]
		}
	},
	{
		id: 'pastel-lemon',
		name: 'Lemon',
		category: 'pastel',
		gradient: {
			type: 'linear',
			angle: 135,
			stops: [
				{ color: '#fffbd5', position: 0 },
				{ color: '#b8f0c0', position: 1 }
			]
		}
	},
	{
		id: 'pastel-lilac',
		name: 'Lilac',
		category: 'pastel',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#e0c3fc', position: 0 },
				{ color: '#8ec5fc', position: 1 }
			]
		}
	},
	{
		id: 'pastel-dreamy',
		name: 'Dreamy',
		category: 'pastel',
		gradient: {
			type: 'linear',
			angle: 135,
			stops: [
				{ color: '#ffdde1', position: 0 },
				{ color: '#ee9ca7', position: 0.5 },
				{ color: '#ffdde1', position: 1 }
			]
		}
	},

	// =========================================================================
	// Nature (organic, natural)
	// =========================================================================
	{
		id: 'nature-forest',
		name: 'Forest',
		category: 'nature',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#134e5e', position: 0 },
				{ color: '#71b280', position: 1 }
			]
		}
	},
	{
		id: 'nature-earth',
		name: 'Earth',
		category: 'nature',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#8b5a2b', position: 0 },
				{ color: '#d4a574', position: 1 }
			]
		}
	},
	{
		id: 'nature-sea',
		name: 'Sea',
		category: 'nature',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#2e8b8b', position: 0 },
				{ color: '#48d1cc', position: 0.5 },
				{ color: '#87ceeb', position: 1 }
			]
		}
	},
	{
		id: 'nature-autumn',
		name: 'Autumn',
		category: 'nature',
		gradient: {
			type: 'linear',
			angle: 135,
			stops: [
				{ color: '#8b4513', position: 0 },
				{ color: '#cd853f', position: 0.5 },
				{ color: '#daa520', position: 1 }
			]
		}
	},
	{
		id: 'nature-moss',
		name: 'Moss',
		category: 'nature',
		gradient: {
			type: 'radial',
			centerX: 0.5,
			centerY: 0.5,
			stops: [
				{ color: '#556b2f', position: 0 },
				{ color: '#8fbc8f', position: 1 }
			]
		}
	},
	{
		id: 'nature-dawn',
		name: 'Dawn',
		category: 'nature',
		gradient: {
			type: 'linear',
			angle: 0,
			stops: [
				{ color: '#2c3e50', position: 0 },
				{ color: '#fd746c', position: 0.5 },
				{ color: '#ff9068', position: 1 }
			]
		}
	},
	{
		id: 'nature-desert',
		name: 'Desert',
		category: 'nature',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#c9b48d', position: 0 },
				{ color: '#e8d9c0', position: 1 }
			]
		}
	},
	{
		id: 'nature-meadow',
		name: 'Meadow',
		category: 'nature',
		gradient: {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: '#56ab2f', position: 0 },
				{ color: '#a8e063', position: 1 }
			]
		}
	}
]

/**
 * Get presets filtered by category.
 */
export function getPresetsByCategory(category: GradientPresetCategory): GradientPreset[] {
	return GRADIENT_PRESETS.filter((preset) => preset.category === category)
}

/**
 * Get a preset by its ID.
 */
export function getPresetById(id: string): GradientPreset | undefined {
	return GRADIENT_PRESETS.find((preset) => preset.id === id)
}

/**
 * Get all available categories.
 */
export function getCategories(): GradientPresetCategory[] {
	return ['light', 'dark', 'vibrant', 'pastel', 'nature']
}

// vim: ts=4

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
 * Bullet Icons Library - defines available bullet icons for lists
 *
 * Uses SVG paths instead of Unicode characters to ensure:
 * - Consistent rendering across browsers and PDF export
 * - No font dependency issues
 * - Scalable vector quality
 *
 * All icons use a 16x16 viewBox with paths centered and sized consistently
 * for uniform visual appearance.
 */

export interface BulletIcon {
	id: string
	name: string
	pathData: string
	viewBox: [number, number, number, number] // [minX, minY, width, height]
}

/**
 * Available bullet icon definitions
 * All icons are designed to have similar visual weight and size
 */
export const BULLET_ICONS: BulletIcon[] = [
	// Filled circle - classic bullet
	{
		id: 'circle',
		name: 'Circle',
		pathData: 'M8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
		viewBox: [0, 0, 16, 16]
	},
	// Circle outline
	{
		id: 'circle-outline',
		name: 'Circle Outline',
		pathData: 'M8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 1.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
		viewBox: [0, 0, 16, 16]
	},
	// Filled square
	{
		id: 'square',
		name: 'Square',
		pathData: 'M3 3h10v10H3z',
		viewBox: [0, 0, 16, 16]
	},
	// Square outline
	{
		id: 'square-outline',
		name: 'Square Outline',
		pathData: 'M3 3v10h10V3H3zm1.5 1.5h7v7h-7v-7z',
		viewBox: [0, 0, 16, 16]
	},
	// Filled diamond (rotated square)
	{
		id: 'diamond',
		name: 'Diamond',
		pathData: 'M8 2L2 8l6 6 6-6-6-6z',
		viewBox: [0, 0, 16, 16]
	},
	// Filled triangle pointing right (play button style)
	{
		id: 'triangle',
		name: 'Triangle',
		pathData: 'M4 2v12l10-6-10-6z',
		viewBox: [0, 0, 16, 16]
	},
	// Solid right arrow (thick, filled)
	{
		id: 'arrow',
		name: 'Arrow',
		pathData: 'M2 6v4h7v3l5-5-5-5v3H2z',
		viewBox: [0, 0, 16, 16]
	},
	// Chevron (thick angle bracket)
	{
		id: 'chevron',
		name: 'Chevron',
		pathData: 'M5 1l-2 2 5 5-5 5 2 2 7-7-7-7z',
		viewBox: [0, 0, 16, 16]
	},
	// Double chevron (guillemet style)
	{
		id: 'double-chevron',
		name: 'Double Chevron',
		pathData: 'M3 1l-2 2 5 5-5 5 2 2 7-7-7-7zm6 0l-2 2 5 5-5 5 2 2 7-7-7-7z',
		viewBox: [0, 0, 16, 16]
	},
	// Checkmark (thick)
	{
		id: 'check',
		name: 'Check',
		pathData: 'M6 10l-3-3-2 2 5 5 10-10-2-2-8 8z',
		viewBox: [0, 0, 16, 16]
	},
	// Filled star
	{
		id: 'star',
		name: 'Star',
		pathData: 'M8 1l2.2 4.4 4.8.7-3.5 3.4.8 4.8L8 12l-4.3 2.3.8-4.8L1 6.1l4.8-.7L8 1z',
		viewBox: [0, 0, 16, 16]
	},
	// Dash/minus (thick horizontal line)
	{
		id: 'dash',
		name: 'Dash',
		pathData: 'M2 6h12v4H2z',
		viewBox: [0, 0, 16, 16]
	}
]

/**
 * Get a bullet icon by its ID
 */
export function getBulletIcon(id: string): BulletIcon | undefined {
	return BULLET_ICONS.find((b) => b.id === id)
}

/**
 * Migration map from old Unicode bullets to new SVG bullet IDs
 */
export const UNICODE_TO_BULLET_ID: Record<string, string> = {
	'•': 'circle',
	'◦': 'circle-outline',
	'▪': 'square',
	'▸': 'triangle',
	'►': 'triangle',
	'→': 'arrow',
	'★': 'star',
	'✓': 'check',
	'✦': 'diamond',
	'❯': 'chevron',
	'○': 'circle-outline',
	'▹': 'triangle'
}

/**
 * Migrate an old Unicode bullet to a new bullet ID
 * Returns the bullet ID if it's a known Unicode bullet or already a valid ID
 * Returns undefined for unknown values
 */
export function migrateBullet(bullet: string | undefined): string | undefined {
	if (!bullet) return undefined

	// Check if it's already a valid bullet ID
	if (getBulletIcon(bullet)) return bullet

	// Try to migrate from Unicode
	return UNICODE_TO_BULLET_ID[bullet]
}

// vim: ts=4

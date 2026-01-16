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
 * Symbol Library - defines available symbols for the symbol picker
 */

export type SymbolCategory = 'status' | 'arrows' | 'shapes'

export interface SymbolDefinition {
	id: string
	name: string
	category: SymbolCategory
	pathData: string
	viewBox: [number, number, number, number]
	tags?: string[]
}

/**
 * Symbol definitions organized by category
 */
export const SYMBOLS: SymbolDefinition[] = [
	// ============================================================================
	// Status Category
	// ============================================================================
	{
		id: 'checkmark-circle',
		name: 'Checkmark (Circle)',
		category: 'status',
		viewBox: [0, 0, 24, 24],
		pathData:
			'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
		tags: ['check', 'done', 'complete', 'yes', 'success']
	},
	{
		id: 'checkmark',
		name: 'Checkmark',
		category: 'status',
		viewBox: [0, 0, 24, 24],
		pathData: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z',
		tags: ['check', 'done', 'complete', 'yes']
	},
	{
		id: 'x-circle',
		name: 'X Mark (Circle)',
		category: 'status',
		viewBox: [0, 0, 24, 24],
		pathData:
			'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z',
		tags: ['x', 'close', 'cancel', 'no', 'error']
	},
	{
		id: 'x-mark',
		name: 'X Mark',
		category: 'status',
		viewBox: [0, 0, 24, 24],
		pathData:
			'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z',
		tags: ['x', 'close', 'cancel', 'no']
	},
	{
		id: 'warning',
		name: 'Warning',
		category: 'status',
		viewBox: [0, 0, 24, 24],
		pathData: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
		tags: ['alert', 'caution', 'exclamation']
	},
	{
		id: 'question',
		name: 'Question',
		category: 'status',
		viewBox: [0, 0, 24, 24],
		pathData:
			'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z',
		tags: ['help', 'unknown', 'inquiry']
	},
	{
		id: 'info',
		name: 'Info',
		category: 'status',
		viewBox: [0, 0, 24, 24],
		pathData:
			'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
		tags: ['information', 'about', 'details']
	},

	// ============================================================================
	// Arrows Category
	// ============================================================================
	{
		id: 'arrow-right',
		name: 'Arrow Right',
		category: 'arrows',
		viewBox: [0, 0, 24, 24],
		pathData: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z',
		tags: ['direction', 'next', 'forward']
	},
	{
		id: 'arrow-left',
		name: 'Arrow Left',
		category: 'arrows',
		viewBox: [0, 0, 24, 24],
		pathData: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
		tags: ['direction', 'back', 'previous']
	},
	{
		id: 'arrow-up',
		name: 'Arrow Up',
		category: 'arrows',
		viewBox: [0, 0, 24, 24],
		pathData: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
		tags: ['direction', 'up', 'increase']
	},
	{
		id: 'arrow-down',
		name: 'Arrow Down',
		category: 'arrows',
		viewBox: [0, 0, 24, 24],
		pathData: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',
		tags: ['direction', 'down', 'decrease']
	},
	{
		id: 'curved-arrow-left',
		name: 'Curved Arrow Left (Undo)',
		category: 'arrows',
		viewBox: [0, 0, 24, 24],
		pathData:
			'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z',
		tags: ['undo', 'back', 'return']
	},
	{
		id: 'curved-arrow-right',
		name: 'Curved Arrow Right (Redo)',
		category: 'arrows',
		viewBox: [0, 0, 24, 24],
		pathData:
			'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z',
		tags: ['redo', 'forward', 'repeat']
	},

	// ============================================================================
	// Shapes Category
	// ============================================================================
	{
		id: 'star',
		name: 'Star',
		category: 'shapes',
		viewBox: [0, 0, 24, 24],
		pathData:
			'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
		tags: ['favorite', 'rate', 'important']
	},
	{
		id: 'star-outline',
		name: 'Star (Outline)',
		category: 'shapes',
		viewBox: [0, 0, 24, 24],
		pathData:
			'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z',
		tags: ['favorite', 'rate', 'important']
	},
	{
		id: 'heart',
		name: 'Heart',
		category: 'shapes',
		viewBox: [0, 0, 24, 24],
		pathData:
			'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
		tags: ['love', 'like', 'favorite']
	},
	{
		id: 'heart-outline',
		name: 'Heart (Outline)',
		category: 'shapes',
		viewBox: [0, 0, 24, 24],
		pathData:
			'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
		tags: ['love', 'like', 'favorite']
	},
	{
		id: 'lightning',
		name: 'Lightning',
		category: 'shapes',
		viewBox: [0, 0, 24, 24],
		pathData: 'M7 2v11h3v9l7-12h-4l4-8z',
		tags: ['flash', 'power', 'energy', 'bolt']
	},
	{
		id: 'thumbs-up',
		name: 'Thumbs Up',
		category: 'shapes',
		viewBox: [0, 0, 24, 24],
		pathData:
			'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z',
		tags: ['like', 'approve', 'positive']
	},
	{
		id: 'thumbs-down',
		name: 'Thumbs Down',
		category: 'shapes',
		viewBox: [0, 0, 24, 24],
		pathData:
			'M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z',
		tags: ['dislike', 'reject', 'negative']
	},
	{
		id: 'flag',
		name: 'Flag',
		category: 'shapes',
		viewBox: [0, 0, 24, 24],
		pathData: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
		tags: ['mark', 'important', 'flag']
	},
	{
		id: 'bookmark',
		name: 'Bookmark',
		category: 'shapes',
		viewBox: [0, 0, 24, 24],
		pathData: 'M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z',
		tags: ['save', 'mark', 'favorite']
	},
	{
		id: 'circle',
		name: 'Circle',
		category: 'shapes',
		viewBox: [0, 0, 24, 24],
		pathData: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
		tags: ['round', 'dot', 'point']
	},
	{
		id: 'triangle',
		name: 'Triangle',
		category: 'shapes',
		viewBox: [0, 0, 24, 24],
		pathData: 'M12 2L2 22h20L12 2z',
		tags: ['shape', 'play', 'direction']
	},
	{
		id: 'diamond',
		name: 'Diamond',
		category: 'shapes',
		viewBox: [0, 0, 24, 24],
		pathData: 'M12 2L2 12l10 10 10-10L12 2z',
		tags: ['shape', 'rhombus']
	}
]

/**
 * Get a symbol by its ID
 */
export function getSymbolById(id: string): SymbolDefinition | undefined {
	return SYMBOLS.find((s) => s.id === id)
}

/**
 * Get all symbols in a category
 */
export function getSymbolsByCategory(category: SymbolCategory): SymbolDefinition[] {
	return SYMBOLS.filter((s) => s.category === category)
}

/**
 * Get all available categories
 */
export function getCategories(): SymbolCategory[] {
	return ['status', 'arrows', 'shapes']
}

/**
 * Category display names
 */
export const CATEGORY_NAMES: Record<SymbolCategory, string> = {
	status: 'Status',
	arrows: 'Arrows',
	shapes: 'Shapes'
}

// vim: ts=4

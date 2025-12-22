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
 * Color palette and utilities for Ideallo
 */

// Core drawing colors (from design plan)
export const PALETTE = {
	black: '#1e1e1e',
	gray: '#868e96',
	white: '#ffffff',
	red: '#e03131',
	orange: '#f76707',
	yellow: '#fcc419',
	green: '#2f9e44',
	teal: '#1098ad',
	blue: '#1971c2',
	purple: '#7048e8',
	pink: '#c2255c'
} as const

// Palette as array for quick access in UI
export const PALETTE_COLORS = [
	PALETTE.black,
	PALETTE.white,
	PALETTE.red,
	PALETTE.orange,
	PALETTE.yellow,
	PALETTE.green,
	PALETTE.blue,
	PALETTE.purple
] as const

// UI colors
export const UI = {
	canvasBg: '#f8f9fa',
	canvasDot: '#dee2e6',
	uiBg: 'rgba(255, 255, 255, 0.85)',
	uiBorder: 'rgba(0, 0, 0, 0.1)',
	uiShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
	selectionColor: '#339af0',
	selectionHandle: '#228be6',
	snapColor: '#845ef7'
} as const

// Default stroke widths
export const STROKE_WIDTHS = [1, 2, 4, 8] as const

/**
 * Generate a consistent color from a string (user ID)
 * Used for awareness/presence coloring
 */
export async function str2color(str: string): Promise<string> {
	const encoder = new TextEncoder()
	const data = encoder.encode(str)
	const hashBuffer = await crypto.subtle.digest('SHA-256', data)
	const hashArray = new Uint8Array(hashBuffer)

	// Use first 3 bytes for RGB, but ensure colors are not too dark
	const r = Math.floor(hashArray[0] * 0.6 + 100)
	const g = Math.floor(hashArray[1] * 0.6 + 100)
	const b = Math.floor(hashArray[2] * 0.6 + 100)

	return `rgb(${r}, ${g}, ${b})`
}

/**
 * Get a contrasting text color (black or white) for a given background
 */
export function getContrastColor(bgColor: string): string {
	// Simple luminance check
	const hex = bgColor.replace('#', '')
	if (hex.length !== 6) return PALETTE.black

	const r = parseInt(hex.substring(0, 2), 16)
	const g = parseInt(hex.substring(2, 4), 16)
	const b = parseInt(hex.substring(4, 6), 16)

	// Relative luminance formula
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

	return luminance > 0.5 ? PALETTE.black : PALETTE.white
}

// vim: ts=4

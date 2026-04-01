// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Palette color utilities
 *
 * Colors are stored as concise keys:
 * - Neutrals: "n0" through "n5"
 * - Normal: "red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"
 * - Pastel: "red-p", "orange-p", etc.
 * - Custom hex: "#xxxxxx"
 * - Transparent: "transparent"
 */

// Palette key definitions
export const PALETTE_KEYS = {
	neutrals: ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'] as const,
	normal: ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const,
	pastel: [
		'red-p',
		'orange-p',
		'yellow-p',
		'green-p',
		'cyan-p',
		'blue-p',
		'purple-p',
		'pink-p'
	] as const
}

export type PaletteKey =
	| (typeof PALETTE_KEYS.neutrals)[number]
	| (typeof PALETTE_KEYS.normal)[number]
	| (typeof PALETTE_KEYS.pastel)[number]

// Map from key to CSS variable name
const KEY_TO_VAR: Record<string, string> = {
	// Neutrals
	n0: '--palette-n0',
	n1: '--palette-n1',
	n2: '--palette-n2',
	n3: '--palette-n3',
	n4: '--palette-n4',
	n5: '--palette-n5',
	// Normal
	red: '--palette-red',
	orange: '--palette-orange',
	yellow: '--palette-yellow',
	green: '--palette-green',
	cyan: '--palette-cyan',
	blue: '--palette-blue',
	purple: '--palette-purple',
	pink: '--palette-pink',
	// Pastel
	'red-p': '--palette-red-p',
	'orange-p': '--palette-orange-p',
	'yellow-p': '--palette-yellow-p',
	'green-p': '--palette-green-p',
	'cyan-p': '--palette-cyan-p',
	'blue-p': '--palette-blue-p',
	'purple-p': '--palette-purple-p',
	'pink-p': '--palette-pink-p'
}

/**
 * Check if a color is a palette key
 */
export function isPaletteKey(color: string): color is PaletteKey {
	return color in KEY_TO_VAR
}

/**
 * Convert a stored color value to CSS for rendering
 * - Palette keys → var(--palette-xxx)
 * - Hex/other → as-is
 */
export function colorToCss(color: string): string {
	if (color === 'transparent' || color === 'none') {
		return 'transparent'
	}

	const varName = KEY_TO_VAR[color]
	if (varName) {
		return `var(${varName})`
	}

	// Custom color (hex, rgb, etc.) - return as-is
	return color
}

/**
 * Get the CSS variable name for a palette key (for reading computed value)
 */
export function getVarName(key: string): string | null {
	return KEY_TO_VAR[key] ?? null
}

// vim: ts=4

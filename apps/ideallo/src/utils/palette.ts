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

/** The two ends of the neutral ramp. They flip together with the theme, so a pair stays legible. */
const DARK_TEXT = 'var(--palette-n0, #1e1e1e)'
const LIGHT_TEXT = 'var(--palette-n5, #ffffff)'

/** Neutral keys dark enough (in LIGHT mode) to need light glyphs, and vice versa under `.dark` */
const DARK_NEUTRALS = new Set(['n0', 'n1', 'n2'])

/**
 * Glyph colour that stays legible on a given fill, in BOTH themes.
 *
 * Written against how each family behaves across the theme flip, not against a single computed
 * value - the fill is usually a CSS variable, so its real colour is not known at JS time:
 *
 * - neutrals flip end for end (`--palette-n0` is black in light mode, white under `.dark`), so
 *   answering with the OPPOSITE end of the same ramp keeps the contrast in both;
 * - the `normal` keys are fixed 40-50% lightness and do NOT flip, so a theme-flipping var would
 *   break in one mode - a literal white is the only safe answer;
 * - the `-p` pastels flip lightness with the theme, so n0 tracks them correctly;
 * - a custom hex is the one case where the value IS known, so use its relative luminance.
 */
export function contrastingTextColor(fillColor: string | undefined): string {
	if (!fillColor || fillColor === 'transparent' || fillColor === 'none') return DARK_TEXT
	if (DARK_NEUTRALS.has(fillColor)) return LIGHT_TEXT
	if (PALETTE_KEYS.neutrals.includes(fillColor as (typeof PALETTE_KEYS.neutrals)[number])) {
		return DARK_TEXT
	}
	if (PALETTE_KEYS.normal.includes(fillColor as (typeof PALETTE_KEYS.normal)[number])) {
		return '#ffffff'
	}
	if (isPaletteKey(fillColor)) return DARK_TEXT // the pastels; everything else is handled above
	const luminance = hexLuminance(fillColor)
	if (luminance === null) return DARK_TEXT
	return luminance > 0.5 ? '#1e1e1e' : '#ffffff'
}

/** WCAG relative luminance of a #rgb / #rrggbb colour, or null if it is not one */
function hexLuminance(color: string): number | null {
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1]
	if (!hex) return null
	const full =
		hex.length === 3
			? hex
					.split('')
					.map((c) => c + c)
					.join('')
			: hex
	const channel = (offset: number) => {
		const v = Number.parseInt(full.slice(offset, offset + 2), 16) / 255
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Shared hex colour parsing and luminance helpers. */

/** RGB components in 0..255. */
export interface RgbColor {
	r: number
	g: number
	b: number
}

/**
 * Parse a hex colour to RGB components (0..255). Accepts `#rgb`, `#rgba`,
 * `#rrggbb` and `#rrggbbaa` (with or without the leading `#`); the alpha
 * channel is ignored. Returns null for anything else.
 */
export function hexToRgb(hex: string): RgbColor | null {
	const h = hex.replace(/^#/, '')
	const expanded =
		h.length === 3 || h.length === 4
			? h
					.split('')
					.map((c) => c + c)
					.join('')
			: h
	const fullHex = expanded.length === 8 ? expanded.slice(0, 6) : expanded
	if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) return null
	const num = parseInt(fullHex, 16)
	return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

/** Convert RGB components (0..255) to a hex colour string. */
export function rgbToHex(r: number, g: number, b: number): string {
	const toHex = (n: number) =>
		Math.round(Math.max(0, Math.min(255, n)))
			.toString(16)
			.padStart(2, '0')
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Perceived brightness (BT.601 luma) of a hex colour, 0..1. Returns null when the
 * colour cannot be parsed.
 *
 * Deliberately NOT WCAG relative luminance (which linearizes sRGB and weights
 * 0.2126/0.7152/0.0722): switching formulas would flip `getContrastColor` for
 * colours near the 0.5 boundary. Do not "correct" it without auditing call sites.
 */
export function luma(hex: string): number | null {
	const rgb = hexToRgb(hex)
	if (!rgb) return null
	return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
}

/** True when a hex colour is "light" (luma above 0.5). */
export function isLightColor(hex: string): boolean {
	const l = luma(hex)
	return l !== null && l > 0.5
}

/** Black or white, whichever contrasts with the given background. */
export function getContrastColor(backgroundColor: string): string {
	return isLightColor(backgroundColor) ? '#000000' : '#ffffff'
}

// vim: ts=4

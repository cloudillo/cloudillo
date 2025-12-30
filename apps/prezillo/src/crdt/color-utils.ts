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
 * Color utility functions for the palette system
 */

import type { Gradient } from '@cloudillo/canvas-tools'

export interface RGB {
	r: number
	g: number
	b: number
}

/**
 * Convert hex color to RGB components
 */
export function hexToRgb(hex: string): RGB {
	// Remove # if present
	const cleanHex = hex.replace(/^#/, '')

	// Handle shorthand (3 chars) and full (6 chars) hex
	let r: number, g: number, b: number
	if (cleanHex.length === 3) {
		r = parseInt(cleanHex[0] + cleanHex[0], 16)
		g = parseInt(cleanHex[1] + cleanHex[1], 16)
		b = parseInt(cleanHex[2] + cleanHex[2], 16)
	} else {
		r = parseInt(cleanHex.slice(0, 2), 16)
		g = parseInt(cleanHex.slice(2, 4), 16)
		b = parseInt(cleanHex.slice(4, 6), 16)
	}

	return { r, g, b }
}

/**
 * Convert RGB components to hex color
 */
export function rgbToHex(r: number, g: number, b: number): string {
	const toHex = (n: number) => {
		const clamped = Math.round(Math.max(0, Math.min(255, n)))
		return clamped.toString(16).padStart(2, '0')
	}
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Apply tint (lighten) or shade (darken) to a hex color
 * @param hex - Base color in hex format
 * @param factor - -1 to 1 (negative = shade/darken, positive = tint/lighten)
 * @returns Adjusted color in hex format
 */
export function applyTint(hex: string, factor: number): string {
	const rgb = hexToRgb(hex)

	if (factor > 0) {
		// Tint: blend toward white
		return rgbToHex(
			rgb.r + (255 - rgb.r) * factor,
			rgb.g + (255 - rgb.g) * factor,
			rgb.b + (255 - rgb.b) * factor
		)
	} else if (factor < 0) {
		// Shade: blend toward black
		const f = -factor
		return rgbToHex(rgb.r * (1 - f), rgb.g * (1 - f), rgb.b * (1 - f))
	}

	return hex
}

/**
 * Apply tint/shade to all stops in a gradient
 */
export function applyTintToGradient(gradient: Gradient, factor: number): Gradient {
	if (factor === 0) return gradient

	if (gradient.type === 'solid') {
		return {
			...gradient,
			color: gradient.color ? applyTint(gradient.color, factor) : gradient.color
		}
	}

	return {
		...gradient,
		stops: gradient.stops?.map((stop) => ({
			...stop,
			color: applyTint(stop.color, factor)
		}))
	}
}

/**
 * Apply opacity to a hex color, returning rgba format
 */
export function applyOpacity(hex: string, opacity: number): string {
	if (opacity >= 1) return hex

	const rgb = hexToRgb(hex)
	return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`
}

/**
 * Interpolate between two colors
 * @param color1 - Start color (hex)
 * @param color2 - End color (hex)
 * @param t - Interpolation factor (0 = color1, 1 = color2)
 */
export function interpolateColor(color1: string, color2: string, t: number): string {
	const rgb1 = hexToRgb(color1)
	const rgb2 = hexToRgb(color2)

	return rgbToHex(
		rgb1.r + (rgb2.r - rgb1.r) * t,
		rgb1.g + (rgb2.g - rgb1.g) * t,
		rgb1.b + (rgb2.b - rgb1.b) * t
	)
}

/**
 * Check if a color is light (for determining text contrast)
 * Uses relative luminance calculation
 */
export function isLightColor(hex: string): boolean {
	const rgb = hexToRgb(hex)

	// Calculate relative luminance (sRGB)
	const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255

	return luminance > 0.5
}

/**
 * Get a contrasting text color (black or white) for a background
 */
export function getContrastColor(backgroundColor: string): string {
	return isLightColor(backgroundColor) ? '#000000' : '#ffffff'
}

// vim: ts=4

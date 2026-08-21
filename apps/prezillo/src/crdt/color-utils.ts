// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Color utility functions for the palette system
 */

import type { Gradient } from '@cloudillo/canvas-tools'
import { hexToRgb, type RgbColor, rgbToHex } from '@cloudillo/core'

/** @deprecated use RgbColor from @cloudillo/core */
export type RGB = RgbColor

/**
 * Apply tint (lighten) or shade (darken) to a hex color
 * @param hex - Base color in hex format
 * @param factor - -1 to 1 (negative = shade/darken, positive = tint/lighten)
 * @returns Adjusted color in hex format
 */
export function applyTint(hex: string, factor: number): string {
	const rgb = hexToRgb(hex)
	if (!rgb) return hex

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

// vim: ts=4

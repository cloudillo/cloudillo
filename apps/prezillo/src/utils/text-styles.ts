// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Text style constants and mapping utilities
 *
 * These mappings convert between the internal text style values and CSS properties.
 */

/**
 * Maps text alignment values to CSS text-align property values
 */
export const TEXT_ALIGN_CSS = {
	left: 'left',
	center: 'center',
	right: 'right',
	justify: 'justify'
} as const

/**
 * Maps vertical alignment values to CSS flexbox align-items property values
 */
export const VERTICAL_ALIGN_CSS = {
	top: 'flex-start',
	middle: 'center',
	bottom: 'flex-end'
} as const

/**
 * Maps vertical alignment values to SVG dominant-baseline property values
 */
export const VERTICAL_ALIGN_SVG = {
	top: 'hanging',
	middle: 'middle',
	bottom: 'auto'
} as const

/**
 * Converts text decoration to CSS text-decoration property value
 *
 * @param decoration - Text decoration value ('none', 'underline', 'line-through')
 * @returns CSS text-decoration value
 */
export function getTextDecorationCSS(decoration: string): string {
	switch (decoration) {
		case 'underline':
			return 'underline'
		case 'line-through':
			return 'line-through'
		default:
			return 'none'
	}
}

/**
 * Maps internal text align codes to full string values
 */
export const TEXT_ALIGN_FROM_CODE = {
	l: 'left',
	c: 'center',
	r: 'right',
	j: 'justify'
} as const

/**
 * Maps full text align values to internal codes
 */
export const TEXT_ALIGN_TO_CODE = {
	left: 'l',
	center: 'c',
	right: 'r',
	justify: 'j'
} as const

/**
 * Maps internal vertical align codes to full string values
 */
export const VERTICAL_ALIGN_FROM_CODE = {
	t: 'top',
	m: 'middle',
	b: 'bottom'
} as const

/**
 * Maps full vertical align values to internal codes
 */
export const VERTICAL_ALIGN_TO_CODE = {
	top: 't',
	middle: 'm',
	bottom: 'b'
} as const

/**
 * Available font sizes in the font size dropdown
 */
export const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96] as const

// vim: ts=4

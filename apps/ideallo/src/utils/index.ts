// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Utilities barrel export
 */

export {
	streamSimplify,
	rdpSimplify,
	pointsToSvgPath,
	pointsToSmoothPath,
	flatToPoints,
	pointsToFlat
} from './path-simplification.js'

export type { Point } from './geometry.js'
export {
	distance,
	perpendicularDistance,
	getBoundsFromPoints,
	pointInBounds,
	boundsOverlap,
	boundsContains,
	expandBounds,
	getBoundsCenter,
	normalizeAngle,
	degToRad,
	radToDeg,
	rotatePoint,
	clamp
} from './geometry.js'

export {
	PALETTE,
	PALETTE_COLORS,
	UI,
	STROKE_WIDTHS,
	str2color,
	getContrastColor
} from './colors.js'

export {
	PALETTE_KEYS,
	colorToCss
} from './palette.js'

export {
	MIN_FONT_SIZE,
	MAX_FONT_SIZE,
	DEFAULT_FONT_SIZE,
	DEFAULT_LINE_HEIGHT,
	DEFAULT_PADDING,
	calculateOptimalFontSize,
	createFontSizeCalculator,
	cleanupMeasureElement
} from './text-scaling.js'

// vim: ts=4

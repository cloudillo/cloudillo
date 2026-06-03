// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Utilities barrel export
 */

export {
	getContrastColor,
	PALETTE,
	PALETTE_COLORS,
	STROKE_WIDTHS,
	str2color,
	UI
} from './colors.js'
export type { Point } from './geometry.js'
export {
	boundsContains,
	boundsOverlap,
	clamp,
	degToRad,
	distance,
	expandBounds,
	getBoundsCenter,
	getBoundsFromPoints,
	normalizeAngle,
	perpendicularDistance,
	pointInBounds,
	radToDeg,
	rotatePoint
} from './geometry.js'
export {
	colorToCss,
	PALETTE_KEYS
} from './palette.js'
export {
	flatToPoints,
	pointsToFlat,
	pointsToSmoothPath,
	pointsToSvgPath,
	rdpSimplify,
	streamSimplify
} from './path-simplification.js'
export {
	calculateOptimalFontSize,
	cleanupMeasureElement,
	createFontSizeCalculator,
	DEFAULT_FONT_SIZE,
	DEFAULT_LINE_HEIGHT,
	DEFAULT_PADDING,
	MAX_FONT_SIZE,
	MIN_FONT_SIZE
} from './text-scaling.js'

// vim: ts=4

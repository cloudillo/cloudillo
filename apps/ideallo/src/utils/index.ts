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
export type {
	ConnectorTerminalPatch,
	ConnectorTerminals,
	Point
} from './geometry.js'
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
	rotatePoint,
	scaleConnectorTerminals,
	scalePointsIntoBounds
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
export type { BarPosition, BarPositionInput } from './property-bar-position.js'
export {
	computeBarPosition,
	DESKTOP_BOTTOM_RESERVED,
	MOBILE_BOTTOM_RESERVED,
	MOBILE_MAX_WIDTH,
	SELECTION_GAP,
	VIEWPORT_PADDING
} from './property-bar-position.js'
export {
	calculateOptimalFontSize,
	cleanupMeasureElement,
	createFontSizeCalculator,
	DEFAULT_LINE_HEIGHT,
	DEFAULT_PADDING,
	MAX_FONT_SIZE,
	MIN_FONT_SIZE
} from './text-scaling.js'
export {
	DEFAULT_STICKY_FONT_SIZE,
	DEFAULT_TEXT_FONT_SIZE,
	FONT_SIZES,
	VERTICAL_ALIGN_CSS
} from './text-styles.js'

// vim: ts=4

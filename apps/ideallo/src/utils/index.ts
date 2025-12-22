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

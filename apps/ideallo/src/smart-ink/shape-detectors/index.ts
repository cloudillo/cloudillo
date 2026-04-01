// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shape Detectors index
 *
 * Re-exports all shape detection functions.
 */

// Line detection
export {
	detectLine,
	isConfidentLine,
	generateLinePoints,
	type LineCandidate
} from './line-detector.js'

// Ellipse/Circle detection
export {
	detectEllipse,
	isConfidentEllipse,
	generateEllipsePoints,
	type EllipseCandidate
} from './ellipse-detector.js'

// Rectangle/Diamond detection
export {
	detectRectangle,
	isConfidentRectangle,
	generateRectanglePoints,
	type RectangleCandidate
} from './rectangle-detector.js'

// Polygon detection (triangles, pentagons, etc.)
export {
	detectPolygon,
	isConfidentPolygon,
	generatePolygonPoints,
	type PolygonCandidate
} from './polygon-detector.js'

// Arrow detection
export {
	detectArrow,
	isConfidentArrow,
	generateArrowPoints,
	type ArrowCandidate,
	type ArrowheadPosition
} from './arrow-detector.js'

// vim: ts=4

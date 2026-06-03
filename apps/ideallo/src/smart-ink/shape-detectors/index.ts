// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shape Detectors index
 *
 * Re-exports all shape detection functions.
 */

// Arrow detection
export {
	type ArrowCandidate,
	type ArrowheadPosition,
	detectArrow,
	generateArrowPoints,
	isConfidentArrow
} from './arrow-detector.js'
// Ellipse/Circle detection
export {
	detectEllipse,
	type EllipseCandidate,
	generateEllipsePoints,
	isConfidentEllipse
} from './ellipse-detector.js'
// Line detection
export {
	detectLine,
	generateLinePoints,
	isConfidentLine,
	type LineCandidate
} from './line-detector.js'
// Polygon detection (triangles, pentagons, etc.)
export {
	detectPolygon,
	generatePolygonPoints,
	isConfidentPolygon,
	type PolygonCandidate
} from './polygon-detector.js'
// Rectangle/Diamond detection
export {
	detectRectangle,
	generateRectanglePoints,
	isConfidentRectangle,
	type RectangleCandidate
} from './rectangle-detector.js'

// vim: ts=4

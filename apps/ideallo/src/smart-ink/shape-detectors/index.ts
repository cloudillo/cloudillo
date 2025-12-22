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

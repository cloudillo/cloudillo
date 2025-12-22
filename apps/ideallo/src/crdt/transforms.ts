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
 * Coordinate transformations and spatial utilities
 * Re-exports from react-svg-canvas for consistent API across apps
 */

// Re-export generic geometry utilities from react-svg-canvas
export {
	// Basic geometry
	boundsIntersect,
	pointInBounds,
	expandBounds,
	unionBounds,
	getBoundsCenter,
	rotatePoint,
	scalePoint,
	distance,
	snapToGrid,
	snapPointToGrid,
	// RotationMatrix utilities
	type RotationMatrix,
	createRotationMatrix,
	rotatePointWithMatrix,
	unrotatePointWithMatrix,
	rotateDeltaWithMatrix,
	unrotateDeltaWithMatrix,
	// Resize utilities
	type ResizeState,
	getAnchorForHandle,
	getRotatedAnchorPosition,
	calculateResizedDimensions,
	calculateResizedPosition,
	initResizeState,
	calculateResizeBounds
} from 'react-svg-canvas'

// vim: ts=4

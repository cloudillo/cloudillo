// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Coordinate transformations and spatial utilities
 * Re-exports from react-svg-canvas for consistent API across apps
 */

// Re-export generic geometry utilities from react-svg-canvas
export {
	// Basic geometry
	boundsIntersect,
	calculateResizeBounds,
	calculateResizedDimensions,
	calculateResizedPosition,
	createRotationMatrix,
	distance,
	expandBounds,
	getAnchorForHandle,
	getBoundsCenter,
	getRotatedAnchorPosition,
	initResizeState,
	pointInBounds,
	// Resize utilities
	type ResizeState,
	// RotationMatrix utilities
	type RotationMatrix,
	rotateDeltaWithMatrix,
	rotatePoint,
	rotatePointWithMatrix,
	scalePoint,
	snapPointToGrid,
	snapToGrid,
	unionBounds,
	unrotateDeltaWithMatrix,
	unrotatePointWithMatrix
} from 'react-svg-canvas'

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

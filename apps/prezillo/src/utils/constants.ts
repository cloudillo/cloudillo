// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shared constants for the Prezillo application
 */

/** Minimum size (width/height) for objects during resize operations */
export const MIN_OBJECT_SIZE = 10

/** Minimum drag distance to create a new object with a tool */
export const MIN_TOOL_DRAG_SIZE = 5

/** Rotation snap angle in degrees (objects snap to multiples of this) */
export const ROTATION_SNAP_ANGLE = 15

/** Padding around object bounds for the rotation handle arc */
export const ROTATION_HANDLE_PADDING = 25

/** Default view bounds when no active view is set */
export const DEFAULT_VIEW_BOUNDS = {
	x: 0,
	y: 0,
	width: 1920,
	height: 1080
}

// vim: ts=4

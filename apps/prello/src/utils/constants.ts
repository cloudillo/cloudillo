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
 * Shared constants for the Prello application
 */

/** Minimum size (width/height) for objects during resize operations */
export const MIN_OBJECT_SIZE = 10

/** Minimum drag distance to create a new object with a tool */
export const MIN_TOOL_DRAG_SIZE = 5

/** Rotation snap angle in degrees (objects snap to multiples of this) */
export const ROTATION_SNAP_ANGLE = 15

/** Padding around object bounds for the rotation handle arc */
export const ROTATION_HANDLE_PADDING = 25

/** Default style values for shapes */
export const DEFAULT_SHAPE_STYLE = {
	fill: '#cccccc',
	stroke: '#999999',
	strokeWidth: 1,
	fillOpacity: 1,
	strokeOpacity: 1,
	strokeDasharray: '',
	strokeLinecap: 'butt' as const,
	strokeLinejoin: 'miter' as const
}

/** Default style values for text */
export const DEFAULT_TEXT_STYLE = {
	fontFamily: 'system-ui, sans-serif',
	fontSize: 16,
	fontWeight: 'normal' as const,
	fontItalic: false,
	textDecoration: 'none' as const,
	fill: '#333333',
	textAlign: 'left' as const,
	verticalAlign: 'top' as const,
	lineHeight: 1.2,
	letterSpacing: 0
}

/** Default view bounds when no active view is set */
export const DEFAULT_VIEW_BOUNDS = {
	x: 0,
	y: 0,
	width: 1920,
	height: 1080
}

// vim: ts=4

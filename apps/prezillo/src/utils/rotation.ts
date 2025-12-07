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
 * Rotation math utilities for object transformation operations
 */

/**
 * Pre-calculated rotation values for efficient transformations
 */
export interface RotationMatrix {
	/** Cosine of the rotation angle */
	cos: number
	/** Sine of the rotation angle */
	sin: number
	/** Rotation angle in radians */
	radians: number
	/** Original rotation angle in degrees */
	degrees: number
}

/**
 * Creates a rotation matrix from degrees
 *
 * Pre-calculates cos/sin values for efficient reuse in transformations.
 *
 * @param degrees - Rotation angle in degrees
 * @returns Pre-calculated rotation values
 */
export function getRotationMatrix(degrees: number): RotationMatrix {
	const radians = degrees * (Math.PI / 180)
	return {
		cos: Math.cos(radians),
		sin: Math.sin(radians),
		radians,
		degrees
	}
}

/**
 * Rotates a point around a center point
 *
 * @param x - X coordinate of the point to rotate
 * @param y - Y coordinate of the point to rotate
 * @param cx - X coordinate of the center of rotation
 * @param cy - Y coordinate of the center of rotation
 * @param matrix - Pre-calculated rotation matrix
 * @returns Tuple of [rotatedX, rotatedY]
 */
export function rotatePointAroundCenter(
	x: number,
	y: number,
	cx: number,
	cy: number,
	matrix: RotationMatrix
): [number, number] {
	const dx = x - cx
	const dy = y - cy
	return [cx + dx * matrix.cos - dy * matrix.sin, cy + dx * matrix.sin + dy * matrix.cos]
}

/**
 * Un-rotates (inverse rotates) a point around a center point
 *
 * This is the inverse of rotatePointAroundCenter - it transforms a point
 * from screen/rotated space back to local/object space.
 *
 * @param x - X coordinate of the point to un-rotate
 * @param y - Y coordinate of the point to un-rotate
 * @param cx - X coordinate of the center of rotation
 * @param cy - Y coordinate of the center of rotation
 * @param matrix - Pre-calculated rotation matrix
 * @returns Tuple of [unrotatedX, unrotatedY]
 */
export function unrotatePointAroundCenter(
	x: number,
	y: number,
	cx: number,
	cy: number,
	matrix: RotationMatrix
): [number, number] {
	const dx = x - cx
	const dy = y - cy
	// Inverse rotation: use -angle (which means swap signs on sin terms)
	return [cx + dx * matrix.cos + dy * matrix.sin, cy - dx * matrix.sin + dy * matrix.cos]
}

/**
 * Un-rotates a delta (direction vector) from screen space to local object space
 *
 * Used for transforming mouse movement deltas when working with rotated objects.
 *
 * @param dx - X component of the delta
 * @param dy - Y component of the delta
 * @param matrix - Pre-calculated rotation matrix
 * @returns Tuple of [localDx, localDy]
 */
export function unrotateDelta(dx: number, dy: number, matrix: RotationMatrix): [number, number] {
	return [dx * matrix.cos + dy * matrix.sin, -dx * matrix.sin + dy * matrix.cos]
}

/**
 * Rotates a delta (direction vector) from local object space to screen space
 *
 * @param dx - X component of the delta in local space
 * @param dy - Y component of the delta in local space
 * @param matrix - Pre-calculated rotation matrix
 * @returns Tuple of [screenDx, screenDy]
 */
export function rotateDelta(dx: number, dy: number, matrix: RotationMatrix): [number, number] {
	return [dx * matrix.cos - dy * matrix.sin, dx * matrix.sin + dy * matrix.cos]
}

/**
 * Normalizes an angle to the range [0, 360)
 *
 * @param degrees - Angle in degrees (can be negative or > 360)
 * @returns Normalized angle in range [0, 360)
 */
export function normalizeAngle(degrees: number): number {
	return ((degrees % 360) + 360) % 360
}

/**
 * Snaps an angle to the nearest multiple of a snap angle
 *
 * @param degrees - Angle in degrees
 * @param snapAngle - Snap interval in degrees (e.g., 15 for 15° snapping)
 * @returns Snapped angle
 */
export function snapAngle(degrees: number, snapAngle: number): number {
	return Math.round(degrees / snapAngle) * snapAngle
}

/**
 * Calculates position compensation when changing pivot point on a rotated object
 *
 * When the pivot point changes, the object's position needs to be adjusted to
 * keep the object visually in the same place.
 *
 * @param x - Current X position
 * @param y - Current Y position
 * @param width - Object width
 * @param height - Object height
 * @param oldPivotX - Previous pivot X (normalized 0-1)
 * @param oldPivotY - Previous pivot Y (normalized 0-1)
 * @param newPivotX - New pivot X (normalized 0-1)
 * @param newPivotY - New pivot Y (normalized 0-1)
 * @param matrix - Pre-calculated rotation matrix
 * @returns Tuple of [compensatedX, compensatedY]
 */
export function compensatePivotChange(
	x: number,
	y: number,
	width: number,
	height: number,
	oldPivotX: number,
	oldPivotY: number,
	newPivotX: number,
	newPivotY: number,
	matrix: RotationMatrix
): [number, number] {
	const dpx = oldPivotX - newPivotX
	const dpy = oldPivotY - newPivotY
	return [
		x + width * dpx * (1 - matrix.cos) + height * dpy * matrix.sin,
		y + height * dpy * (1 - matrix.cos) - width * dpx * matrix.sin
	]
}

// vim: ts=4

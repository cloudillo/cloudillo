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
 * Transform utilities for SVG rendering
 */

/**
 * Object-like shape with bounds and optional transform properties
 */
interface TransformableObject {
	x: number
	y: number
	width: number
	height: number
	rotation?: number
	pivotX?: number
	pivotY?: number
}

/**
 * Calculate the SVG rotation transform string for an object.
 * Returns undefined if rotation is 0 or not set.
 *
 * @param object - Object with bounds and optional rotation/pivot
 * @returns SVG transform string like "rotate(45 100 100)" or undefined
 */
export function calculateRotationTransform(object: TransformableObject): string | undefined {
	const rotation = object.rotation ?? 0
	if (rotation === 0) return undefined

	const pivotX = object.pivotX ?? 0.5
	const pivotY = object.pivotY ?? 0.5
	const cx = object.x + object.width * pivotX
	const cy = object.y + object.height * pivotY

	return `rotate(${rotation} ${cx} ${cy})`
}

/**
 * Calculate rotation transform with explicit values.
 * Use this when bounds come from tempBounds or are computed separately.
 *
 * @returns SVG transform string like "rotate(45 100 100)" or undefined
 */
export function calculateRotationTransformFromBounds(
	x: number,
	y: number,
	width: number,
	height: number,
	rotation: number = 0,
	pivotX: number = 0.5,
	pivotY: number = 0.5
): string | undefined {
	if (rotation === 0) return undefined

	const cx = x + width * pivotX
	const cy = y + height * pivotY

	return `rotate(${rotation} ${cx} ${cy})`
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

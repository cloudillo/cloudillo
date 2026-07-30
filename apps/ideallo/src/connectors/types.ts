// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shared types for connector routing.
 *
 * Routes are DERIVED, never stored: moving, resizing or rotating a shape writes only that shape
 * to the CRDT and nothing to any arrow bound to it. Everything in this directory is a pure
 * function of replicated state, so every peer computes byte-identical geometry with zero traffic.
 */

import type { Bounds, Dir, ObjectId, ObjectType, ResolvedRoute } from '../crdt/index.js'
import { rotatePoint } from '../utils/geometry.js'

export type { Dir, ResolvedRoute }

/**
 * The subset of an object's geometry that routing cares about.
 *
 * `bounds` is the axis-aligned box BEFORE rotation - the same box `getObjectBounds()` returns -
 * and `rotation`/`pivotX`/`pivotY` describe how it is turned. Routing works in the shape's local
 * (unrotated) frame and rotates the result back, so an anchor stays put on a rotated shape.
 */
export interface ShapeGeometry {
	id: ObjectId
	type: ObjectType
	bounds: Bounds
	rotation: number // degrees
	pivotX: number // 0-1 normalized within bounds
	pivotY: number
	// Polygons: absolute coordinates in the shape's LOCAL frame - unrotated, exactly like `bounds`,
	// which is also the frame they are stored in. Rotation is applied on top, by the renderer.
	vertices?: [number, number][]
}

/** Lookup of the shapes a connector may bind to. Tolerates missing ids (dangling refs). */
export interface ConnectorContext {
	get(id: ObjectId): ShapeGeometry | undefined
}

/**
 * The point a shape turns about. Matches getRotationCenter() in utils/bounds.ts: the pivot is
 * normalized within the object's own bounds, so it is usually but not always the box center.
 */
export function shapeRotationCenter(shape: ShapeGeometry): [number, number] {
	return [
		shape.bounds.x + shape.bounds.width * shape.pivotX,
		shape.bounds.y + shape.bounds.height * shape.pivotY
	]
}

/**
 * The geometric center of a shape's box in world space. With an off-center pivot this is not
 * the rotation center, so it has to be rotated along with the rest of the shape.
 */
export function shapeBoundsCenter(shape: ShapeGeometry): [number, number] {
	const local: [number, number] = [
		shape.bounds.x + shape.bounds.width / 2,
		shape.bounds.y + shape.bounds.height / 2
	]
	if (!shape.rotation) return local
	return rotatePoint(local, shapeRotationCenter(shape), shape.rotation)
}

// vim: ts=4

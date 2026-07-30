// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Bounds computation for Ideallo objects
 */

import type { Bounds, IdealloObject } from '../crdt/index.js'
import type { Point } from './geometry.js'
import { getBoundsFromPoints, rotatePoint } from './geometry.js'
import { calculatePathBounds } from './hit-testing.js'

/** Compute the axis-aligned bounding box for any Ideallo object type */
export function getObjectBounds(obj: IdealloObject): Bounds {
	switch (obj.type) {
		case 'freehand': {
			// Calculate actual bounds from path data at runtime
			// Path data can have negative coords (control points extend beyond stored bounds)
			const pathBounds = calculatePathBounds(obj.pathData)
			if (pathBounds) {
				return {
					x: obj.x + pathBounds.x,
					y: obj.y + pathBounds.y,
					width: pathBounds.width,
					height: pathBounds.height
				}
			}
			// Fallback to stored bounds
			return { x: obj.x, y: obj.y, width: obj.width, height: obj.height }
		}
		case 'rect':
		case 'ellipse':
		case 'text':
		case 'sticky':
		case 'image':
		case 'document':
			return { x: obj.x, y: obj.y, width: obj.width, height: obj.height }
		case 'polygon':
			return getBoundsFromPoints(obj.vertices)
		case 'connector':
			// A routed connector's extent is its whole polyline plus its arrowheads. An elbow
			// route routinely leaves the endpoints' box - going around an obstacle is the point -
			// so using the endpoint box here would make it unselectable and unhittable.
			if (obj.route) return obj.route.bounds
			return endpointBounds(obj.startX, obj.startY, obj.endX, obj.endY)
	}
}

function endpointBounds(x1: number, y1: number, x2: number, y2: number): Bounds {
	return {
		x: Math.min(x1, x2),
		y: Math.min(y1, y2),
		width: Math.abs(x2 - x1),
		height: Math.abs(y2 - y1)
	}
}

/**
 * The point an object turns about: its pivot, on the box the object is actually drawn in.
 *
 * THE implementation - ObjectRenderer's `rotate()` transform, hit testing's inverse rotation and
 * getRotatedObjectBounds all call this one. A second copy that disagreed would draw a rotated
 * object in one place and hit-test it in another.
 */
export function getRotationCenter(obj: IdealloObject): Point {
	const pivotX = obj.pivotX ?? 0.5
	const pivotY = obj.pivotY ?? 0.5

	switch (obj.type) {
		case 'freehand': {
			// Path data can extend beyond the stored box, so measure it, as getObjectBounds does
			const pathBounds = calculatePathBounds(obj.pathData)
			if (pathBounds) {
				return [
					obj.x + pathBounds.x + pathBounds.width * pivotX,
					obj.y + pathBounds.y + pathBounds.height * pivotY
				]
			}
			return [obj.x + obj.width * pivotX, obj.y + obj.height * pivotY]
		}
		case 'polygon': {
			const b = getBoundsFromPoints(obj.vertices)
			return [b.x + b.width * pivotX, b.y + b.height * pivotY]
		}
		case 'connector': {
			// A routed connector turns about its whole route, not just its two endpoints
			const b = obj.route
				? obj.route.bounds
				: endpointBounds(obj.startX, obj.startY, obj.endX, obj.endY)
			return [b.x + b.width * pivotX, b.y + b.height * pivotY]
		}
		default:
			return [obj.x + obj.width * pivotX, obj.y + obj.height * pivotY]
	}
}

/**
 * World AABB of an object as it is DRAWN, rotation included - where getObjectBounds returns the
 * unrotated box.
 *
 * For the multi-selection frame, which has no single rotation it could be drawn at. A single
 * selection deliberately keeps the unrotated box: SelectionBox turns that box itself.
 */
export function getRotatedObjectBounds(obj: IdealloObject): Bounds {
	const bounds = getObjectBounds(obj)
	// The same threshold ObjectRenderer uses to decide whether to emit a rotate() at all
	const rotation = obj.rotation
	if (!rotation || Math.abs(rotation) <= 0.1) return bounds

	const center = getRotationCenter(obj)
	// A polygon's real outline, so a rotated triangle gets its own box rather than the swept box
	// of four corners it never occupied
	const points: Point[] =
		obj.type === 'polygon' && obj.vertices.length
			? obj.vertices
			: [
					[bounds.x, bounds.y],
					[bounds.x + bounds.width, bounds.y],
					[bounds.x + bounds.width, bounds.y + bounds.height],
					[bounds.x, bounds.y + bounds.height]
				]
	return getBoundsFromPoints(points.map((p) => rotatePoint(p, center, rotation)))
}

// vim: ts=4

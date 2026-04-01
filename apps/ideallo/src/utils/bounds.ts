// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Bounds computation for Ideallo objects
 */

import type { IdealloObject, Bounds } from '../crdt/index.js'
import { getBoundsFromPoints } from './geometry.js'
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
		case 'line':
		case 'arrow':
			return {
				x: Math.min(obj.startX, obj.endX),
				y: Math.min(obj.startY, obj.endY),
				width: Math.abs(obj.endX - obj.startX),
				height: Math.abs(obj.endY - obj.startY)
			}
	}
}

// vim: ts=4

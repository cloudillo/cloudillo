// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Coordinate transformations and spatial utilities
 */

// Import utilities used in this file
import { boundsIntersectsView } from 'react-svg-canvas'

import type { ObjectId, ViewId } from './ids'
import { getResolvedWh, getResolvedXy } from './prototype-ops'
import type { Bounds, Point } from './runtime-types'
import type { StoredObject, StoredView, YPrezilloDocument } from './stored-types'

// Re-export generic geometry utilities from react-svg-canvas
export {
	boundsIntersect,
	boundsIntersectsView,
	calculateResizeBounds,
	calculateResizedDimensions,
	calculateResizedPosition,
	// View coordinate utilities
	canvasToView,
	composeTransforms,
	createRotationMatrix,
	distance,
	expandBounds,
	getAnchorForHandle,
	getBoundsCenter,
	getRotatedAnchorPosition,
	initResizeState,
	isPointInView,
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
	unrotatePointWithMatrix,
	viewToCanvas
} from 'react-svg-canvas'

/**
 * Get absolute position for a stored object.
 * If the object has a viewId (vi), its coordinates are page-relative
 * and we add the view origin first before applying container transforms.
 * Returns null if the object has no xy coordinates (neither own nor prototype).
 */
export function getAbsolutePositionStored(
	doc: YPrezilloDocument,
	object: StoredObject
): Point | null {
	const xy = getResolvedXy(doc, object)
	if (!xy) return null

	let x = xy[0]
	let y = xy[1]

	// If object is page-relative, add view origin first
	if (object.vi) {
		const view = doc.v.get(object.vi)
		if (view) {
			x += view.x
			y += view.y
		}
		// If view doesn't exist, treat as floating (edge case for deleted views)
	}

	// Then apply container hierarchy
	let parentId = object.p

	while (parentId) {
		const parent = doc.c.get(parentId)
		if (!parent) break

		const rotation = ((parent.r || 0) * Math.PI) / 180
		const cos = Math.cos(rotation)
		const sin = Math.sin(rotation)
		const sx = parent.sc?.[0] ?? 1
		const sy = parent.sc?.[1] ?? 1

		const newX = parent.xy[0] + (x * cos - y * sin) * sx
		const newY = parent.xy[1] + (x * sin + y * cos) * sy

		x = newX
		y = newY
		parentId = parent.p
	}

	return { x, y }
}

/**
 * Find which view contains a given canvas point.
 * Returns the first matching view or null if point is outside all views.
 */
export function findViewAtPoint(
	doc: YPrezilloDocument,
	canvasX: number,
	canvasY: number
): ViewId | null {
	for (const viewId of doc.vo.toArray()) {
		const view = doc.v.get(viewId)
		if (!view) continue
		if (
			canvasX >= view.x &&
			canvasX <= view.x + view.width &&
			canvasY >= view.y &&
			canvasY <= view.y + view.height
		) {
			return viewId as ViewId
		}
	}
	return null
}

/**
 * Get absolute bounds for an object
 */
export function getAbsoluteBounds(doc: YPrezilloDocument, objectId: ObjectId): Bounds | null {
	const object = doc.o.get(objectId)
	if (!object) return null

	const pos = getAbsolutePositionStored(doc, object)
	if (!pos) return null

	const wh = getResolvedWh(doc, object)
	if (!wh) return null

	return {
		x: pos.x,
		y: pos.y,
		width: wh[0],
		height: wh[1]
	}
}

/**
 * Get absolute bounds for a stored object
 */
export function getAbsoluteBoundsStored(
	doc: YPrezilloDocument,
	object: StoredObject
): Bounds | null {
	const pos = getAbsolutePositionStored(doc, object)
	if (!pos) return null

	const wh = getResolvedWh(doc, object)
	if (!wh) return null

	return {
		x: pos.x,
		y: pos.y,
		width: wh[0],
		height: wh[1]
	}
}

/**
 * Check if an object's bounding box intersects with a view
 */
export function objectIntersectsView(
	doc: YPrezilloDocument,
	object: StoredObject,
	view: StoredView
): boolean {
	const bounds = getAbsoluteBoundsStored(doc, object)
	if (!bounds) return false
	return boundsIntersectsView(bounds, view)
}

// vim: ts=4

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
 * Coordinate transformations and spatial utilities
 */

import type { YPrezilloDocument, StoredObject, StoredContainer, StoredView } from './stored-types'
import type { ObjectId, ContainerId, ViewId } from './ids'
import { toContainerId } from './ids'
import type {
	Point,
	Bounds,
	Transform,
	PrezilloObject,
	ContainerNode,
	ViewNode
} from './runtime-types'
import { expandObject, expandContainer, expandView } from './type-converters'

// Import utilities used in this file
import { composeTransforms, unionBounds, boundsIntersectsView } from 'react-svg-canvas'

// Re-export generic geometry utilities from react-svg-canvas
export {
	composeTransforms,
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
	// View coordinate utilities
	canvasToView,
	viewToCanvas,
	isPointInView,
	boundsIntersectsView,
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

/**
 * Get the absolute canvas position of an object by ID.
 * Delegates to getAbsolutePositionStored which handles page-relative coordinates.
 */
export function getAbsolutePosition(doc: YPrezilloDocument, objectId: ObjectId): Point | null {
	const object = doc.o.get(objectId)
	if (!object) return null
	return getAbsolutePositionStored(doc, object)
}

/**
 * Get absolute position for a stored object.
 * If the object has a viewId (vi), its coordinates are page-relative
 * and we add the view origin first before applying container transforms.
 */
export function getAbsolutePositionStored(doc: YPrezilloDocument, object: StoredObject): Point {
	let x = object.xy[0]
	let y = object.xy[1]

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
 * Convert global canvas coordinates to page-relative coordinates
 */
export function canvasToPageCoords(
	doc: YPrezilloDocument,
	pageId: ViewId,
	canvasX: number,
	canvasY: number
): Point | null {
	const view = doc.v.get(pageId)
	if (!view) return null
	return { x: canvasX - view.x, y: canvasY - view.y }
}

/**
 * Convert page-relative coordinates to global canvas coordinates
 */
export function pageToCanvasCoords(
	doc: YPrezilloDocument,
	pageId: ViewId,
	localX: number,
	localY: number
): Point | null {
	const view = doc.v.get(pageId)
	if (!view) return null
	return { x: view.x + localX, y: view.y + localY }
}

/**
 * Check if a point is inside a view's bounds
 */
export function isPointInViewBounds(
	doc: YPrezilloDocument,
	pageId: ViewId,
	canvasX: number,
	canvasY: number
): boolean {
	const view = doc.v.get(pageId)
	if (!view) return false
	return (
		canvasX >= view.x &&
		canvasX <= view.x + view.width &&
		canvasY >= view.y &&
		canvasY <= view.y + view.height
	)
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
 * Get cumulative transform for an object
 */
export function getAbsoluteTransform(doc: YPrezilloDocument, objectId: ObjectId): Transform | null {
	const object = doc.o.get(objectId)
	if (!object) return null

	let transform: Transform = {
		x: object.xy[0],
		y: object.xy[1],
		rotation: object.r || 0,
		scaleX: 1,
		scaleY: 1
	}

	let parentId = object.p

	while (parentId) {
		const parent = doc.c.get(parentId)
		if (!parent) break

		transform = composeTransforms(
			{
				x: parent.xy[0],
				y: parent.xy[1],
				rotation: parent.r || 0,
				scaleX: parent.sc?.[0] ?? 1,
				scaleY: parent.sc?.[1] ?? 1
			},
			transform
		)

		parentId = parent.p
	}

	return transform
}

/**
 * Get absolute bounds for an object
 */
export function getAbsoluteBounds(doc: YPrezilloDocument, objectId: ObjectId): Bounds | null {
	const object = doc.o.get(objectId)
	if (!object) return null

	const pos = getAbsolutePositionStored(doc, object)

	return {
		x: pos.x,
		y: pos.y,
		width: object.wh[0],
		height: object.wh[1]
	}
}

/**
 * Get absolute bounds for a stored object
 */
export function getAbsoluteBoundsStored(doc: YPrezilloDocument, object: StoredObject): Bounds {
	const pos = getAbsolutePositionStored(doc, object)

	return {
		x: pos.x,
		y: pos.y,
		width: object.wh[0],
		height: object.wh[1]
	}
}

/**
 * Get bounding box of a container (union of all children bounds)
 */
export function getContainerBounds(
	doc: YPrezilloDocument,
	containerId: ContainerId
): Bounds | null {
	const container = doc.c.get(containerId)
	if (!container) return null

	const children = doc.ch.get(containerId)
	if (!children || children.length === 0) return null

	let minX = Infinity,
		minY = Infinity
	let maxX = -Infinity,
		maxY = -Infinity

	children.toArray().forEach((ref) => {
		if (ref[0] === 0) {
			// Object
			const obj = doc.o.get(ref[1])
			if (!obj || obj.v === false) return

			const x = obj.xy[0]
			const y = obj.xy[1]
			const w = obj.wh[0]
			const h = obj.wh[1]

			minX = Math.min(minX, x)
			minY = Math.min(minY, y)
			maxX = Math.max(maxX, x + w)
			maxY = Math.max(maxY, y + h)
		} else {
			// Container
			const childContainer = doc.c.get(ref[1])
			if (!childContainer || childContainer.v === false) return

			const childBounds = getContainerBounds(doc, toContainerId(ref[1]))
			if (childBounds) {
				const absX = childContainer.xy[0] + childBounds.x
				const absY = childContainer.xy[1] + childBounds.y

				minX = Math.min(minX, absX)
				minY = Math.min(minY, absY)
				maxX = Math.max(maxX, absX + childBounds.width)
				maxY = Math.max(maxY, absY + childBounds.height)
			}
		}
	})

	if (minX === Infinity) return null

	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY
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
	return boundsIntersectsView(bounds, view)
}

/**
 * Calculate union bounds for multiple objects
 */
export function getSelectionBounds(doc: YPrezilloDocument, objectIds: ObjectId[]): Bounds | null {
	if (objectIds.length === 0) return null

	let result: Bounds | null = null

	objectIds.forEach((id) => {
		const bounds = getAbsoluteBounds(doc, id)
		if (bounds) {
			if (!result) {
				result = bounds
			} else {
				result = unionBounds(result, bounds)
			}
		}
	})

	return result
}

// vim: ts=4

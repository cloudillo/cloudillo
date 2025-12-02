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
 * Spatial queries and hierarchy traversal
 */

import type {
	YPrelloDocument,
	StoredObject,
	StoredContainer,
	StoredView,
	ChildRef
} from './stored-types'
import type { ObjectId, ContainerId, ViewId } from './ids'
import { toObjectId, toContainerId, toViewId } from './ids'
import type { Point, Bounds, PrelloObject, ContainerNode, ViewNode } from './runtime-types'
import { expandObject, expandContainer, expandView } from './type-converters'
import {
	getAbsolutePositionStored,
	getAbsoluteBoundsStored,
	objectIntersectsView,
	boundsIntersect,
	pointInBounds
} from './transforms'

/**
 * Get all objects visible in a view (pure spatial query)
 */
export function getObjectsInView(doc: YPrelloDocument, viewId: ViewId): PrelloObject[] {
	const view = doc.v.get(viewId)
	if (!view) return []

	const result: PrelloObject[] = []

	doc.o.forEach((obj, id) => {
		if (obj.v === false) return
		if (objectIntersectsView(doc, obj, view)) {
			result.push(expandObject(id, obj))
		}
	})

	return result
}

/**
 * Get all object IDs visible in a view
 */
export function getObjectIdsInView(doc: YPrelloDocument, viewId: ViewId): ObjectId[] {
	const view = doc.v.get(viewId)
	if (!view) return []

	const result: ObjectId[] = []

	doc.o.forEach((obj, id) => {
		if (obj.v === false) return
		if (objectIntersectsView(doc, obj, view)) {
			result.push(toObjectId(id))
		}
	})

	return result
}

/**
 * Get all objects in z-order (respecting container hierarchy)
 */
export function getAllObjectsInZOrder(doc: YPrelloDocument): PrelloObject[] {
	const result: PrelloObject[] = []

	function traverse(children: ChildRef[]) {
		children.forEach((ref) => {
			if (ref[0] === 0) {
				// Object
				const obj = doc.o.get(ref[1])
				if (obj && obj.v !== false) {
					result.push(expandObject(ref[1], obj))
				}
			} else {
				// Container
				const container = doc.c.get(ref[1])
				if (container && container.v !== false) {
					const containerChildren = doc.ch.get(ref[1])
					if (containerChildren) {
						traverse(containerChildren.toArray())
					}
				}
			}
		})
	}

	traverse(doc.r.toArray())
	return result
}

/**
 * Get all object IDs in z-order
 */
export function getAllObjectIdsInZOrder(doc: YPrelloDocument): ObjectId[] {
	const result: ObjectId[] = []

	function traverse(children: ChildRef[]) {
		children.forEach((ref) => {
			if (ref[0] === 0) {
				const obj = doc.o.get(ref[1])
				if (obj && obj.v !== false) {
					result.push(toObjectId(ref[1]))
				}
			} else {
				const container = doc.c.get(ref[1])
				if (container && container.v !== false) {
					const containerChildren = doc.ch.get(ref[1])
					if (containerChildren) {
						traverse(containerChildren.toArray())
					}
				}
			}
		})
	}

	traverse(doc.r.toArray())
	return result
}

/**
 * Get objects visible in a view, in z-order
 */
export function getObjectsInViewInZOrder(doc: YPrelloDocument, viewId: ViewId): PrelloObject[] {
	const storedView = doc.v.get(viewId)
	if (!storedView) return []
	const view = storedView // Non-null for use in closure

	const result: PrelloObject[] = []

	function traverse(children: ChildRef[]) {
		children.forEach((ref) => {
			if (ref[0] === 0) {
				const obj = doc.o.get(ref[1])
				if (obj && obj.v !== false && objectIntersectsView(doc, obj, view)) {
					result.push(expandObject(ref[1], obj))
				}
			} else {
				const container = doc.c.get(ref[1])
				if (container && container.v !== false) {
					const containerChildren = doc.ch.get(ref[1])
					if (containerChildren) {
						traverse(containerChildren.toArray())
					}
				}
			}
		})
	}

	traverse(doc.r.toArray())
	return result
}

/**
 * Get objects at a point (hit testing)
 * Returns in reverse z-order (front to back)
 */
export function getObjectsAtPoint(
	doc: YPrelloDocument,
	canvasX: number,
	canvasY: number
): PrelloObject[] {
	const allObjects = getAllObjectsInZOrder(doc)
	const result: PrelloObject[] = []

	allObjects.forEach((obj) => {
		const bounds = getAbsoluteBoundsStored(doc, doc.o.get(obj.id)!)
		if (pointInBounds({ x: canvasX, y: canvasY }, bounds)) {
			result.push(obj)
		}
	})

	// Reverse to get front-to-back order
	return result.reverse()
}

/**
 * Get object IDs at a point
 */
export function getObjectIdsAtPoint(
	doc: YPrelloDocument,
	canvasX: number,
	canvasY: number
): ObjectId[] {
	const objectIds = getAllObjectIdsInZOrder(doc)
	const result: ObjectId[] = []

	objectIds.forEach((id) => {
		const obj = doc.o.get(id)
		if (obj) {
			const bounds = getAbsoluteBoundsStored(doc, obj)
			if (pointInBounds({ x: canvasX, y: canvasY }, bounds)) {
				result.push(id)
			}
		}
	})

	return result.reverse()
}

/**
 * Get topmost object at a point
 */
export function getTopmostObjectAtPoint(
	doc: YPrelloDocument,
	canvasX: number,
	canvasY: number
): PrelloObject | null {
	const objects = getObjectsAtPoint(doc, canvasX, canvasY)
	return objects.length > 0 ? objects[0] : null
}

/**
 * Get topmost object ID at a point
 */
export function getTopmostObjectIdAtPoint(
	doc: YPrelloDocument,
	canvasX: number,
	canvasY: number
): ObjectId | null {
	const ids = getObjectIdsAtPoint(doc, canvasX, canvasY)
	return ids.length > 0 ? ids[0] : null
}

/**
 * Get objects in selection rectangle
 */
export function getObjectsInRect(doc: YPrelloDocument, rect: Bounds): PrelloObject[] {
	const result: PrelloObject[] = []

	doc.o.forEach((obj, id) => {
		if (obj.v === false) return

		const bounds = getAbsoluteBoundsStored(doc, obj)
		if (boundsIntersect(bounds, rect)) {
			result.push(expandObject(id, obj))
		}
	})

	return result
}

/**
 * Get object IDs in selection rectangle
 */
export function getObjectIdsInRect(doc: YPrelloDocument, rect: Bounds): ObjectId[] {
	const result: ObjectId[] = []

	doc.o.forEach((obj, id) => {
		if (obj.v === false) return

		const bounds = getAbsoluteBoundsStored(doc, obj)
		if (boundsIntersect(bounds, rect)) {
			result.push(toObjectId(id))
		}
	})

	return result
}

/**
 * Get objects fully contained in rectangle
 */
export function getObjectsContainedInRect(doc: YPrelloDocument, rect: Bounds): PrelloObject[] {
	const result: PrelloObject[] = []

	doc.o.forEach((obj, id) => {
		if (obj.v === false) return

		const bounds = getAbsoluteBoundsStored(doc, obj)
		if (
			bounds.x >= rect.x &&
			bounds.y >= rect.y &&
			bounds.x + bounds.width <= rect.x + rect.width &&
			bounds.y + bounds.height <= rect.y + rect.height
		) {
			result.push(expandObject(id, obj))
		}
	})

	return result
}

/**
 * Find view at canvas position
 */
export function getViewAtPoint(
	doc: YPrelloDocument,
	canvasX: number,
	canvasY: number
): ViewNode | null {
	// Check in reverse order (later views are "on top")
	const viewIds = doc.vo.toArray().reverse()

	for (const id of viewIds) {
		const view = doc.v.get(id)
		if (view) {
			if (
				canvasX >= view.x &&
				canvasX <= view.x + view.width &&
				canvasY >= view.y &&
				canvasY <= view.y + view.height
			) {
				return expandView(id, view)
			}
		}
	}

	return null
}

/**
 * Get all layers (containers of type 'layer' at root level)
 */
export function getLayers(doc: YPrelloDocument): ContainerNode[] {
	const layers: ContainerNode[] = []

	doc.r.toArray().forEach((ref) => {
		if (ref[0] === 1) {
			const container = doc.c.get(ref[1])
			if (container && container.t === 'L') {
				layers.push(expandContainer(ref[1], container))
			}
		}
	})

	return layers
}

/**
 * Get layer IDs
 */
export function getLayerIds(doc: YPrelloDocument): ContainerId[] {
	const layerIds: ContainerId[] = []

	doc.r.toArray().forEach((ref) => {
		if (ref[0] === 1) {
			const container = doc.c.get(ref[1])
			if (container && container.t === 'L') {
				layerIds.push(toContainerId(ref[1]))
			}
		}
	})

	return layerIds
}

/**
 * Get container ancestry (path from root to container)
 */
export function getContainerAncestry(
	doc: YPrelloDocument,
	containerId: ContainerId
): ContainerNode[] {
	const ancestry: ContainerNode[] = []
	let currentId: string | undefined = containerId

	while (currentId) {
		const container = doc.c.get(currentId)
		if (!container) break
		ancestry.unshift(expandContainer(currentId, container))
		currentId = container.p
	}

	return ancestry
}

/**
 * Get object's container ancestry
 */
export function getObjectAncestry(doc: YPrelloDocument, objectId: ObjectId): ContainerNode[] {
	const object = doc.o.get(objectId)
	if (!object || !object.p) return []

	return getContainerAncestry(doc, toContainerId(object.p))
}

/**
 * Get all descendants of a container (objects and containers)
 */
export function getContainerDescendants(
	doc: YPrelloDocument,
	containerId: ContainerId
): { objects: ObjectId[]; containers: ContainerId[] } {
	const objects: ObjectId[] = []
	const containers: ContainerId[] = []

	function traverse(id: ContainerId) {
		const children = doc.ch.get(id)
		if (!children) return

		children.toArray().forEach((ref) => {
			if (ref[0] === 0) {
				objects.push(toObjectId(ref[1]))
			} else {
				containers.push(toContainerId(ref[1]))
				traverse(toContainerId(ref[1]))
			}
		})
	}

	traverse(containerId)
	return { objects, containers }
}

/**
 * Check if a container is ancestor of another
 */
export function isAncestorOf(
	doc: YPrelloDocument,
	ancestorId: ContainerId,
	descendantId: ContainerId
): boolean {
	let currentId: string | undefined = descendantId

	while (currentId) {
		if (currentId === ancestorId) return true
		const container = doc.c.get(currentId)
		if (!container) break
		currentId = container.p
	}

	return false
}

/**
 * Get siblings of an object (same parent)
 */
export function getObjectSiblings(doc: YPrelloDocument, objectId: ObjectId): ObjectId[] {
	const object = doc.o.get(objectId)
	if (!object) return []

	const children = object.p ? doc.ch.get(object.p) : doc.r

	if (!children) return []

	return children
		.toArray()
		.filter((ref) => ref[0] === 0 && ref[1] !== objectId)
		.map((ref) => toObjectId(ref[1]))
}

/**
 * Get z-index of object within its parent
 */
export function getObjectZIndex(doc: YPrelloDocument, objectId: ObjectId): number {
	const object = doc.o.get(objectId)
	if (!object) return -1

	const children = object.p ? doc.ch.get(object.p) : doc.r

	if (!children) return -1

	const arr = children.toArray()
	return arr.findIndex((ref) => ref[0] === 0 && ref[1] === objectId)
}

/**
 * Get all objects with a specific style applied
 */
export function getObjectsWithStyle(
	doc: YPrelloDocument,
	styleId: string,
	type: 'shape' | 'text' = 'shape'
): ObjectId[] {
	const result: ObjectId[] = []

	doc.o.forEach((obj, id) => {
		if (type === 'shape' && obj.si === styleId) {
			result.push(toObjectId(id))
		}
		if (type === 'text' && obj.ti === styleId) {
			result.push(toObjectId(id))
		}
	})

	return result
}

/**
 * Search objects by name
 */
export function searchObjectsByName(
	doc: YPrelloDocument,
	query: string,
	caseSensitive: boolean = false
): PrelloObject[] {
	const result: PrelloObject[] = []
	const searchQuery = caseSensitive ? query : query.toLowerCase()

	doc.o.forEach((obj, id) => {
		const name = obj.n
		if (name) {
			const compareName = caseSensitive ? name : name.toLowerCase()
			if (compareName.includes(searchQuery)) {
				result.push(expandObject(id, obj))
			}
		}
	})

	return result
}

/**
 * Get object count
 */
export function getObjectCount(doc: YPrelloDocument): number {
	return doc.o.size
}

/**
 * Get container count
 */
export function getContainerCount(doc: YPrelloDocument): number {
	return doc.c.size
}

// vim: ts=4

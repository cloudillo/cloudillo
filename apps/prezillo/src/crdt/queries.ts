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
	YPrezilloDocument,
	StoredObject,
	StoredContainer,
	StoredView,
	ChildRef
} from './stored-types'
import type { ObjectId, ContainerId, ViewId } from './ids'
import { toObjectId, toContainerId, toViewId } from './ids'
import type { Point, Bounds, PrezilloObject, ContainerNode, ViewNode } from './runtime-types'
import { expandObject, expandContainer, expandView } from './type-converters'
import { resolveObject } from './prototype-ops'
import {
	getAbsolutePositionStored,
	getAbsoluteBoundsStored,
	objectIntersectsView,
	boundsIntersect,
	pointInBounds
} from './transforms'

/**
 * Get all prototype object IDs (objects that are templates for instances).
 * These should be excluded from regular view queries.
 */
function getAllPrototypeIds(doc: YPrezilloDocument): Set<string> {
	const protoIds = new Set<string>()
	doc.tpo.forEach((yArray) => {
		yArray.toArray().forEach((id) => protoIds.add(id))
	})
	return protoIds
}

/**
 * Get all objects visible in a view.
 *
 * An object is "in view" if:
 * 1. It has pageId === viewId (explicitly on this page), OR
 * 2. It's floating (no pageId) and spatially intersects the view
 *
 * Objects with pageId pointing to OTHER pages are excluded.
 */
export function getObjectsInView(doc: YPrezilloDocument, viewId: ViewId): PrezilloObject[] {
	const view = doc.v.get(viewId)
	if (!view) return []

	const protoIds = getAllPrototypeIds(doc)
	const result: PrezilloObject[] = []

	doc.o.forEach((obj, id) => {
		if (obj.v === false) return
		// Skip prototype objects (they're for templates, not direct rendering)
		if (protoIds.has(id)) return

		// Page-relative objects: include only if on THIS page
		if (obj.vi) {
			if (obj.vi === viewId) {
				const resolved = resolveObject(doc, toObjectId(id))
				if (resolved) result.push(resolved)
			}
			// Objects on other pages are excluded
			return
		}

		// Floating objects (no pageId): include if spatially intersecting
		if (objectIntersectsView(doc, obj, view)) {
			const resolved = resolveObject(doc, toObjectId(id))
			if (resolved) result.push(resolved)
		}
	})

	return result
}

/**
 * Get objects explicitly associated with a page (page-relative objects only).
 * Does not include floating objects that happen to intersect spatially.
 */
export function getPageObjects(doc: YPrezilloDocument, viewId: ViewId): PrezilloObject[] {
	const result: PrezilloObject[] = []

	doc.o.forEach((obj, id) => {
		if (obj.v === false) return
		if (obj.vi === viewId) {
			const resolved = resolveObject(doc, toObjectId(id))
			if (resolved) result.push(resolved)
		}
	})

	return result
}

/**
 * Get all object IDs visible in a view.
 * Uses the same combined logic as getObjectsInView.
 */
export function getObjectIdsInView(doc: YPrezilloDocument, viewId: ViewId): ObjectId[] {
	const view = doc.v.get(viewId)
	if (!view) return []

	const protoIds = getAllPrototypeIds(doc)
	const result: ObjectId[] = []

	doc.o.forEach((obj, id) => {
		if (obj.v === false) return
		// Skip prototype objects
		if (protoIds.has(id)) return

		// Page-relative objects: include only if on THIS page
		if (obj.vi) {
			if (obj.vi === viewId) {
				result.push(toObjectId(id))
			}
			return
		}

		// Floating objects: include if spatially intersecting
		if (objectIntersectsView(doc, obj, view)) {
			result.push(toObjectId(id))
		}
	})

	return result
}

/**
 * Generic z-order traversal that collects results via a callback.
 * The callback receives (objectId, storedObject) and can return a value to collect,
 * or undefined to skip the object.
 */
function traverseInZOrder<T>(
	doc: YPrezilloDocument,
	collector: (id: string, obj: StoredObject) => T | undefined
): T[] {
	const result: T[] = []

	function traverse(children: ChildRef[]) {
		children.forEach((ref) => {
			if (ref[0] === 0) {
				// Object
				const obj = doc.o.get(ref[1])
				if (obj && obj.v !== false) {
					const collected = collector(ref[1], obj)
					if (collected !== undefined) result.push(collected)
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
 * Get all objects in z-order (respecting container hierarchy)
 */
export function getAllObjectsInZOrder(doc: YPrezilloDocument): PrezilloObject[] {
	return traverseInZOrder(doc, (id) => resolveObject(doc, toObjectId(id)))
}

/**
 * Get all object IDs in z-order
 */
export function getAllObjectIdsInZOrder(doc: YPrezilloDocument): ObjectId[] {
	return traverseInZOrder(doc, (id) => toObjectId(id))
}

/**
 * Get objects visible in a view, in z-order.
 * Uses the same combined logic as getObjectsInView.
 */
export function getObjectsInViewInZOrder(doc: YPrezilloDocument, viewId: ViewId): PrezilloObject[] {
	const storedView = doc.v.get(viewId)
	if (!storedView) return []
	const view = storedView // Non-null for use in closure

	const protoIds = getAllPrototypeIds(doc)
	const result: PrezilloObject[] = []

	function traverse(children: ChildRef[]) {
		children.forEach((ref) => {
			if (ref[0] === 0) {
				const obj = doc.o.get(ref[1])
				if (!obj || obj.v === false) return
				// Skip prototype objects (they're for templates, not direct rendering)
				if (protoIds.has(ref[1])) return

				// Page-relative objects: include only if on THIS page
				if (obj.vi) {
					if (obj.vi === viewId) {
						const resolved = resolveObject(doc, toObjectId(ref[1]))
						if (resolved) result.push(resolved)
					}
					return
				}

				// Floating objects: include if spatially intersecting
				if (objectIntersectsView(doc, obj, view)) {
					const resolved = resolveObject(doc, toObjectId(ref[1]))
					if (resolved) result.push(resolved)
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
	doc: YPrezilloDocument,
	canvasX: number,
	canvasY: number
): PrezilloObject[] {
	const allObjects = getAllObjectsInZOrder(doc)
	const result: PrezilloObject[] = []

	allObjects.forEach((obj) => {
		const stored = doc.o.get(obj.id)
		if (!stored) return
		const bounds = getAbsoluteBoundsStored(doc, stored)
		if (bounds && pointInBounds({ x: canvasX, y: canvasY }, bounds)) {
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
	doc: YPrezilloDocument,
	canvasX: number,
	canvasY: number
): ObjectId[] {
	const objectIds = getAllObjectIdsInZOrder(doc)
	const result: ObjectId[] = []

	objectIds.forEach((id) => {
		const obj = doc.o.get(id)
		if (obj) {
			const bounds = getAbsoluteBoundsStored(doc, obj)
			if (bounds && pointInBounds({ x: canvasX, y: canvasY }, bounds)) {
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
	doc: YPrezilloDocument,
	canvasX: number,
	canvasY: number
): PrezilloObject | null {
	const objects = getObjectsAtPoint(doc, canvasX, canvasY)
	return objects.length > 0 ? objects[0] : null
}

/**
 * Get topmost object ID at a point
 */
export function getTopmostObjectIdAtPoint(
	doc: YPrezilloDocument,
	canvasX: number,
	canvasY: number
): ObjectId | null {
	const ids = getObjectIdsAtPoint(doc, canvasX, canvasY)
	return ids.length > 0 ? ids[0] : null
}

/**
 * Get objects in selection rectangle
 */
export function getObjectsInRect(doc: YPrezilloDocument, rect: Bounds): PrezilloObject[] {
	const result: PrezilloObject[] = []

	doc.o.forEach((obj, id) => {
		if (obj.v === false) return

		const bounds = getAbsoluteBoundsStored(doc, obj)
		if (bounds && boundsIntersect(bounds, rect)) {
			const resolved = resolveObject(doc, toObjectId(id))
			if (resolved) result.push(resolved)
		}
	})

	return result
}

/**
 * Get object IDs in selection rectangle
 */
export function getObjectIdsInRect(doc: YPrezilloDocument, rect: Bounds): ObjectId[] {
	const result: ObjectId[] = []

	doc.o.forEach((obj, id) => {
		if (obj.v === false) return

		const bounds = getAbsoluteBoundsStored(doc, obj)
		if (bounds && boundsIntersect(bounds, rect)) {
			result.push(toObjectId(id))
		}
	})

	return result
}

/**
 * Get objects fully contained in rectangle
 */
export function getObjectsContainedInRect(doc: YPrezilloDocument, rect: Bounds): PrezilloObject[] {
	const result: PrezilloObject[] = []

	doc.o.forEach((obj, id) => {
		if (obj.v === false) return

		const bounds = getAbsoluteBoundsStored(doc, obj)
		if (
			bounds &&
			bounds.x >= rect.x &&
			bounds.y >= rect.y &&
			bounds.x + bounds.width <= rect.x + rect.width &&
			bounds.y + bounds.height <= rect.y + rect.height
		) {
			const resolved = resolveObject(doc, toObjectId(id))
			if (resolved) result.push(resolved)
		}
	})

	return result
}

/**
 * Find view at canvas position
 */
export function getViewAtPoint(
	doc: YPrezilloDocument,
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
export function getLayers(doc: YPrezilloDocument): ContainerNode[] {
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
export function getLayerIds(doc: YPrezilloDocument): ContainerId[] {
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
	doc: YPrezilloDocument,
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
export function getObjectAncestry(doc: YPrezilloDocument, objectId: ObjectId): ContainerNode[] {
	const object = doc.o.get(objectId)
	if (!object || !object.p) return []

	return getContainerAncestry(doc, toContainerId(object.p))
}

/**
 * Get all descendants of a container (objects and containers)
 */
export function getContainerDescendants(
	doc: YPrezilloDocument,
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
	doc: YPrezilloDocument,
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
export function getObjectSiblings(doc: YPrezilloDocument, objectId: ObjectId): ObjectId[] {
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
export function getObjectZIndex(doc: YPrezilloDocument, objectId: ObjectId): number {
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
	doc: YPrezilloDocument,
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
	doc: YPrezilloDocument,
	query: string,
	caseSensitive: boolean = false
): PrezilloObject[] {
	const result: PrezilloObject[] = []
	const searchQuery = caseSensitive ? query : query.toLowerCase()

	doc.o.forEach((obj, id) => {
		const name = obj.n
		if (name) {
			const compareName = caseSensitive ? name : name.toLowerCase()
			if (compareName.includes(searchQuery)) {
				const resolved = resolveObject(doc, toObjectId(id))
				if (resolved) result.push(resolved)
			}
		}
	})

	return result
}

/**
 * Get object count
 */
export function getObjectCount(doc: YPrezilloDocument): number {
	return doc.o.size
}

// Re-export shared overlap calculation from canvas-tools
export { calculateOverlapPercentage } from '@cloudillo/canvas-tools'

import {
	calculateOverlapPercentage as _calculateOverlapPercentage,
	findStackedObjects,
	findStackedObjectsForSelection,
	type StackableObject
} from '@cloudillo/canvas-tools'

/**
 * Build a StackableObject[] from the prezillo document for use with shared stacking utilities.
 * Pre-filters out locked, invisible, and prototype objects. Array is in z-order.
 */
function buildStackableArray(doc: YPrezilloDocument): StackableObject[] {
	const prototypeIds = getAllPrototypeIds(doc)
	const result: StackableObject[] = []

	function traverse(children: ChildRef[]) {
		children.forEach((ref) => {
			if (ref[0] === 0) {
				const obj = doc.o.get(ref[1])
				if (!obj || obj.v === false) return
				if (obj.k) return
				if (prototypeIds.has(ref[1])) return

				const bounds = getAbsoluteBoundsStored(doc, obj)
				if (!bounds) return

				result.push({ id: ref[1], bounds })
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
 * Get objects that are "stacked on top of" the given object.
 * An object is considered stacked if:
 * 1. It has a higher z-index (appears later in z-order traversal)
 * 2. Its bounding box overlaps with the target by at least the specified threshold (default 50%)
 * 3. It is not locked
 *
 * This recursively finds all stacked objects (if A is on B and C is on A, moving B moves both A and C).
 */
export function getStackedObjects(
	doc: YPrezilloDocument,
	objectId: ObjectId,
	overlapThreshold: number = 0.5
): ObjectId[] {
	const stackable = buildStackableArray(doc)
	return findStackedObjects(stackable, objectId, { overlapThreshold }) as ObjectId[]
}

/**
 * Get all objects stacked on any of the given objects (for multi-selection).
 * Deduplicates results and excludes the input objects themselves.
 */
export function getStackedObjectsForSelection(
	doc: YPrezilloDocument,
	objectIds: ObjectId[],
	overlapThreshold: number = 0.5
): ObjectId[] {
	const stackable = buildStackableArray(doc)
	return findStackedObjectsForSelection(stackable, objectIds, { overlapThreshold }) as ObjectId[]
}

/**
 * Get container count
 */
export function getContainerCount(doc: YPrezilloDocument): number {
	return doc.c.size
}

// vim: ts=4

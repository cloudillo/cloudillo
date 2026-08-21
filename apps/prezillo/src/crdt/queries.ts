// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Spatial queries and hierarchy traversal
 */

import type { ObjectId, ViewId } from './ids'
import { toObjectId } from './ids'
import { resolveObject } from './prototype-ops'
import type { PrezilloObject } from './runtime-types'
import type { ChildRef, YPrezilloDocument } from './stored-types'
import { getAbsoluteBoundsStored, objectIntersectsView } from './transforms'

/**
 * Get all prototype object IDs (objects that are templates for instances).
 * These should be excluded from regular view queries.
 */
function getAllPrototypeIds(doc: YPrezilloDocument): Set<string> {
	const protoIds = new Set<string>()
	doc.tpo.forEach((yArray) => {
		yArray.toArray().forEach((id) => {
			protoIds.add(id)
		})
	})
	return protoIds
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

// Re-export shared overlap calculation from canvas-tools
export { calculateOverlapPercentage } from '@cloudillo/canvas-tools'

import { findStackedObjects, type StackableObject } from '@cloudillo/canvas-tools'

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

// vim: ts=4

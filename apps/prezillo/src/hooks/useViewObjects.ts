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
 * Hook for getting objects visible in current view.
 * Returns objects with computed global canvas coordinates for rendering.
 */

import * as React from 'react'
import { useY } from 'react-yjs'

import type { ViewId, YPrezilloDocument, PrezilloObject, ObjectId, StoredObject } from '../crdt'
import {
	getObjectsInViewInZOrder,
	getObjectIdsInView,
	getAbsolutePositionStored,
	resolveObject
} from '../crdt'

/**
 * Resolve global position for an object.
 * Handles page-relative objects and template instances without local xy.
 */
function resolveGlobalPosition(
	doc: YPrezilloDocument,
	obj: PrezilloObject,
	stored: StoredObject
): PrezilloObject {
	// If object has pageId, we need to compute global position
	if (stored.vi) {
		// For template instances without local xy, use resolved obj coordinates + view offset
		if (!stored.xy) {
			const view = doc.v.get(stored.vi)
			if (view) {
				return { ...obj, x: obj.x + view.x, y: obj.y + view.y }
			}
			return obj
		}
		const globalPos = getAbsolutePositionStored(doc, stored)
		if (!globalPos) return obj
		return { ...obj, x: globalPos.x, y: globalPos.y }
	}

	// Floating objects already have global coords
	return obj
}

/**
 * Get all objects visible in a view, in z-order.
 * Objects are returned with computed global canvas coordinates for rendering.
 */
export function useViewObjects(doc: YPrezilloDocument, viewId: ViewId | null): PrezilloObject[] {
	const objects = useY(doc.o)
	const views = useY(doc.v) // Subscribe to view changes (affects page-relative objects)
	const containers = useY(doc.c)
	const rootChildren = useY(doc.r)
	const containerChildren = useY(doc.ch)

	return React.useMemo(() => {
		if (!viewId || !objects) return []

		const objectsInView = getObjectsInViewInZOrder(doc, viewId)

		// Compute global positions for rendering using centralized helper
		return objectsInView.map((obj) => {
			const stored = doc.o.get(obj.id)
			if (!stored) return obj
			return resolveGlobalPosition(doc, obj, stored)
		})
	}, [doc, objects, views, containers, rootChildren, containerChildren, viewId])
}

/**
 * Get object IDs visible in a view
 */
export function useViewObjectIds(doc: YPrezilloDocument, viewId: ViewId | null): ObjectId[] {
	const objects = useY(doc.o)

	return React.useMemo(() => {
		if (!viewId || !objects) return []
		return getObjectIdsInView(doc, viewId)
	}, [doc, objects, viewId])
}

/**
 * Get all objects visible in multiple views, in z-order.
 * Objects are returned with computed global canvas coordinates for rendering.
 * Used for multi-page rendering where objects from all visible pages are shown.
 * Also includes ALL floating objects (not associated with any page) regardless of position.
 */
export function useVisibleViewObjects(
	doc: YPrezilloDocument,
	visibleViewIds: ViewId[]
): PrezilloObject[] {
	const objects = useY(doc.o)
	const views = useY(doc.v)
	const containers = useY(doc.c)
	const rootChildren = useY(doc.r)
	const containerChildren = useY(doc.ch)

	return React.useMemo(() => {
		if (!objects || visibleViewIds.length === 0) return []

		const allObjects: PrezilloObject[] = []
		const seenIds = new Set<string>()

		// Get objects from all visible views in z-order
		for (const viewId of visibleViewIds) {
			const objectsInView = getObjectsInViewInZOrder(doc, viewId)

			// Compute global positions for rendering using centralized helper
			for (const obj of objectsInView) {
				// Avoid duplicates (floating objects might appear in multiple views)
				if (seenIds.has(obj.id)) continue
				seenIds.add(obj.id)

				const stored = doc.o.get(obj.id)
				allObjects.push(stored ? resolveGlobalPosition(doc, obj, stored) : obj)
			}
		}

		// Also include ALL floating objects (no page association) that weren't already found
		// This ensures floating objects are always visible regardless of view overlap
		for (const [id, stored] of doc.o.entries()) {
			if (seenIds.has(id)) continue
			// Skip page-relative objects (they're handled by view iteration above)
			if (stored.vi) continue
			// Skip prototype objects (they're for templates, not direct rendering)
			if (stored.proto === undefined && (!stored.xy || !stored.wh)) continue

			const resolved = resolveObject(doc, id as ObjectId)
			if (resolved) {
				seenIds.add(id)
				allObjects.push(resolveGlobalPosition(doc, resolved, stored))
			}
		}

		return allObjects
	}, [doc, objects, views, containers, rootChildren, containerChildren, visibleViewIds])
}

// vim: ts=4

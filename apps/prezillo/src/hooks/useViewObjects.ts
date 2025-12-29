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

import type { ViewId, YPrezilloDocument, PrezilloObject, ObjectId } from '../crdt'
import { getObjectsInViewInZOrder, getObjectIdsInView, getAbsolutePositionStored } from '../crdt'

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

		// Compute global positions for rendering
		return objectsInView.map((obj) => {
			const stored = doc.o.get(obj.id)
			if (!stored) return obj

			// If object has pageId, we need to compute global position
			if (stored.vi) {
				const globalPos = getAbsolutePositionStored(doc, stored)
				return {
					...obj,
					x: globalPos.x,
					y: globalPos.y
				}
			}

			// Floating objects already have global coords
			return obj
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

// vim: ts=4

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
 * Hook for getting views visible in the current viewport.
 * Used for multi-page rendering - only render objects on pages that are visible.
 */

import * as React from 'react'
import { useY } from 'react-yjs'

import type { YPrezilloDocument, ViewNode, Bounds } from '../crdt'
import { getAllViews, boundsIntersect } from '../crdt'

/**
 * Get all views that intersect with the given viewport bounds.
 * Returns views in presentation order.
 */
export function useVisibleViews(doc: YPrezilloDocument, viewportBounds: Bounds | null): ViewNode[] {
	const views = useY(doc.v)
	const viewOrder = useY(doc.vo)

	return React.useMemo(() => {
		if (!views || !viewOrder || !viewportBounds) return []

		const allViews = getAllViews(doc)

		// Filter to only views that intersect the viewport
		return allViews.filter((view) =>
			boundsIntersect(
				{ x: view.x, y: view.y, width: view.width, height: view.height },
				viewportBounds
			)
		)
	}, [doc, views, viewOrder, viewportBounds])
}

// vim: ts=4

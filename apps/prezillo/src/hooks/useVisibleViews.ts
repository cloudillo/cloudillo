// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

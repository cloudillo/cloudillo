// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Hook for getting views visible in the current viewport.
 * Used for multi-page rendering - only render objects on pages that are visible.
 */

import * as React from 'react'
import { useY } from 'react-yjs'

import type { Bounds, ViewId, ViewNode, YPrezilloDocument } from '../crdt'
import { boundsIntersect, getAllViews } from '../crdt'

/**
 * Get all views that intersect with the given viewport bounds, plus the pinned view.
 * Returns views in presentation order.
 */
export function useVisibleViews(
	doc: YPrezilloDocument,
	viewportBounds: Bounds | null,
	pinnedViewId?: ViewId | null
): ViewNode[] {
	const views = useY(doc.v)
	const viewOrder = useY(doc.vo)

	return React.useMemo(() => {
		if (!views || !viewOrder || !viewportBounds) return []

		const allViews = getAllViews(doc)

		// The pinned (active) slide stays mounted while the camera catches up with a reorder:
		// bounds update an effect later, and unmounting would reload its embeds
		return allViews.filter(
			(view) =>
				view.id === pinnedViewId ||
				boundsIntersect(
					{ x: view.x, y: view.y, width: view.width, height: view.height },
					viewportBounds
				)
		)
	}, [doc, views, viewOrder, viewportBounds, pinnedViewId])
}

// vim: ts=4

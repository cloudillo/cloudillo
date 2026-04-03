// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shared view object query for export (used by PDF and PPTX export)
 */

import type { YPrezilloDocument, ViewNode, PrezilloObject } from '../crdt'
import { getObjectsInViewInZOrder, toViewId, getAbsolutePositionStored } from '../crdt'

/**
 * Get objects for a specific view/slide using the correct CRDT query
 * This properly filters:
 * - Page-relative objects: only included if on THIS page
 * - Floating objects: only included if spatially intersecting with view
 * - Prototype objects: excluded (they're for templates)
 *
 * Transforms object coordinates to view-relative coordinates (0,0 = view origin)
 * so they render correctly in SVG with viewBox starting at 0,0.
 *
 * NOTE: Callers should filter out invisible (`!obj.visible`) and presentation-hidden
 * (`obj.hidden`) objects as needed for their export context.
 */
export function getViewObjects(doc: YPrezilloDocument, view: ViewNode): PrezilloObject[] {
	const objects = getObjectsInViewInZOrder(doc, toViewId(view.id))

	// Transform to view-relative coordinates
	return objects.map((obj) => {
		const stored = doc.o.get(obj.id)
		if (!stored) return obj

		// Get global position (handles page-relative + container hierarchy)
		const globalPos = getAbsolutePositionStored(doc, stored)
		if (!globalPos) return obj

		// Convert to view-relative coordinates (subtract view origin)
		return {
			...obj,
			x: globalPos.x - view.x,
			y: globalPos.y - view.y
		}
	})
}

// vim: ts=4

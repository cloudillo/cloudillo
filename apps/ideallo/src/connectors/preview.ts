// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A terminal drag that has not been committed to the CRDT yet.
 *
 * GeometryOverride cannot express this and should not be stretched to: dragging an endpoint is a
 * pending change to the ARROW, not to a shape. Modelling it as a pending arrow patch instead lets
 * resolveConnectorRoutes() do the rest - a preview that binds is routed through the real routers,
 * a preview that unbinds falls through to a plain absolute arrow - so what the user sees mid-drag
 * is exactly what they get on release, the same property the draw gesture gets from
 * resolvePreviewRoute().
 */

import type { ObjectId } from '../crdt/ids.js'
// From the module rather than the crdt barrel, for the same reason resolve.ts does it: the barrel
// re-exports object-ops, which imports this directory.
import type { AnchorPoint, IdealloObject } from '../crdt/runtime-types.js'

export interface ConnectorEndpointPreview {
	arrowId: ObjectId
	terminal: 'start' | 'end'
	/** Live pointer position in world space */
	point: [number, number]
	/** Shape and anchor that would be bound on release, or null for an unbind */
	bind: { objectId: ObjectId; anchor: AnchorPoint } | null
}

/**
 * Apply a pending terminal drag to an arrow.
 *
 * Pure; returns the object unchanged (same reference) if it is not the arrow being dragged. The
 * other terminal is never touched.
 */
export function applyEndpointPreview(
	obj: IdealloObject,
	preview: ConnectorEndpointPreview
): IdealloObject {
	if (obj.type !== 'connector' || obj.id !== preview.arrowId) return obj

	const [x, y] = preview.point
	// A null bind clears the objectId and anchor, which is the whole unbind gesture
	if (preview.terminal === 'start') {
		return {
			...obj,
			startX: x,
			startY: y,
			startObjectId: preview.bind?.objectId,
			startAnchor: preview.bind?.anchor
		}
	}
	return {
		...obj,
		endX: x,
		endY: y,
		endObjectId: preview.bind?.objectId,
		endAnchor: preview.bind?.anchor
	}
}

// vim: ts=4

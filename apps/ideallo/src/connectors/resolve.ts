// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The connector resolver - the one entry point the rest of the app calls.
 *
 * It indexes the shapes in an object array, then for every connector with a binding computes a
 * `route` AND rewrites startX/startY/endX/endY to the resolved endpoints. Downstream code
 * (bounds, hit testing, rendering, selection) keeps working on plain endpoints exactly as it
 * did before; only the drawn path shape needs to look at `route`. That is what keeps a
 * ConnectorContext out of getObjectBounds, hitTestObject, ConnectorRenderer and their call sites.
 *
 * Pure: same input, same output, on every peer.
 */

import type { ObjectId } from '../crdt/ids.js'
// Imported from the module rather than the crdt barrel on purpose: the barrel re-exports
// object-ops, which imports this file, and a value import through it would close a runtime cycle.
import type {
	AnchorPoint,
	ArrowStyle,
	Bounds,
	ConnectorObject,
	IdealloObject,
	Routing
} from '../crdt/runtime-types.js'
import { DEFAULT_END_ARROW, DEFAULT_START_ARROW } from '../crdt/runtime-types.js'
import { getObjectBounds } from '../utils/bounds.js'
import { anchorWorldPoint } from './anchors.js'
import {
	beginResolvePass,
	endResolvePass,
	getCachedRoute,
	routeSignature,
	setCachedRoute
} from './cache.js'
import { routeArc } from './routing/arc.js'
import type { RouteRequest } from './routing/common.js'
import { routeElbow } from './routing/elbow.js'
import { routeStraight } from './routing/straight.js'
import type { ConnectorContext, ResolvedRoute, ShapeGeometry } from './types.js'

type Pt = [number, number]

/** A pending geometry change that has not been committed to the CRDT yet */
export interface GeometryOverride {
	dx?: number
	dy?: number
	bounds?: Bounds
	/**
	 * The box `bounds` is being resized FROM. Carried because a resize preview has to scale a
	 * connector's terminals out of the same source box the commit does, and that box cannot be
	 * re-measured downstream: routes are derived after the override is applied, so getObjectBounds
	 * would yield the tight endpoint box instead of the padded `route.bounds`.
	 */
	originalBounds?: Bounds
	rotation?: number
	pivotX?: number
	pivotY?: number
}

export type GeometryOverrides = Map<ObjectId, GeometryOverride> | null

/** Object types a connector may bind to. A connector cannot bind to another connector. */
export function isBindable(obj: IdealloObject): boolean {
	return obj.type !== 'connector'
}

/**
 * Whether a connector is bound at either end.
 *
 * ANY binding is enough to make rotation wrong: routes are derived in world space from the bound
 * shape, and ObjectRenderer then rotates the whole object on top - so rotating a half-bound
 * connector swings its bound terminal off the shape it is welded to. Resize is fine either way;
 * onResizeEnd already leaves a bound terminal alone, which is why the fully-bound predicate is
 * kept separate for that.
 */
export function isBoundConnector(arrow: ConnectorObject): boolean {
	return Boolean(arrow.startObjectId || arrow.endObjectId)
}

/**
 * Extract the geometry routing needs, applying any pending override.
 *
 * A freehand contributes only its (override-aware) AABB. Its `pathData` is deliberately not
 * carried: everything on `ShapeGeometry` is in absolute/world coordinates, while `pathData` is
 * expressed RELATIVE to `obj.x`/`obj.y` (see FreehandPath's translate transform), so a consumer
 * reading it off this struct would silently route against the wrong frame.
 */
export function toShapeGeometry(obj: IdealloObject, override?: GeometryOverride): ShapeGeometry {
	let bounds = getObjectBounds(obj)
	if (override?.bounds) {
		bounds = override.bounds
	} else if (override?.dx || override?.dy) {
		bounds = {
			x: bounds.x + (override.dx ?? 0),
			y: bounds.y + (override.dy ?? 0),
			width: bounds.width,
			height: bounds.height
		}
	}
	const geometry: ShapeGeometry = {
		id: obj.id,
		type: obj.type,
		bounds,
		rotation: override?.rotation ?? obj.rotation ?? 0,
		pivotX: override?.pivotX ?? obj.pivotX ?? 0.5,
		pivotY: override?.pivotY ?? obj.pivotY ?? 0.5
	}
	if (obj.type === 'polygon') {
		if (override?.bounds) {
			// Scale the outline into the new box - translating alone would leave routing to run
			// against the pre-resize outline while `bounds` said otherwise. `src` is the
			// PRE-override box; the local `bounds` has already been replaced by then.
			const src = getObjectBounds(obj)
			const sx = src.width ? bounds.width / src.width : 1
			const sy = src.height ? bounds.height / src.height : 1
			geometry.vertices = obj.vertices.map(
				(v) => [bounds.x + (v[0] - src.x) * sx, bounds.y + (v[1] - src.y) * sy] as Pt
			)
		} else {
			const dx = override?.dx ?? 0
			const dy = override?.dy ?? 0
			geometry.vertices =
				dx || dy ? obj.vertices.map((v) => [v[0] + dx, v[1] + dy] as Pt) : obj.vertices
		}
	}
	return geometry
}

/** A context nothing can be looked up in - the common case of a board with no bound connectors */
const EMPTY_CONTEXT: ConnectorContext = { get: () => undefined }

/**
 * Build a lookup over an object array, applying pending overrides.
 *
 * Only the shapes a connector actually REFERENCES get geometry. Materialising every bindable
 * object was measurably expensive: toShapeGeometry on a freehand runs getObjectBounds ->
 * calculatePathBounds, and this is rebuilt per drag frame (Canvas resolves routes from a memo that
 * changes every frame), so a board with a few hundred pen strokes and one bound arrow paid for all
 * of them on every pointermove. The route cache cannot absorb it - the context is built before any
 * route signature exists.
 *
 * Safe because a ConnectorContext is documented as exactly that lookup (connectors/types.ts), and
 * elbow routing's obstacle set is the two bound shapes only - collectObstacles in routing/elbow.ts
 * pushes req.startShape and req.endShape and nothing else. Widen that and this has to widen too.
 *
 * `alsoInclude` is the escape hatch for shapes nothing references YET: a connector still being
 * drawn binds to a shape no committed connector mentions, so without it the preview routes against
 * an empty lookup and disagrees with what lands on release.
 */
export function buildConnectorContext(
	objects: IdealloObject[],
	overrides?: GeometryOverrides,
	alsoInclude?: Iterable<ObjectId>
): ConnectorContext {
	const referenced = new Set<ObjectId>()
	for (const obj of objects) {
		if (obj.type !== 'connector') continue
		if (obj.startObjectId) referenced.add(obj.startObjectId)
		if (obj.endObjectId) referenced.add(obj.endObjectId)
	}
	if (alsoInclude) for (const id of alsoInclude) referenced.add(id)
	if (!referenced.size) return EMPTY_CONTEXT

	const index = new Map<ObjectId, ShapeGeometry>()
	for (const obj of objects) {
		if (!referenced.has(obj.id) || !isBindable(obj)) continue
		index.set(obj.id, toShapeGeometry(obj, overrides?.get(obj.id)))
	}
	return { get: (id) => index.get(id) }
}

function isBound(arrow: ConnectorObject): boolean {
	return Boolean(arrow.startObjectId || arrow.endObjectId)
}

function routeFor(req: RouteRequest): ResolvedRoute {
	switch (req.routing) {
		case 'curved':
			return routeArc(req)
		case 'orthogonal':
			return routeElbow(req)
		default:
			return routeStraight(req)
	}
}

/**
 * Resolve one connector against a shape lookup.
 *
 * A terminal whose target is missing from the document falls back to its stored `pts` snapshot
 * and renders as if unbound. That is deliberate dangling-ref tolerance: the target may simply
 * not have synced yet on a partially loaded document, and a healing write pass would have every
 * peer racing to make the same repair.
 */
export function resolveArrow(arrow: ConnectorObject, ctx: ConnectorContext): ConnectorObject {
	const startShape = arrow.startObjectId ? ctx.get(arrow.startObjectId) : undefined
	const endShape = arrow.endObjectId ? ctx.get(arrow.endObjectId) : undefined
	if (!startShape && !endShape) return arrow

	const start: Pt = startShape
		? anchorWorldPoint(startShape, arrow.startAnchor)
		: [arrow.startX, arrow.startY]
	const end: Pt = endShape
		? anchorWorldPoint(endShape, arrow.endAnchor)
		: [arrow.endX, arrow.endY]

	const startArrow = arrow.startArrow ?? DEFAULT_START_ARROW
	const endArrow = arrow.endArrow ?? DEFAULT_END_ARROW
	const strokeWidth = arrow.style.strokeWidth

	const signature = routeSignature({
		routing: arrow.routing,
		startObjectId: arrow.startObjectId,
		endObjectId: arrow.endObjectId,
		startAnchor: arrow.startAnchor,
		endAnchor: arrow.endAnchor,
		startShape,
		endShape,
		startPoint: start,
		endPoint: end,
		strokeWidth,
		startArrow,
		endArrow
	})

	let route = getCachedRoute(signature)
	if (!route) {
		route = routeFor({
			start,
			end,
			startShape,
			endShape,
			startAnchor: arrow.startAnchor,
			endAnchor: arrow.endAnchor,
			startArrow,
			endArrow,
			strokeWidth,
			routing: arrow.routing
		})
		setCachedRoute(signature, route)
	}

	const first = route.points[0]
	const last = route.points[route.points.length - 1]
	return {
		...arrow,
		startX: first[0],
		startY: first[1],
		endX: last[0],
		endY: last[1],
		route
	}
}

/** A connector being drawn, before it exists as an object */
export interface ConnectorPreview {
	startX: number
	startY: number
	endX: number
	endY: number
	startObjectId?: ObjectId
	startAnchor?: AnchorPoint
	endObjectId?: ObjectId
	endAnchor?: AnchorPoint
	routing?: Routing
	startArrow?: ArrowStyle
	endArrow?: ArrowStyle
	strokeWidth: number
}

/**
 * Route a connector that is still being drawn, through the SAME routers the committed object
 * uses - so what the user sees mid-drag is exactly what they get on release.
 *
 * Returns undefined when neither terminal is bound; the caller then draws a plain arrow.
 */
export function resolvePreviewRoute(
	preview: ConnectorPreview,
	ctx: ConnectorContext
): ResolvedRoute | undefined {
	const startShape = preview.startObjectId ? ctx.get(preview.startObjectId) : undefined
	const endShape = preview.endObjectId ? ctx.get(preview.endObjectId) : undefined
	if (!startShape && !endShape) return undefined

	return routeFor({
		start: startShape
			? anchorWorldPoint(startShape, preview.startAnchor)
			: [preview.startX, preview.startY],
		end: endShape
			? anchorWorldPoint(endShape, preview.endAnchor)
			: [preview.endX, preview.endY],
		startShape,
		endShape,
		startAnchor: preview.startAnchor,
		endAnchor: preview.endAnchor,
		startArrow: preview.startArrow ?? DEFAULT_START_ARROW,
		endArrow: preview.endArrow ?? DEFAULT_END_ARROW,
		strokeWidth: preview.strokeWidth,
		routing: preview.routing ?? 'straight'
	})
}

/**
 * Resolve every bound connector in an array.
 * Returns a NEW array; unbound connectors and other objects are returned by reference.
 */
export function resolveConnectorRoutes(
	objects: IdealloObject[],
	overrides?: GeometryOverrides
): IdealloObject[] {
	let hasBound = false
	for (const obj of objects) {
		if (obj.type === 'connector' && isBound(obj)) {
			hasBound = true
			break
		}
	}
	// Deliberately before the pass is opened: nothing to resolve, so there is no pass to account
	// for, and endResolvePass has no counterpart to close.
	if (!hasBound) return objects

	beginResolvePass()
	try {
		// The overrides are baked into the context's geometry, so resolveArrow needs nothing more
		const ctx = buildConnectorContext(objects, overrides)
		return objects.map((obj) =>
			obj.type === 'connector' && isBound(obj) ? resolveArrow(obj, ctx) : obj
		)
	} finally {
		// A throw out of a router would otherwise leave `inPass` stuck true, and every later
		// out-of-pass write from lifecycle.ts would accumulate into the diagnostic counter - the
		// exact false positive the flag exists to prevent.
		endResolvePass()
	}
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Turning a pointer position into a binding.
 *
 * One rule, used identically by the draw gesture and by dragging a terminal handle:
 *
 *   1. Within snap range of one of the 9 anchor dots  -> pin that code
 *   2. Otherwise inside the shape                     -> a free normalized [x, y]
 *   3. Alt held                                       -> a free [x, y] with no snapping at all
 *
 * Rule 2 exists because Alt is swallowed by the window manager on most Linux desktops, which would
 * leave the 9 dots as the only anchors there are. A free dot is drawn under the pointer while
 * dragging, so a free placement is never invisible.
 *
 * No drag therefore ever produces 'auto'. It remains DEFAULT_ANCHOR, remains selectable in the
 * PropertyBar's connection dropdown, and remains what an unbound terminal has. Nothing is lost by
 * not offering it on drop: 'auto', 'center' and a free [0.5, 0.5] all resolve identically today,
 * since 'center' has no side and elbow falls through to autoSide for all three while straight and
 * arc ray-cast from the box centre either way.
 */

import type { AnchorPoint, IdealloObject, ObjectId } from '../crdt/index.js'
import { rotatePoint } from '../utils/geometry.js'
import {
	distanceToEllipseEdge,
	distanceToPolygonEdge,
	pointInEllipse,
	pointInPolygon
} from '../utils/hit-testing.js'
import {
	ANCHOR_CODES,
	CENTER_ONLY_CODES,
	freeAnchorFromPoint,
	nearestAnchorCode
} from './anchors.js'
import { isBindable, toShapeGeometry } from './resolve.js'
import type { ShapeGeometry } from './types.js'
import { shapeRotationCenter } from './types.js'

type Pt = [number, number]

/** Snap radius in SCREEN pixels, matching FixedPivotHandle's own snap distance */
export const SNAP_SCREEN_PIXELS = 15

/** Below this screen size the 9 dots start overlapping, so we show only two */
const ALL_ANCHORS_MIN_SCREEN = 72

export interface BindTarget {
	objectId: ObjectId
	anchor: AnchorPoint
}

/**
 * Is a world point inside a shape's actual outline (not just its box)?
 *
 * `tolerance` (world units) also accepts a point that far OUTSIDE the outline. A triangle's
 * corners are the reason it exists: almost the whole neighbourhood of an apex is outside the
 * outline, so a strict test refuses to bind exactly where the user is aiming.
 */
export function pointInShape(shape: ShapeGeometry, world: Pt, tolerance = 0): boolean {
	const local = shape.rotation
		? rotatePoint(world, shapeRotationCenter(shape), -shape.rotation)
		: world
	const b = shape.bounds

	if (shape.type === 'ellipse') {
		const cx = b.x + b.width / 2
		const cy = b.y + b.height / 2
		if (pointInEllipse(local, cx, cy, b.width / 2, b.height / 2)) return true
		return (
			tolerance > 0 &&
			distanceToEllipseEdge(local, cx, cy, b.width / 2, b.height / 2) <= tolerance
		)
	}
	if (shape.type === 'polygon' && shape.vertices?.length) {
		// The vertices are ALREADY local - stored unrotated like the bounds, with the rotation
		// applied by the renderer on top. `local` is the only thing that needs un-rotating.
		const verts = shape.vertices
		if (pointInPolygon(local, verts)) return true
		return tolerance > 0 && distanceToPolygonEdge(local, verts) <= tolerance
	}
	return (
		local[0] >= b.x - tolerance &&
		local[0] <= b.x + b.width + tolerance &&
		local[1] >= b.y - tolerance &&
		local[1] <= b.y + b.height + tolerance
	)
}

/**
 * How wide the anchor capture radius should be, in world units.
 *
 * Clamped by the spacing between adjacent dots so two capture zones never overlap - which is
 * what turns picking an anchor into a coin flip. That happens on desktop when zoomed out just as
 * it does on a phone, so the clamp is not a mobile special case.
 */
export function anchorSnapRadiusWorld(shape: ShapeGeometry, scale: number): number {
	const spacingScreen = (Math.min(shape.bounds.width, shape.bounds.height) / 2) * scale
	const screen = Math.min(SNAP_SCREEN_PIXELS, spacingScreen / 2.5)
	return Math.max(screen, 2) / scale
}

/**
 * Whether there is room to offer all 9 anchors, or only centre + auto.
 * Purely a function of the target's size on screen, so it degrades identically on every device.
 */
export function shouldShowAllAnchors(shape: ShapeGeometry, scale: number): boolean {
	return (
		shape.bounds.width * scale >= ALL_ANCHORS_MIN_SCREEN &&
		shape.bounds.height * scale >= ALL_ANCHORS_MIN_SCREEN
	)
}

export interface BindLookupOptions {
	/** Current canvas scale, for screen-space snap and dot-density decisions */
	scale: number
	/** Alt held: place a free anchor, no snapping */
	precise?: boolean
	/**
	 * Shape to refuse. Used to suppress the source shape while drawing: a self-loop needs
	 * waypoints and is out of scope, so we never offer the invitation rather than lighting up
	 * the target and then quietly handing back a free endpoint on drop.
	 */
	excludeId?: ObjectId
}

/**
 * The topmost bindable shape under a world point, if any.
 *
 * `objects` must be in z-order (backmost first), as getAllObjects returns them.
 * LOCKED SHAPES ARE VALID TARGETS - locking prevents moving, not being pointed at, and
 * connecting to a locked background frame is a perfectly normal thing to want.
 *
 * This runs on EVERY pointermove, unthrottled and deliberately so - hover feedback that lags the
 * cursor reads as a broken app, and the invitation to bind has to appear the moment the pointer is
 * over a shape. Do not add a throttle here; keep the per-call work cheap instead. The two passes
 * below re-derive geometry rather than caching it between them, which is affordable because
 * toShapeGeometry's expensive case - a freehand's bounds - is memoised in utils/hit-testing.ts.
 * Without that memo this would be the hottest thing on the board.
 */
export function findBindTargetShape(
	objects: IdealloObject[],
	world: Pt,
	options: BindLookupOptions
): ShapeGeometry | null {
	function eligible(obj: IdealloObject): boolean {
		if (!isBindable(obj)) return false
		return !(options.excludeId && obj.id === options.excludeId)
	}

	// Topmost first, so the strict hit is the one the user sees on top
	for (let i = objects.length - 1; i >= 0; i--) {
		const obj = objects[i]
		if (!eligible(obj)) continue
		const shape = toShapeGeometry(obj)
		if (pointInShape(shape, world)) return shape
	}

	// Only once nothing is strictly hit do the near-misses count - a triangle's corner has to be
	// reachable, but not at the price of a shape above it stealing a point that lies squarely
	// inside a shape below. That is why this is a second pass and not a wider first one.
	//
	// A second loop rather than a `candidates` array built by the first: the pointer is over empty
	// canvas for most of a session, and collecting every miss meant allocating and filling an array
	// the length of the board on every single pointermove, only to walk it again. This pass runs
	// only when the first one found nothing.
	const tolerance = bindToleranceWorld(options.scale)
	for (let i = objects.length - 1; i >= 0; i--) {
		const obj = objects[i]
		if (!eligible(obj)) continue
		const shape = toShapeGeometry(obj)
		if (pointInShape(shape, world, tolerance)) return shape
	}
	return null
}

/** How far outside an outline still counts as pointing at it, in world units */
function bindToleranceWorld(scale: number): number {
	return SNAP_SCREEN_PIXELS / 2 / (scale || 1)
}

/** Apply the anchor rule to a point already known to be over `shape` */
export function anchorForPoint(
	shape: ShapeGeometry,
	world: Pt,
	options: BindLookupOptions
): AnchorPoint {
	if (options.precise) return freeAnchorFromPoint(shape, world)
	// Only offer what the user can SEE. ConnectorAnchorDots draws the reduced set below
	// ALL_ANCHORS_MIN_SCREEN; snapping to a corner with no dot on it is an affordance the user was
	// never given.
	const codes = shouldShowAllAnchors(shape, options.scale) ? ANCHOR_CODES : CENTER_ONLY_CODES
	const snapped = nearestAnchorCode(
		shape,
		world,
		anchorSnapRadiusWorld(shape, options.scale),
		codes
	)
	return snapped ?? freeAnchorFromPoint(shape, world)
}

/** Find a target and resolve its anchor in one step */
export function resolveBindTarget(
	objects: IdealloObject[],
	world: Pt,
	options: BindLookupOptions
): BindTarget | null {
	const shape = findBindTargetShape(objects, world, options)
	if (!shape) return null
	return { objectId: shape.id, anchor: anchorForPoint(shape, world, options) }
}

// vim: ts=4

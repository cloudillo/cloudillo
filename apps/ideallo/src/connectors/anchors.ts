// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Anchor points: where a connector terminal attaches to a shape.
 *
 * The 9 named codes are the corners, the edge midpoints and the centre, expressed as normalized
 * positions in the shape's own box. A tenth code, 'auto', means "let the router pick the side",
 * and a free anchor is any normalized [x, y].
 *
 * Everything is computed in the shape's LOCAL (unrotated) frame and rotated back around the
 * shape's rotation centre, so an anchor stays welded to the same corner of a rotated shape.
 */

import type { AnchorPoint, AnchorPointType, Dir } from '../crdt/index.js'
import { clamp, rotatePoint } from '../utils/geometry.js'
import type { ShapeGeometry } from './types.js'
import { shapeBoundsCenter, shapeRotationCenter } from './types.js'

/** Normalized 0..1 position of each named anchor within the shape's box */
export const ANCHOR_NORMALIZED: Record<Exclude<AnchorPointType, 'auto'>, [number, number]> = {
	'top-left': [0, 0],
	top: [0.5, 0],
	'top-right': [1, 0],
	right: [1, 0.5],
	'bottom-right': [1, 1],
	bottom: [0.5, 1],
	'bottom-left': [0, 1],
	left: [0, 0.5],
	center: [0.5, 0.5]
}

/** The 9 named anchors, in the order the UI presents them */
export const ANCHOR_CODES: Exclude<AnchorPointType, 'auto'>[] = [
	'top-left',
	'top',
	'top-right',
	'right',
	'bottom-right',
	'bottom',
	'bottom-left',
	'left',
	'center'
]

/** The reduced set offered when the target is too small to show all nine dots */
export const CENTER_ONLY_CODES: Exclude<AnchorPointType, 'auto'>[] = ['center']

/** The side each named anchor sits on, used to push a docked terminal outwards. */
const ANCHOR_SIDE: Record<Exclude<AnchorPointType, 'auto'>, Dir | null> = {
	'top-left': 'n',
	top: 'n',
	'top-right': 'n',
	right: 'e',
	'bottom-right': 's',
	bottom: 's',
	'bottom-left': 's',
	left: 'w',
	center: null
}

/**
 * Normalized 0..1 position of an anchor within the shape's box.
 * Returns null for 'auto', which has no fixed position by definition.
 */
export function anchorToLocal(a: AnchorPoint | undefined): [number, number] | null {
	if (!a || a === 'auto') return null
	if (typeof a === 'object') return [clamp(a.x, 0, 1), clamp(a.y, 0, 1)]
	return ANCHOR_NORMALIZED[a]
}

/**
 * World position of an anchor on a shape.
 * 'auto' resolves to the shape's centre - callers that care pick a side first.
 */
export function anchorWorldPoint(
	shape: ShapeGeometry,
	a: AnchorPoint | undefined
): [number, number] {
	const local = anchorToLocal(a)
	if (!local) return shapeBoundsCenter(shape)
	const { bounds } = shape
	const p: [number, number] = [
		bounds.x + bounds.width * local[0],
		bounds.y + bounds.height * local[1]
	]
	if (!shape.rotation) return p
	return rotatePoint(p, shapeRotationCenter(shape), shape.rotation)
}

/** Rotate a cardinal direction by the shape's rotation, snapping to the nearest cardinal. */
function rotateDir(dir: Dir, rotationDeg: number): Dir {
	const base: Record<Dir, number> = { n: 270, e: 0, s: 90, w: 180 }
	const angle = (((base[dir] + rotationDeg) % 360) + 360) % 360
	if (angle >= 315 || angle < 45) return 'e'
	if (angle < 135) return 's'
	if (angle < 225) return 'w'
	return 'n'
}

/**
 * The outward side an anchor attaches from, in world space.
 * Returns null for 'auto', for 'center', and for free anchors that are not near an edge -
 * those have no inherent side and the router must choose one.
 *
 * On a rotated shape the true outward normal is not cardinal, and rotateDir snaps it to the
 * nearest one. That is intended rather than a rounding error: only the elbow router asks, and an
 * orthogonal route has no non-cardinal dock direction to give it. Rotation correctness lives
 * downstream instead - shapeExitPoint puts the attachment on the real rotated outline, and
 * dockTerminal clears the dock out of the shape's padded AABB.
 */
export function anchorSideDir(shape: ShapeGeometry, a: AnchorPoint | undefined): Dir | null {
	let local: Dir | null
	if (!a || a === 'auto') {
		return null
	} else if (typeof a === 'object') {
		local = freePointSide(clamp(a.x, 0, 1), clamp(a.y, 0, 1))
	} else {
		local = ANCHOR_SIDE[a]
	}
	if (!local) return null
	return shape.rotation ? rotateDir(local, shape.rotation) : local
}

/**
 * Side of a free normalized point: whichever edge it is closest to, as long as it is actually
 * near one. A point floating in the middle of the shape gets no side.
 */
function freePointSide(nx: number, ny: number): Dir | null {
	const dists: [Dir, number][] = [
		['w', nx],
		['e', 1 - nx],
		['n', ny],
		['s', 1 - ny]
	]
	// A plain code-unit compare, not localeCompare: this decides an elbow dock direction, which
	// every peer derives independently, and localeCompare is locale-sensitive by contract.
	dists.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
	// > 0.25 from every edge means it is in the middle third and has no meaningful side
	return dists[0][1] <= 0.25 ? dists[0][0] : null
}

/**
 * The named anchor nearest to a world point, or null if none is within `thresholdWorld`.
 *
 * This is the pin-to-a-code half of the anchor rule; the caller falls through to a free anchor
 * when this returns null, so a drop that avoids every dot lands where it was aimed.
 *
 * `codes` narrows the candidate set to whatever the UI is currently offering - see anchorForPoint.
 */
export function nearestAnchorCode(
	shape: ShapeGeometry,
	world: [number, number],
	thresholdWorld: number,
	codes: readonly Exclude<AnchorPointType, 'auto'>[] = ANCHOR_CODES
): Exclude<AnchorPointType, 'auto'> | null {
	let best: Exclude<AnchorPointType, 'auto'> | null = null
	let bestDistSq = thresholdWorld * thresholdWorld
	for (const code of codes) {
		const p = anchorWorldPoint(shape, code)
		const dx = p[0] - world[0]
		const dy = p[1] - world[1]
		const distSq = dx * dx + dy * dy
		if (distSq <= bestDistSq) {
			bestDistSq = distSq
			best = code
		}
	}
	return best
}

/**
 * Convert a world point into a free normalized anchor on a shape.
 * The fall-through of the anchor rule, and what precise mode returns unconditionally.
 */
export function freeAnchorFromPoint(
	shape: ShapeGeometry,
	world: [number, number]
): { x: number; y: number } {
	const local = shape.rotation
		? rotatePoint(world, shapeRotationCenter(shape), -shape.rotation)
		: world
	const { bounds } = shape
	return {
		x: clamp(bounds.width ? (local[0] - bounds.x) / bounds.width : 0.5, 0, 1),
		y: clamp(bounds.height ? (local[1] - bounds.y) / bounds.height : 0.5, 0, 1)
	}
}

/** World positions of all 9 named anchors, for rendering the drop-target dots */
export function anchorHandlePoints(
	shape: ShapeGeometry
): { anchor: Exclude<AnchorPointType, 'auto'>; point: [number, number] }[] {
	return ANCHOR_CODES.map((anchor) => ({ anchor, point: anchorWorldPoint(shape, anchor) }))
}

// vim: ts=4

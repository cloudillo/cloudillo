// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Where the floating property bar goes for a given selection.
 *
 * Pure on purpose - this is the one part of the bar with real arithmetic in it. The bar renders
 * with `translateX(-50%)`, so clamping `left` against the viewport clamps the bar's CENTRE: a 900px
 * bar centred at x=200 puts its left edge at -250px. Clamping the EDGES needs the bar's measured
 * width, which is why the caller has to hand one in.
 */

import type { Bounds } from '../crdt/runtime-types.js'

/** Minimum distance from viewport edges */
export const VIEWPORT_PADDING = 16
/** Gap between selection and property bar */
export const SELECTION_GAP = 12
/**
 * Bottom strip the floating toolbar owns, so the bar is never placed on top of it.
 * Desktop: 16 offset + 8 padding * 2 + 44 button = 76, plus a gap.
 * Mobile:   8 offset + 6 padding * 2 + 44 button = 64, plus a gap.
 * The mobile threshold must stay in step with `useIsMobile()`'s `md` band (`@cloudillo/react`).
 */
export const DESKTOP_BOTTOM_RESERVED = 84
export const MOBILE_BOTTOM_RESERVED = 72
export const MOBILE_MAX_WIDTH = 767

export interface BarPositionInput {
	/** Screen-space bounds of the selection box */
	screenBounds: Bounds
	/** Rotation of the selection in degrees; decides whether the bar prefers above or below */
	rotation: number
	/** Measured bar width. 0 before the first measurement, which makes the clamp a no-op. */
	barWidth: number
	/** Measured bar height. Not a constant: the bar wraps to two rows on narrow viewports. */
	barHeight: number
	viewportWidth: number
	viewportHeight: number
}

export interface BarPosition {
	top: number
	left: number
}

export function computeBarPosition({
	screenBounds,
	rotation,
	barWidth,
	barHeight,
	viewportWidth,
	viewportHeight
}: BarPositionInput): BarPosition {
	const centerX = screenBounds.x + screenBounds.width / 2

	// Normalize rotation to -180..180
	let normalizedRotation = rotation % 360
	if (normalizedRotation > 180) normalizedRotation -= 360
	if (normalizedRotation < -180) normalizedRotation += 360

	// The rotation handle sits at the top of an unrotated selection, so keep the bar on the
	// opposite side of it: below while |rotation| < 90, above once the handle has swung under.
	const preferBelow = Math.abs(normalizedRotation) < 90

	const bottomReserved =
		viewportWidth <= MOBILE_MAX_WIDTH ? MOBILE_BOTTOM_RESERVED : DESKTOP_BOTTOM_RESERVED

	let top: number
	if (preferBelow) {
		top = screenBounds.y + screenBounds.height + SELECTION_GAP
		if (top + barHeight > viewportHeight - bottomReserved) {
			top = screenBounds.y - SELECTION_GAP - barHeight
		}
	} else {
		top = screenBounds.y - SELECTION_GAP - barHeight
		if (top < VIEWPORT_PADDING) {
			top = screenBounds.y + screenBounds.height + SELECTION_GAP
		}
	}

	top = Math.max(VIEWPORT_PADDING, Math.min(top, viewportHeight - bottomReserved - barHeight))

	// `left` is the bar's centre (translateX(-50%)), so the bounds are half a bar in from each edge
	const half = barWidth / 2
	const minLeft = half + VIEWPORT_PADDING
	const maxLeft = viewportWidth - half - VIEWPORT_PADDING
	// A bar wider than the viewport cannot satisfy both bounds - centre it and let it wrap
	const left =
		maxLeft < minLeft ? viewportWidth / 2 : Math.min(Math.max(centerX, minLeft), maxLeft)

	return { top, left }
}

// vim: ts=4

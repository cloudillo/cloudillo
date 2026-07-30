// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Where a popover goes once its anchor's placement is already decided.
 *
 * Pure on purpose, mirroring the split in `property-bar-position.ts`: the arithmetic is here and
 * the DOM measurement is in `hooks/useEdgeClamp.ts`.
 *
 * The one property everything else rests on is IDEMPOTENCE. The caller hands in the shift it has
 * already applied, this reduces the measurement back to its unshifted base, and the answer is
 * recomputed from there - never accumulated. Re-running it on an already-clamped popover therefore
 * returns the same numbers, which is what lets the hook re-measure on every render.
 */

import { VIEWPORT_PADDING } from './property-bar-position.js'

export interface EdgeClampInput {
	/** Viewport rect of the popover's positioning anchor (its offsetParent) */
	anchorRect: { top: number; bottom: number }
	/** Viewport rect of the popover as currently rendered, i.e. with `currentShift` applied */
	popoverRect: { left: number; right: number }
	/** Natural, unclamped content height (scrollHeight), so an applied max-height cannot feed back */
	contentHeight: number
	/** The shift already applied, so the measurement can be reduced to its unshifted base */
	currentShift: number
	viewportWidth: number
	viewportHeight: number
	/** Side of the anchor the CSS opens on by default */
	side: 'above' | 'below'
	/** May the popover move to the other side when the preferred one is tighter? */
	flip: boolean
	/** Gap between anchor and popover, matching the CSS margin */
	gap: number
}

export interface EdgeClampResult {
	shift: number
	placement: 'above' | 'below'
	/** null when the popover fits without scrolling */
	maxHeight: number | null
}

export function computeEdgeClamp({
	anchorRect,
	popoverRect,
	contentHeight,
	currentShift,
	viewportWidth,
	viewportHeight,
	side,
	flip,
	gap
}: EdgeClampInput): EdgeClampResult {
	const baseLeft = popoverRect.left - currentShift
	const baseRight = popoverRect.right - currentShift
	const width = baseRight - baseLeft

	let shift = 0
	if (width > viewportWidth - 2 * VIEWPORT_PADDING) {
		// Too wide to satisfy both edges - pin the left one, which is the one the user reads from
		shift = VIEWPORT_PADDING - baseLeft
	} else if (baseLeft < VIEWPORT_PADDING) {
		shift = VIEWPORT_PADDING - baseLeft
	} else if (baseRight > viewportWidth - VIEWPORT_PADDING) {
		shift = viewportWidth - VIEWPORT_PADDING - baseRight
	}

	const roomBelow = viewportHeight - VIEWPORT_PADDING - (anchorRect.bottom + gap)
	const roomAbove = anchorRect.top - gap - VIEWPORT_PADDING

	let placement = side
	if (flip) {
		const preferred = side === 'below' ? roomBelow : roomAbove
		const other = side === 'below' ? roomAbove : roomBelow
		if (contentHeight > preferred && other > preferred)
			placement = side === 'below' ? 'above' : 'below'
	}

	const room = placement === 'below' ? roomBelow : roomAbove
	const maxHeight = contentHeight > room ? Math.max(0, room) : null

	return { shift, placement, maxHeight }
}

// vim: ts=4

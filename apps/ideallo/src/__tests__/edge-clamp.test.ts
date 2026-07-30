// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { EdgeClampInput } from '../utils/edge-clamp.js'
import { computeEdgeClamp } from '../utils/edge-clamp.js'
import { VIEWPORT_PADDING } from '../utils/property-bar-position.js'

const DESKTOP = { viewportWidth: 1280, viewportHeight: 800 }
const PHONE = { viewportWidth: 360, viewportHeight: 740 }

const GAP = 8

function input(over: Partial<EdgeClampInput> = {}): EdgeClampInput {
	return {
		anchorRect: { top: 300, bottom: 340 },
		popoverRect: { left: 500, right: 800 },
		contentHeight: 200,
		currentShift: 0,
		side: 'below',
		flip: false,
		gap: GAP,
		...DESKTOP,
		...over
	}
}

describe('computeEdgeClamp - horizontal clamp', () => {
	it('leaves a popover that is already inside the viewport alone', () => {
		expect(computeEdgeClamp(input()).shift).toBe(0)
	})

	it('shifts a popover overhanging the right edge back inside', () => {
		const popoverRect = { left: 1050, right: 1350 }
		const { shift } = computeEdgeClamp(input({ popoverRect }))
		expect(popoverRect.right + shift).toBe(DESKTOP.viewportWidth - VIEWPORT_PADDING)
	})

	it('shifts a popover overhanging the left edge back inside', () => {
		const popoverRect = { left: -40, right: 260 }
		const { shift } = computeEdgeClamp(input({ popoverRect }))
		expect(popoverRect.left + shift).toBe(VIEWPORT_PADDING)
	})

	// Feeding a clamped result back in has to be a fixed point, or the array-less layout effect in
	// the hook loops.
	it('is idempotent - re-clamping an already-clamped popover changes nothing', () => {
		const popoverRect = { left: 1050, right: 1350 }
		const first = computeEdgeClamp(input({ popoverRect }))
		const second = computeEdgeClamp(
			input({
				popoverRect: {
					left: popoverRect.left + first.shift,
					right: popoverRect.right + first.shift
				},
				currentShift: first.shift
			})
		)
		expect(second.shift).toBe(first.shift)
	})

	it('pins the left edge of a popover wider than the viewport', () => {
		const popoverRect = { left: 30, right: 530 }
		const { shift } = computeEdgeClamp(input({ ...PHONE, popoverRect }))
		expect(popoverRect.left + shift).toBe(VIEWPORT_PADDING)
	})
})

describe('computeEdgeClamp - placement', () => {
	// The bar gets pinned above the toolbar strip for a low selection, leaving no room below it
	const lowAnchor = { top: 640, bottom: 690 }

	it('flips above when the preferred side cannot hold the content and the other can', () => {
		const { placement } = computeEdgeClamp(
			input({ anchorRect: lowAnchor, contentHeight: 300, side: 'below', flip: true })
		)
		expect(placement).toBe('above')
	})

	it('stays on the preferred side when it fits', () => {
		const { placement } = computeEdgeClamp(
			input({ anchorRect: { top: 100, bottom: 150 }, contentHeight: 300, flip: true })
		)
		expect(placement).toBe('below')
	})

	it('never moves and clamps the height instead when flipping is off', () => {
		const { placement, maxHeight } = computeEdgeClamp(
			input({ anchorRect: lowAnchor, contentHeight: 300, side: 'below', flip: false })
		)
		expect(placement).toBe('below')
		expect(maxHeight).toBe(DESKTOP.viewportHeight - VIEWPORT_PADDING - (lowAnchor.bottom + GAP))
	})
})

describe('computeEdgeClamp - height clamp', () => {
	it('leaves content that fits unclamped', () => {
		expect(computeEdgeClamp(input({ contentHeight: 200 })).maxHeight).toBeNull()
	})

	it('clamps content taller than the room to exactly that room', () => {
		const anchorRect = { top: 300, bottom: 340 }
		const room = DESKTOP.viewportHeight - VIEWPORT_PADDING - (anchorRect.bottom + GAP)
		const { maxHeight } = computeEdgeClamp(input({ anchorRect, contentHeight: room + 100 }))
		expect(maxHeight).toBe(room)
	})

	it('clamps against the room above once flipped', () => {
		const anchorRect = { top: 300, bottom: 690 }
		const roomAbove = anchorRect.top - GAP - VIEWPORT_PADDING
		const { placement, maxHeight } = computeEdgeClamp(
			input({ anchorRect, contentHeight: 600, side: 'below', flip: true })
		)
		expect(placement).toBe('above')
		expect(maxHeight).toBe(roomAbove)
	})

	it('never reports a negative height for an anchor already off screen', () => {
		const { maxHeight } = computeEdgeClamp(
			input({ anchorRect: { top: 900, bottom: 950 }, contentHeight: 200 })
		)
		expect(maxHeight).toBe(0)
	})
})

// vim: ts=4

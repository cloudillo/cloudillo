// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Bounds } from '../crdt/runtime-types.js'
import type { BarPositionInput } from '../utils/property-bar-position.js'
import {
	computeBarPosition,
	DESKTOP_BOTTOM_RESERVED,
	MOBILE_BOTTOM_RESERVED,
	SELECTION_GAP,
	VIEWPORT_PADDING
} from '../utils/property-bar-position.js'

const DESKTOP = { viewportWidth: 1280, viewportHeight: 800 }
const PHONE = { viewportWidth: 360, viewportHeight: 740 }

function bounds(over: Partial<Bounds> = {}): Bounds {
	return { x: 500, y: 300, width: 100, height: 80, ...over }
}

function input(over: Partial<BarPositionInput> = {}): BarPositionInput {
	return {
		screenBounds: bounds(),
		rotation: 0,
		barWidth: 300,
		barHeight: 48,
		...DESKTOP,
		...over
	}
}

describe('computeBarPosition - horizontal clamp', () => {
	// `left` is the bar's CENTRE - the element renders with translateX(-50%) - so the clamp has to
	// be against the edges, not against `left` itself.
	it('keeps a wide bar fully inside the left edge', () => {
		const barWidth = 900
		const { left } = computeBarPosition(
			input({ barWidth, screenBounds: bounds({ x: 10, width: 40 }) })
		)
		expect(left - barWidth / 2).toBeGreaterThanOrEqual(VIEWPORT_PADDING)
	})

	it('keeps a wide bar fully inside the right edge', () => {
		const barWidth = 900
		const { left } = computeBarPosition(
			input({ barWidth, screenBounds: bounds({ x: 1230, width: 40 }) })
		)
		expect(left + barWidth / 2).toBeLessThanOrEqual(DESKTOP.viewportWidth - VIEWPORT_PADDING)
	})

	it('leaves a comfortably-placed bar centred on the selection', () => {
		const { left } = computeBarPosition(input({ screenBounds: bounds({ x: 500, width: 100 }) }))
		expect(left).toBe(550)
	})

	it('centres a bar wider than the viewport rather than satisfying an impossible clamp', () => {
		const { left } = computeBarPosition(
			input({ ...PHONE, barWidth: 500, screenBounds: bounds({ x: 10, width: 40 }) })
		)
		expect(left).toBe(PHONE.viewportWidth / 2)
	})

	it('does not clamp before the bar has been measured', () => {
		// width 0 on the first frame - the caller hides the bar until `measured`
		const { left } = computeBarPosition(
			input({ barWidth: 0, screenBounds: bounds({ x: 500, width: 100 }) })
		)
		expect(left).toBe(550)
	})
})

describe('computeBarPosition - vertical placement', () => {
	it('places the bar below an unrotated selection', () => {
		const sel = bounds({ y: 300, height: 80 })
		const { top } = computeBarPosition(input({ screenBounds: sel, rotation: 0 }))
		expect(top).toBe(sel.y + sel.height + SELECTION_GAP)
	})

	it('places the bar above a selection rotated past 90 degrees', () => {
		const sel = bounds({ y: 300, height: 80 })
		const { top } = computeBarPosition(input({ screenBounds: sel, rotation: 135 }))
		expect(top).toBe(sel.y - SELECTION_GAP - 48)
	})

	it('normalises rotation past 180 before deciding', () => {
		const sel = bounds({ y: 300, height: 80 })
		// 350 normalises to -10, which is still "handle at the top" - so below
		const { top } = computeBarPosition(input({ screenBounds: sel, rotation: 350 }))
		expect(top).toBe(sel.y + sel.height + SELECTION_GAP)
	})

	it('flips above when there is no room below', () => {
		const sel = bounds({ y: 700, height: 80 })
		const { top } = computeBarPosition(input({ screenBounds: sel, rotation: 0 }))
		expect(top).toBe(sel.y - SELECTION_GAP - 48)
	})

	it('flips below when there is no room above', () => {
		const sel = bounds({ y: 10, height: 40 })
		const { top } = computeBarPosition(input({ screenBounds: sel, rotation: 135 }))
		expect(top).toBe(sel.y + sel.height + SELECTION_GAP)
	})

	it('respects the measured height rather than a 48px assumption', () => {
		// Both are pinned by the bottom clamp, so a wrapped bar has to sit a row higher
		const sel = bounds({ y: 780, height: 80 })
		const short = computeBarPosition(input({ screenBounds: sel, barHeight: 48 }))
		const wrapped = computeBarPosition(input({ screenBounds: sel, barHeight: 96 }))
		expect(short.top - wrapped.top).toBe(48)
	})
})

describe('computeBarPosition - mobile dock reservation', () => {
	it('never overlaps the bottom strip the mobile toolbar owns', () => {
		const barHeight = 96
		const { top } = computeBarPosition(
			input({ ...PHONE, barHeight, screenBounds: bounds({ y: 700, height: 40 }) })
		)
		expect(top + barHeight).toBeLessThanOrEqual(PHONE.viewportHeight - MOBILE_BOTTOM_RESERVED)
	})

	it('reserves the toolbar strip on a desktop-width viewport', () => {
		// A selection taller than the viewport with no room above: the below-fallback overshoots
		// and the bottom clamp is what catches it, so this pins the reservation exactly
		const barHeight = 48
		const { top } = computeBarPosition(
			input({ barHeight, rotation: 135, screenBounds: bounds({ y: 20, height: 800 }) })
		)
		expect(top + barHeight).toBe(DESKTOP.viewportHeight - DESKTOP_BOTTOM_RESERVED)
	})

	// The desktop toolbar floats at the bottom too, so a selection low on the canvas must not put
	// the bar straight onto it
	it('never overlaps the toolbar strip on a desktop viewport', () => {
		const barHeight = 48
		const { top } = computeBarPosition(
			input({ barHeight, screenBounds: bounds({ y: 690, height: 60 }) })
		)
		expect(top + barHeight).toBeLessThanOrEqual(
			DESKTOP.viewportHeight - DESKTOP_BOTTOM_RESERVED
		)
	})

	it('never places the bar above the top padding', () => {
		const { top } = computeBarPosition(
			input({ screenBounds: bounds({ y: 0, height: 4 }), rotation: 180 })
		)
		expect(top).toBeGreaterThanOrEqual(VIEWPORT_PADDING)
	})
})

// vim: ts=4

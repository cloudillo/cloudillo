// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Awareness is peer-controlled and never runtime-validated. GhostShapes is the one place remote
 * geometry reaches the routers and the arrowhead math, so its guard is the whole defence.
 */

import { isRenderableShape } from '../components/GhostShapes.js'
import type { ShapePreview } from '../tools/types.js'

function preview(over: Partial<ShapePreview> = {}): ShapePreview {
	return {
		type: 'connector',
		startX: 0,
		startY: 0,
		endX: 100,
		endY: 100,
		style: { strokeColor: '#000000', fillColor: 'transparent', strokeWidth: 2 },
		...over
	}
}

describe('isRenderableShape', () => {
	it('accepts an ordinary preview', () => {
		expect(isRenderableShape(preview())).toBe(true)
	})

	// The guard checks geometry only, never `type`, so a new preview type needs no validation
	// change. Keep it that way.
	it('validates every preview type by its geometry alone', () => {
		for (const type of ['rect', 'ellipse', 'diamond', 'triangle', 'connector'] as const) {
			expect(isRenderableShape(preview({ type }))).toBe(true)
			expect(isRenderableShape(preview({ type, endX: Number.NaN }))).toBe(false)
		}
	})

	it('rejects a non-finite endpoint', () => {
		expect(isRenderableShape(preview({ endX: Number.NaN }))).toBe(false)
		expect(isRenderableShape(preview({ startY: Number.POSITIVE_INFINITY }))).toBe(false)
	})

	it('rejects a non-finite free anchor', () => {
		expect(isRenderableShape(preview({ startAnchor: { x: Number.NaN, y: 0.5 } }))).toBe(false)
		expect(isRenderableShape(preview({ endAnchor: { x: 0.5, y: 0.5 } }))).toBe(true)
	})

	it('rejects a non-finite stroke width', () => {
		const bad = preview()
		bad.style.strokeWidth = Number.NaN
		expect(isRenderableShape(bad)).toBe(false)
	})

	// size feeds arrowheadBaseLength: NaN emits NaN into the path `d`, and an absurd multiplier
	// emits a head the size of the canvas
	it('rejects an arrowhead size that is not a sane multiplier', () => {
		expect(
			isRenderableShape(preview({ startArrow: { type: 'arrow', size: Number.NaN } }))
		).toBe(false)
		expect(isRenderableShape(preview({ endArrow: { type: 'triangle', size: 0 } }))).toBe(false)
		expect(isRenderableShape(preview({ endArrow: { type: 'triangle', size: -2 } }))).toBe(false)
		expect(isRenderableShape(preview({ endArrow: { type: 'triangle', size: 1e6 } }))).toBe(
			false
		)
	})

	// The PropertyBar's size control spans 50-300%, so anything a real peer sends lands well
	// inside the ceiling
	it('accepts the range the size control can produce, and an omitted size', () => {
		for (const size of [0.5, 1, 3]) {
			expect(isRenderableShape(preview({ endArrow: { type: 'triangle', size } }))).toBe(true)
		}
		expect(isRenderableShape(preview({ endArrow: { type: 'arrow' } }))).toBe(true)
		expect(isRenderableShape(preview({ startArrow: undefined }))).toBe(true)
	})
})

// vim: ts=4

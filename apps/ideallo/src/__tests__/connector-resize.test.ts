// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Resize maps a connector's terminals through ONE function, shared by the preview
 * (applyBoundsOverride in Canvas.tsx) and the commit (onResizeEnd in app.tsx). The two used to
 * carry separate copies of the maths over different source boxes - the preview off the tight
 * endpoint bbox, the commit off the padded `route.bounds` - so an arrow visibly snapped on
 * pointer-up. These tests pin the mapper against the commit's original arithmetic.
 */

import { routeBounds } from '../connectors/routing/common.js'
import type { Bounds } from '../crdt/index.js'
import type { ConnectorTerminals } from '../utils/geometry.js'
import { scaleConnectorTerminals } from '../utils/geometry.js'

function connector(over: Partial<ConnectorTerminals> = {}): ConnectorTerminals {
	return { x: 0, y: 0, startX: 0, startY: 0, endX: 100, endY: 0, ...over }
}

/**
 * The commit's arithmetic as it stood before the mapper was factored out (app.tsx onResizeEnd).
 * Written out longhand on purpose: if the mapper ever drifts from it, the preview snaps again.
 */
function commitReference(obj: ConnectorTerminals, from: Bounds, to: Bounds) {
	const scaleX = to.width / from.width
	const scaleY = to.height / from.height
	const dx = to.x - from.x
	const dy = to.y - from.y
	return {
		x: from.x + dx + (obj.x - from.x) * scaleX,
		y: from.y + dy + (obj.y - from.y) * scaleY,
		startX: from.x + dx + (obj.startX - from.x) * scaleX,
		startY: from.y + dy + (obj.startY - from.y) * scaleY,
		endX: from.x + dx + (obj.endX - from.x) * scaleX,
		endY: from.y + dy + (obj.endY - from.y) * scaleY
	}
}

describe('scaleConnectorTerminals', () => {
	it('reproduces the commit arithmetic for a free connector', () => {
		const obj = connector({ endY: 40 })
		const from: Bounds = { x: 0, y: 0, width: 100, height: 40 }
		const to: Bounds = { x: 10, y: 20, width: 200, height: 120 }
		expect(scaleConnectorTerminals(obj, from, to)).toEqual(commitReference(obj, from, to))
	})

	it('scales out of the PADDED route bounds, not the tight endpoint box', () => {
		// (0,0)->(100,0), strokeWidth 2, a 300% filled arrowhead: routeBounds pads all four sides,
		// so the box the SelectionBox is drawn from is wider AND taller than the endpoint bbox.
		const obj = connector()
		const from = routeBounds(
			[
				[0, 0],
				[100, 0]
			],
			{
				start: [0, 0],
				end: [100, 0],
				startArrow: { type: 'none' },
				endArrow: { type: 'triangle', size: 3, filled: true },
				strokeWidth: 2,
				routing: 'straight'
			}
		)
		expect(from.width).toBeGreaterThan(100)
		expect(from.height).toBeGreaterThan(0)

		// Double the box, the way dragging the right handle does.
		const to: Bounds = { ...from, width: from.width * 2 }
		const patch = scaleConnectorTerminals(obj, from, to)
		expect(patch).toEqual(commitReference(obj, from, to))

		// The old preview derived its factors from the tight bbox (width 100) instead, which for
		// this box lands the endpoints somewhere else entirely - that mismatch WAS the snap.
		const tightScale = to.width / 100
		expect(patch?.endX).not.toBeCloseTo(from.x + (to.x - from.x) + 100 * tightScale, 3)
	})

	it('leaves a bound terminal out of the patch entirely', () => {
		const obj = connector({ startObjectId: 'box1' })
		const from: Bounds = { x: 0, y: 0, width: 100, height: 10 }
		const to: Bounds = { x: 0, y: 0, width: 200, height: 20 }
		const patch = scaleConnectorTerminals(obj, from, to)
		expect(patch).not.toBeNull()
		expect(patch).not.toHaveProperty('startX')
		expect(patch).not.toHaveProperty('startY')
		expect(patch?.endX).toBe(commitReference(obj, from, to).endX)
		expect(patch?.endY).toBe(commitReference(obj, from, to).endY)
	})

	it('returns null for a fully bound connector - nothing may move', () => {
		const obj = connector({ startObjectId: 'box1', endObjectId: 'box2' })
		expect(
			scaleConnectorTerminals(
				obj,
				{ x: 0, y: 0, width: 100, height: 10 },
				{ x: 50, y: 50, width: 400, height: 40 }
			)
		).toBeNull()
	})

	it('holds a zero-extent axis still rather than producing NaN', () => {
		const obj = connector({ endY: 0 })
		const patch = scaleConnectorTerminals(
			obj,
			{ x: 0, y: 0, width: 0, height: 0 },
			{ x: 5, y: 7, width: 100, height: 50 }
		)
		expect(patch).not.toBeNull()
		for (const v of Object.values(patch as object)) {
			expect(Number.isFinite(v)).toBe(true)
		}
		// scale falls back to 1, so the terminals only translate
		expect(patch?.startX).toBe(5)
		expect(patch?.startY).toBe(7)
		expect(patch?.endX).toBe(105)
	})
})

// vim: ts=4

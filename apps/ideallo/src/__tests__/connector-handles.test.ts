// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { clearRouteCache } from '../connectors/cache.js'
import { connectorHandlePoints } from '../connectors/handles.js'
import { buildConnectorContext, resolveArrow } from '../connectors/resolve.js'
import type { ConnectorContext } from '../connectors/types.js'
import { toObjectId } from '../crdt/ids.js'
import type { AnchorPoint, ConnectorObject, RectObject } from '../crdt/runtime-types.js'
import { DEFAULT_STYLE } from '../crdt/runtime-types.js'

type Pt = [number, number]

function rect(id: string, x: number, y: number, w = 100, h = 100): RectObject {
	return {
		id: toObjectId(id),
		type: 'rect',
		x,
		y,
		width: w,
		height: h,
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		locked: false,
		style: { ...DEFAULT_STYLE }
	}
}

function arrow(over: Partial<ConnectorObject> = {}): ConnectorObject {
	return {
		id: toObjectId('arr'),
		type: 'connector',
		x: 0,
		y: 0,
		startX: 0,
		startY: 0,
		endX: 10,
		endY: 10,
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		locked: false,
		routing: 'straight',
		startArrow: { type: 'none' },
		endArrow: { type: 'arrow' },
		style: { ...DEFAULT_STYLE },
		...over
	}
}

const A = rect('a', 0, 0) // centre [50, 50]
const B = rect('b', 300, 0) // centre [350, 50]

function closeTo(actual: Pt | null, expected: Pt, precision = 6) {
	expect(actual).not.toBeNull()
	expect((actual as Pt)[0]).toBeCloseTo(expected[0], precision)
	expect((actual as Pt)[1]).toBeCloseTo(expected[1], precision)
}

/** Resolve a connector the way Canvas does, then ask where its handles go */
function handlesFor(a: ConnectorObject, objects = [A, B, a]) {
	const ctx = buildConnectorContext(objects)
	const resolved = resolveArrow(a, ctx)
	return { resolved, points: connectorHandlePoints(resolved, ctx) }
}

beforeEach(() => {
	clearRouteCache()
})

describe('connectorHandlePoints on a bound terminal', () => {
	it.each<[string, AnchorPoint | undefined]>([
		['auto', undefined],
		['explicit auto', 'auto'],
		['center', 'center']
	])('puts the handle on the shape centre for %s', (_label, anchor) => {
		const { resolved, points } = handlesFor(
			arrow({ startObjectId: A.id, startAnchor: anchor, endX: 350, endY: 50 })
		)
		closeTo(points.start.handle, [50, 50])
		// The attachment is where the resolver left the endpoint: out on the outline
		closeTo(points.start.attach, [resolved.startX, resolved.startY])
		expect(resolved.startX).toBeGreaterThan(100)
	})

	it('puts the handle on the right-edge midpoint for a pinned right anchor', () => {
		const { resolved, points } = handlesFor(
			arrow({ startObjectId: A.id, startAnchor: 'right', endX: 350, endY: 50 })
		)
		closeTo(points.start.handle, [100, 50])
		closeTo(points.start.attach, [resolved.startX, resolved.startY])
	})

	it('resolves both terminals when both are bound', () => {
		const { points } = handlesFor(arrow({ startObjectId: A.id, endObjectId: B.id }))
		closeTo(points.start.handle, [50, 50])
		closeTo(points.end.handle, [350, 50])
		expect(points.start.attach).not.toBeNull()
		expect(points.end.attach).not.toBeNull()
	})
})

describe('connectorHandlePoints on a free terminal', () => {
	it('keeps the handle on the endpoint with no leader', () => {
		const { points } = handlesFor(arrow({ startX: 20, startY: 30, endX: 40, endY: 60 }))
		closeTo(points.start.handle, [20, 30])
		expect(points.start.attach).toBeNull()
		closeTo(points.end.handle, [40, 60])
		expect(points.end.attach).toBeNull()
	})

	it('falls back to the endpoint for a dangling reference', () => {
		// The missing shape is what the resolver itself falls back on, so the handle must agree
		const a = arrow({ startObjectId: toObjectId('gone'), startX: 20, startY: 30 })
		const ctx: ConnectorContext = { get: () => undefined }
		const points = connectorHandlePoints(a, ctx)
		closeTo(points.start.handle, [20, 30])
		expect(points.start.attach).toBeNull()
	})
})

describe('connectorHandlePoints degenerate cases', () => {
	it('drops the leader when the attachment coincides with the anchor', () => {
		// Endpoint left exactly on the centre: nothing to span, so no leader
		const a = arrow({ startObjectId: A.id, startAnchor: 'center', startX: 50, startY: 50 })
		const ctx = buildConnectorContext([A, a])
		const points = connectorHandlePoints(a, ctx)
		closeTo(points.start.handle, [50, 50])
		expect(points.start.attach).toBeNull()
	})

	it('falls back to the endpoints when both terminals share one centre anchor', () => {
		// Both handles would land on the same pixel and `end`, drawn last, would win every hit.
		// The resolver collapses a self-loop to that same point as well, so this only checks that
		// the overlay declines to invent the stacking - it cannot undo it.
		const a = arrow({
			startObjectId: A.id,
			startAnchor: 'center',
			endObjectId: A.id,
			endAnchor: 'center'
		})
		const { resolved, points } = handlesFor(a, [A, a])
		closeTo(points.start.handle, [resolved.startX, resolved.startY])
		closeTo(points.end.handle, [resolved.endX, resolved.endY])
		expect(points.start.attach).toBeNull()
		expect(points.end.attach).toBeNull()
	})

	it('keeps distinct handles when the two ends are on different shapes', () => {
		const { points } = handlesFor(
			arrow({
				startObjectId: A.id,
				startAnchor: 'center',
				endObjectId: B.id,
				endAnchor: 'center'
			})
		)
		closeTo(points.start.handle, [50, 50])
		closeTo(points.end.handle, [350, 50])
	})
})

// vim: ts=4

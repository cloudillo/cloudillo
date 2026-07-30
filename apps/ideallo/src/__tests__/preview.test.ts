// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { clearRouteCache } from '../connectors/cache.js'
import type { ConnectorEndpointPreview } from '../connectors/preview.js'
import { applyEndpointPreview } from '../connectors/preview.js'
import {
	buildConnectorContext,
	resolveConnectorRoutes,
	resolvePreviewRoute
} from '../connectors/resolve.js'
import { toObjectId } from '../crdt/ids.js'
import type { ConnectorObject, RectObject } from '../crdt/runtime-types.js'
import { DEFAULT_STYLE } from '../crdt/runtime-types.js'

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

const A = rect('a', 0, 0)
const B = rect('b', 300, 0)

function preview(over: Partial<ConnectorEndpointPreview> = {}): ConnectorEndpointPreview {
	return {
		arrowId: toObjectId('arr'),
		terminal: 'end',
		point: [500, 500],
		bind: null,
		...over
	}
}

beforeEach(() => {
	clearRouteCache()
})

describe('applyEndpointPreview', () => {
	it('binds a terminal to a shape and anchor', () => {
		const out = applyEndpointPreview(
			arrow(),
			preview({ bind: { objectId: B.id, anchor: 'left' } })
		) as ConnectorObject
		expect(out.endObjectId).toBe(B.id)
		expect(out.endAnchor).toBe('left')
		expect([out.endX, out.endY]).toEqual([500, 500])
	})

	it('unbinds a terminal and freezes it at the drop point', () => {
		const bound = arrow({ endObjectId: B.id, endAnchor: 'left' })
		const out = applyEndpointPreview(bound, preview({ bind: null })) as ConnectorObject
		expect(out.endObjectId).toBeUndefined()
		expect(out.endAnchor).toBeUndefined()
		expect([out.endX, out.endY]).toEqual([500, 500])
	})

	it('never touches the other terminal', () => {
		const bound = arrow({ startObjectId: A.id, startAnchor: 'right', startX: 3, startY: 4 })
		const out = applyEndpointPreview(bound, preview()) as ConnectorObject
		expect(out.startObjectId).toBe(A.id)
		expect(out.startAnchor).toBe('right')
		expect([out.startX, out.startY]).toEqual([3, 4])
	})

	it('drags the start terminal symmetrically', () => {
		const out = applyEndpointPreview(
			arrow({ endObjectId: B.id }),
			preview({
				terminal: 'start',
				point: [-20, -30],
				bind: { objectId: A.id, anchor: 'top' }
			})
		) as ConnectorObject
		expect(out.startObjectId).toBe(A.id)
		expect(out.startAnchor).toBe('top')
		expect([out.startX, out.startY]).toEqual([-20, -30])
		expect(out.endObjectId).toBe(B.id)
	})

	it('returns the same reference for any other object', () => {
		expect(applyEndpointPreview(A, preview())).toBe(A)
		const other = arrow({ id: toObjectId('other') })
		expect(applyEndpointPreview(other, preview())).toBe(other)
	})

	// The preview goes through the real routers, so mid-drag geometry is what release commits
	it('routes through resolveConnectorRoutes so the endpoint tracks the pointer', () => {
		const bound = arrow({ startObjectId: A.id, endObjectId: B.id })
		const dragged = applyEndpointPreview(bound, preview({ point: [800, 50], bind: null }))
		const resolved = resolveConnectorRoutes([A, B, dragged])[2] as ConnectorObject
		expect(resolved.endX).toBe(800)
		expect(resolved.endY).toBe(50)
		// Still docked at the source box, and routed from it
		expect(resolved.route).toBeDefined()
		expect(resolved.startX).toBeGreaterThan(100)
	})

	it('reroutes against the shape a preview binds to', () => {
		const free = arrow({ startObjectId: A.id, endX: 900, endY: 900 })
		const dragged = applyEndpointPreview(
			free,
			preview({ point: [340, 40], bind: { objectId: B.id, anchor: 'left' } })
		)
		const resolved = resolveConnectorRoutes([A, B, dragged])[2] as ConnectorObject
		// Snapped to B's left edge mid-height (less the standoff gap), not left at the raw
		// pointer position
		expect(resolved.endX).toBeGreaterThan(290)
		expect(resolved.endX).toBeLessThanOrEqual(300)
		expect(resolved.endY).toBeCloseTo(50, 0)
	})
})

/**
 * A connector still being DRAWN binds to a shape no committed connector references, so the context
 * has to be told about it explicitly - otherwise the preview routes against nothing, falls back to
 * a raw pointer-to-pointer line, and the committed arrow visibly jumps on release.
 */
describe('preview routing against an uncommitted binding', () => {
	// The pointer is over B's left edge, dragging in from the empty canvas between A and B
	const drawing = {
		startX: 150,
		startY: 50,
		endX: 340,
		endY: 40,
		endObjectId: B.id,
		endAnchor: 'left' as const,
		strokeWidth: 2
	}

	// The board carries no connectors at all here, which is the EMPTY_CONTEXT early-out
	it('indexes a shape that only a preview references', () => {
		expect(buildConnectorContext([B]).get(B.id)).toBeUndefined()
		expect(buildConnectorContext([B], undefined, [B.id]).get(B.id)).toBeDefined()
	})

	it('clips and stands off the bound terminal instead of using the raw pointer', () => {
		const ctx = buildConnectorContext([A, B], undefined, [B.id])
		const route = resolvePreviewRoute(drawing, ctx)
		expect(route).toBeDefined()
		const last = route?.points[route.points.length - 1]
		expect(last).not.toEqual([drawing.endX, drawing.endY])
		// Docked on B's left edge less the standoff gap, not left at the pointer
		expect(last?.[0]).toBeGreaterThan(290)
		expect(last?.[0]).toBeLessThanOrEqual(300)
		expect(last?.[1]).toBeCloseTo(50, 0)
	})

	// The case the mismatch was most visible in: an elbow detour versus a straight line
	it('produces a real elbow detour for orthogonal routing', () => {
		const ctx = buildConnectorContext([A, B], undefined, [B.id])
		const route = resolvePreviewRoute(
			{ ...drawing, startX: 500, startY: 500, routing: 'orthogonal' },
			ctx
		)
		expect(route?.points.length).toBeGreaterThan(2)
	})
})

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { clearRouteCache } from '../connectors/cache.js'
import type { GeometryOverrides } from '../connectors/resolve.js'
import {
	buildConnectorContext,
	isBindable,
	isBoundConnector,
	resolveConnectorRoutes,
	toShapeGeometry
} from '../connectors/resolve.js'
import { toObjectId } from '../crdt/ids.js'
import type {
	ConnectorObject,
	IdealloObject,
	PolygonObject,
	RectObject
} from '../crdt/runtime-types.js'
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

beforeEach(() => {
	clearRouteCache()
})

describe('isBindable', () => {
	it('accepts shapes and rejects connectors', () => {
		expect(isBindable(A)).toBe(true)
		expect(isBindable(arrow())).toBe(false)
	})
})

// Rotation used to be switched off only for a FULLY bound connector, so a half-bound one kept
// its rotation handle - and rotating it swung the bound terminal off the shape it is welded to,
// because the route is derived in world space and the rotation is applied on top of that.
describe('isBoundConnector', () => {
	it('is true for a connector bound at either end', () => {
		expect(isBoundConnector(arrow({ startObjectId: A.id }))).toBe(true)
		expect(isBoundConnector(arrow({ endObjectId: B.id }))).toBe(true)
		expect(isBoundConnector(arrow({ startObjectId: A.id, endObjectId: B.id }))).toBe(true)
	})

	it('is false for a free-floating connector', () => {
		expect(isBoundConnector(arrow())).toBe(false)
	})
})

describe('resolveConnectorRoutes', () => {
	it('returns the input array untouched when nothing is bound', () => {
		const objects: IdealloObject[] = [A, B, arrow()]
		expect(resolveConnectorRoutes(objects)).toBe(objects)
	})

	it('rewrites a bound arrow endpoint to the resolved point', () => {
		const bound = arrow({ startObjectId: A.id, endObjectId: B.id })
		const [, , resolved] = resolveConnectorRoutes([A, B, bound]) as [
			IdealloObject,
			IdealloObject,
			ConnectorObject
		]
		expect(resolved.route).toBeDefined()
		// Clipped to the facing outlines, nowhere near the stored 0,0 - 10,10
		expect(resolved.startX).toBeGreaterThan(100)
		expect(resolved.endX).toBeLessThan(300)
		expect(resolved.startY).toBeCloseTo(50, 0)
	})

	it('leaves unbound objects by reference', () => {
		const plain = arrow({ id: toObjectId('plain') })
		const bound = arrow({ startObjectId: A.id })
		const out = resolveConnectorRoutes([A, plain, bound])
		expect(out[0]).toBe(A)
		expect(out[1]).toBe(plain)
		expect(out[2]).not.toBe(bound)
	})

	// The whole point of deriving rather than storing: moving a shape rewrites only that shape
	it('follows a shape that moves, with no write to the arrow', () => {
		const bound = arrow({ startObjectId: A.id, endObjectId: B.id })
		const before = resolveConnectorRoutes([A, B, bound])[2] as ConnectorObject
		const movedB = rect('b', 300, 400)
		const after = resolveConnectorRoutes([A, movedB, bound])[2] as ConnectorObject
		expect(after.endY).not.toBeCloseTo(before.endY, 1)
		// The stored object was never touched
		expect(bound.startX).toBe(0)
		expect(bound.endY).toBe(10)
	})

	it('follows a shape that is resized', () => {
		const bound = arrow({ startObjectId: A.id, endObjectId: B.id })
		const before = resolveConnectorRoutes([A, B, bound])[2] as ConnectorObject
		const wideA = rect('a', 0, 0, 200, 100)
		const after = resolveConnectorRoutes([wideA, B, bound])[2] as ConnectorObject
		expect(after.startX).toBeGreaterThan(before.startX)
	})

	it('follows a shape that is rotated', () => {
		const bound = arrow({ startObjectId: A.id, endObjectId: B.id, startAnchor: 'top' })
		const before = resolveConnectorRoutes([A, B, bound])[2] as ConnectorObject
		const turned = { ...A, rotation: 90 }
		const after = resolveConnectorRoutes([turned, B, bound])[2] as ConnectorObject
		// The whole terminal, not one coordinate: a 'top' anchor aimed rightwards exits through
		// the right face either way, so x alone lands in nearly the same place
		const moved = Math.hypot(after.startX - before.startX, after.startY - before.startY)
		expect(moved).toBeGreaterThan(1)
	})

	it('is deterministic - the same input yields identical geometry', () => {
		const bound = arrow({ startObjectId: A.id, endObjectId: B.id, routing: 'orthogonal' })
		const first = JSON.stringify(
			(resolveConnectorRoutes([A, B, bound])[2] as ConnectorObject).route
		)
		for (let i = 0; i < 3; i++) {
			clearRouteCache()
			const again = JSON.stringify(
				(resolveConnectorRoutes([A, B, bound])[2] as ConnectorObject).route
			)
			expect(again).toBe(first)
		}
	})

	// A target that has not synced yet, or was deleted by a peer running older code
	it('falls back to the stored pts snapshot for a dangling reference', () => {
		const bound = arrow({
			startObjectId: toObjectId('gone'),
			startX: 7,
			startY: 8,
			endX: 9,
			endY: 11
		})
		const [, resolved] = resolveConnectorRoutes([A, bound]) as [IdealloObject, ConnectorObject]
		expect(resolved.route).toBeUndefined()
		expect(resolved.startX).toBe(7)
		expect(resolved.startY).toBe(8)
	})

	it('resolves a half-bound arrow against its free endpoint', () => {
		const bound = arrow({ startObjectId: A.id, endX: 400, endY: 50 })
		const [, resolved] = resolveConnectorRoutes([A, bound]) as [IdealloObject, ConnectorObject]
		expect(resolved.endX).toBe(400)
		expect(resolved.startX).toBeGreaterThan(100)
	})

	it('applies a drag override so a route follows before the CRDT commit', () => {
		const bound = arrow({ startObjectId: A.id, endObjectId: B.id })
		const before = resolveConnectorRoutes([A, B, bound])[2] as ConnectorObject
		const overrides: GeometryOverrides = new Map([[B.id, { dx: 0, dy: 500 }]])
		const after = resolveConnectorRoutes([A, B, bound], overrides)[2] as ConnectorObject
		expect(after.endY).toBeGreaterThan(before.endY + 400)
	})

	/**
	 * The resolver applies dx/dy exactly ONCE, so a caller that has already baked the drag into
	 * the objects it passes must NOT also hand over the override map - doing both makes every
	 * bound route track at twice the speed of the shape it is glued to.
	 */
	it('applies a drag offset exactly once', () => {
		const bound = arrow({ startObjectId: A.id, endObjectId: B.id })
		const dx = 200
		const base = resolveConnectorRoutes([A, B, bound])[2] as ConnectorObject

		// The Canvas shape: the offset is already in the objects, no map
		const movedB = rect('b', 300 + dx, 0)
		const once = resolveConnectorRoutes([A, movedB, bound])[2] as ConnectorObject
		expect(once.endX).toBeCloseTo(base.endX + dx, 1)

		// Passing the same offset again on top of the moved objects doubles it
		const overrides: GeometryOverrides = new Map([[B.id, { dx, dy: 0 }]])
		const twice = resolveConnectorRoutes([A, movedB, bound], overrides)[2] as ConnectorObject
		expect(twice.endX).toBeCloseTo(base.endX + dx * 2, 1)
	})

	it('routes every mode without throwing', () => {
		for (const routing of ['straight', 'curved', 'orthogonal'] as const) {
			const bound = arrow({ startObjectId: A.id, endObjectId: B.id, routing })
			const resolved = resolveConnectorRoutes([A, B, bound])[2] as ConnectorObject
			expect(resolved.route?.points.length).toBeGreaterThanOrEqual(2)
			expect(resolved.route?.d).toMatch(/^M /)
		}
	})
})

describe('buildConnectorContext', () => {
	it('indexes bindable shapes only', () => {
		const ctx = buildConnectorContext([A, B, arrow({ startObjectId: A.id, endObjectId: B.id })])
		expect(ctx.get(A.id)).toBeDefined()
		// A connector is not itself bindable, even when something names it
		expect(ctx.get(toObjectId('arr'))).toBeUndefined()
	})

	it('applies overrides to the indexed geometry', () => {
		const ctx = buildConnectorContext(
			[A, arrow({ startObjectId: A.id })],
			new Map([[A.id, { dx: 25, dy: 0 }]])
		)
		expect(ctx.get(A.id)?.bounds.x).toBe(25)
	})

	/*
	 * This used to call toShapeGeometry on EVERY bindable object. For a freehand that runs
	 * getObjectBounds -> calculatePathBounds, and the context is rebuilt per drag frame, so a
	 * board of pen strokes with one bound arrow paid for all of them on every pointermove.
	 */
	it('skips shapes no connector references', () => {
		const referenced = rect('referenced', 0, 0)
		const bystanders = Array.from({ length: 50 }, (_, i) => rect(`by${i}`, i * 10, 0))
		const ctx = buildConnectorContext([
			referenced,
			...bystanders,
			arrow({ startObjectId: referenced.id })
		])

		expect(ctx.get(referenced.id)).toBeDefined()
		for (const obj of bystanders) expect(ctx.get(obj.id)).toBeUndefined()
	})

	it('indexes nothing at all when no connector is bound', () => {
		const ctx = buildConnectorContext([A, B, arrow()])
		expect(ctx.get(A.id)).toBeUndefined()
		expect(ctx.get(B.id)).toBeUndefined()
	})

	// Half-bound is the live case mid-drag: the free terminal names nothing yet
	it('indexes the bound terminal of a half-bound connector and no more', () => {
		const ctx = buildConnectorContext([A, B, arrow({ startObjectId: A.id })])
		expect(ctx.get(A.id)).toBeDefined()
		expect(ctx.get(B.id)).toBeUndefined()
	})
})

describe('toShapeGeometry polygon overrides', () => {
	// 0,0 .. 100,100
	const TRI: PolygonObject = {
		id: toObjectId('tri'),
		type: 'polygon',
		x: 0,
		y: 0,
		vertices: [
			[0, 0],
			[100, 0],
			[50, 100]
		],
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		locked: false,
		style: { ...DEFAULT_STYLE }
	}

	it('translates the vertices for a dx/dy override', () => {
		const geo = toShapeGeometry(TRI, { dx: 10, dy: -5 })
		expect(geo.vertices).toEqual([
			[10, -5],
			[110, -5],
			[60, 95]
		])
	})

	// A bounds override has to carry the outline with it, or routing runs against a shape the
	// geometry no longer claims to be
	it('rescales the vertices to span a bounds override', () => {
		const doubled = { x: 0, y: 0, width: 200, height: 200 }
		const geo = toShapeGeometry(TRI, { bounds: doubled })
		const xs = geo.vertices?.map((v) => v[0]) ?? []
		const ys = geo.vertices?.map((v) => v[1]) ?? []
		expect(Math.min(...xs)).toBeCloseTo(0)
		expect(Math.max(...xs)).toBeCloseTo(200)
		expect(Math.min(...ys)).toBeCloseTo(0)
		expect(Math.max(...ys)).toBeCloseTo(200)
		expect(geo.bounds).toEqual(doubled)
	})

	it('translates as well as scales when the override box has moved', () => {
		const geo = toShapeGeometry(TRI, { bounds: { x: 500, y: 20, width: 50, height: 100 } })
		expect(geo.vertices).toEqual([
			[500, 20],
			[550, 20],
			[525, 120]
		])
	})
})

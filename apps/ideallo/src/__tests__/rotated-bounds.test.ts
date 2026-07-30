// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as Y from 'yjs'

import { clearRouteCache } from '../connectors/cache.js'
import { getOrCreateDocument } from '../crdt/document.js'
import { toObjectId } from '../crdt/ids.js'
import { getAllResolvedObjects, getObject } from '../crdt/object-ops.js'
import type { ConnectorObject, PolygonObject, RectObject } from '../crdt/runtime-types.js'
import { DEFAULT_STYLE } from '../crdt/runtime-types.js'
import type { StoredObject } from '../crdt/stored-types.js'
import { getObjectBounds, getRotatedObjectBounds, getRotationCenter } from '../utils/bounds.js'

function rect(over: Partial<RectObject> = {}) {
	return {
		id: toObjectId('r'),
		type: 'rect',
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		locked: false,
		style: { ...DEFAULT_STYLE },
		...over
	} as RectObject
}

/** Apex up at (50,0), base along y=100 */
function triangle(over: Partial<PolygonObject> = {}) {
	return {
		id: toObjectId('t'),
		type: 'polygon',
		x: 0,
		y: 0,
		vertices: [
			[50, 0],
			[100, 100],
			[0, 100]
		],
		rotation: 0,
		pivotX: 0.5,
		pivotY: 0.5,
		locked: false,
		style: { ...DEFAULT_STYLE },
		...over
	} as PolygonObject
}

describe('getRotationCenter', () => {
	it('is the box centre for a default pivot', () => {
		expect(getRotationCenter(rect())).toEqual([50, 50])
		expect(getRotationCenter(triangle())).toEqual([50, 50])
	})

	it('follows a moved pivot, normalized within the object own box', () => {
		expect(getRotationCenter(rect({ pivotX: 0, pivotY: 1 }))).toEqual([0, 100])
		expect(getRotationCenter(triangle({ pivotX: 0.25, pivotY: 0.25 }))).toEqual([25, 25])
	})
})

describe('getRotatedObjectBounds', () => {
	it('is the plain box below the rotation threshold', () => {
		expect(getRotatedObjectBounds(rect())).toEqual(getObjectBounds(rect()))
		// The same 0.1 degree dead zone ObjectRenderer uses before it emits a transform
		expect(getRotatedObjectBounds(rect({ rotation: 0.05 }))).toEqual(getObjectBounds(rect()))
	})

	it('grows a 45-degree rect to the box of its rotated corners', () => {
		const b = getRotatedObjectBounds(rect({ rotation: 45 }))
		const half = (100 * Math.SQRT2) / 2
		expect(b.x).toBeCloseTo(50 - half, 6)
		expect(b.y).toBeCloseTo(50 - half, 6)
		expect(b.width).toBeCloseTo(half * 2, 6)
		expect(b.height).toBeCloseTo(half * 2, 6)
	})

	it('turns a rect about a non-centre pivot', () => {
		// Pivot at the top-left corner: that corner stays put, and 90 degrees swings the box
		// down-left of it
		const b = getRotatedObjectBounds(rect({ rotation: 90, pivotX: 0, pivotY: 0 }))
		expect(b.x).toBeCloseTo(-100, 6)
		expect(b.y).toBeCloseTo(0, 6)
		expect(b.width).toBeCloseTo(100, 6)
		expect(b.height).toBeCloseTo(100, 6)
	})

	it('measures a rotated polygon by its vertices, not its box corners', () => {
		const b = getRotatedObjectBounds(triangle({ rotation: 45 }))
		const boxed = getRotatedObjectBounds(rect({ rotation: 45 }))
		// The triangle's own box, unlike the rect's, is not the swept box of four corners
		expect(b.width).toBeLessThan(boxed.width)
		// 45 degrees about (50,50) sends the apex (50,0) to (85.36, 14.64) and the base corners
		// to (14.64, 85.36) and (-20.71, 50)
		expect(b.x).toBeCloseTo(-20.710678, 4)
		expect(b.y).toBeCloseTo(14.644661, 4)
	})

	it('turns a polygon about a non-centre pivot', () => {
		// Pivot on the apex (50,0): that vertex is the fixed point, and the base swings left of it
		const b = getRotatedObjectBounds(triangle({ rotation: 90, pivotX: 0.5, pivotY: 0 }))
		expect(b.x).toBeCloseTo(-50, 6)
		expect(b.y).toBeCloseTo(-50, 6)
		expect(b.width).toBeCloseTo(100, 6)
		expect(b.height).toBeCloseTo(100, 6)
	})
})

/**
 * The selection frame and the transform handles are drawn from these bounds, so they have to
 * be measured on a RESOLVED connector. getObject() is expandObject with no route resolution, which
 * leaves `route` undefined and sends getObjectBounds down its endpoint-box fallback - the very case
 * that fallback exists to avoid. An elbow route that detours around a shape would then get a frame
 * covering only its two endpoints.
 */
describe('connector bounds follow the resolved route', () => {
	const A = toObjectId('boxA')
	const B = toObjectId('boxB')
	const ARR = toObjectId('arr')

	/** Two boxes stacked vertically, joined right-side to right-side: the route must bulge right */
	function detouringScene() {
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc)
		const add = (id: string, stored: StoredObject) => {
			doc.o.set(id, stored)
			doc.r.push([id])
		}
		add(A, { t: 'R', xy: [0, 0], wh: [100, 100] } as StoredObject)
		add(B, { t: 'R', xy: [0, 300], wh: [100, 100] } as StoredObject)
		add(ARR, {
			t: 'C',
			xy: [100, 50],
			wh: [0, 300],
			so_: A,
			sa: 'r',
			eo: B,
			ea: 'r',
			rt: 'O'
		} as StoredObject)
		return doc
	}

	beforeEach(() => {
		clearRouteCache()
	})

	it('encloses the whole detour, not just the endpoint box', () => {
		const doc = detouringScene()
		const resolved = getAllResolvedObjects(doc).find((o) => o.id === ARR) as ConnectorObject
		expect(resolved.route).toBeDefined()

		const routed = getObjectBounds(resolved)
		const endpointOnly = getObjectBounds(getObject(doc, ARR)!)

		// Both anchors are on the right edge, so the endpoints share an x and the fallback box is
		// a zero-width sliver - while the real route swings out around both boxes
		expect(endpointOnly.width).toBe(0)
		expect(routed.width).toBeGreaterThan(0)
		expect(routed.x + routed.width).toBeGreaterThan(endpointOnly.x + endpointOnly.width)
	})

	// getRotationCenter has the same fallback, so the rotation handle would sit off the shape
	it('centres rotation on the routed box', () => {
		const doc = detouringScene()
		const resolved = getAllResolvedObjects(doc).find((o) => o.id === ARR) as ConnectorObject
		const routed = getObjectBounds(resolved)

		expect(getRotationCenter(resolved)).toEqual([
			routed.x + routed.width / 2,
			routed.y + routed.height / 2
		])
		expect(getRotationCenter(resolved)).not.toEqual(getRotationCenter(getObject(doc, ARR)!))
	})
})

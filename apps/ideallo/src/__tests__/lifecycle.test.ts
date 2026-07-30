// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as Y from 'yjs'

import { clearRouteCache } from '../connectors/cache.js'
import { bindEndpoint, findIncidentArrows } from '../connectors/lifecycle.js'
import { getOrCreateDocument } from '../crdt/document.js'
import type { ObjectId } from '../crdt/ids.js'
import { toObjectId } from '../crdt/ids.js'
import {
	connectObjects,
	deletableObjectIds,
	deleteObjectsWithBindingCleanup,
	duplicateAsLinkedCopy,
	duplicateObject,
	getAllResolvedObjects,
	getObject
} from '../crdt/object-ops.js'
import type { ConnectorObject } from '../crdt/runtime-types.js'
import type { StoredConnector, StoredObject, YIdealloDocument } from '../crdt/stored-types.js'
import { storedConnectorTerminals } from '../crdt/type-converters.js'

function makeDoc(): { yDoc: Y.Doc; doc: YIdealloDocument } {
	const yDoc = new Y.Doc()
	return { yDoc, doc: getOrCreateDocument(yDoc) }
}

function addStored(doc: YIdealloDocument, id: string, stored: StoredObject) {
	doc.o.set(id, stored)
	doc.r.push([id])
}

function box(x: number, y: number): StoredObject {
	return { t: 'R', xy: [x, y], wh: [100, 100] }
}

/**
 * A legacy 'A' fixture - the lifecycle helpers must keep reading old records, not just 'C'.
 * Its geometry is in `pts`, with `xy` inert; the terminals are [1,2] -> [3,4].
 */
function boundArrow(so?: string, eo?: string): StoredConnector {
	return {
		t: 'A',
		xy: [0, 0],
		pts: [
			[1, 2],
			[3, 4]
		],
		...(so ? { so_: so } : {}),
		...(eo ? { eo } : {})
	} as StoredConnector
}

/**
 * The code this version actually writes - every connector created today is a 'C', whose geometry
 * is xy (the start terminal) plus wh (the signed delta to the end). Same terminals as boundArrow.
 */
function boundConnector(so?: string, eo?: string): StoredConnector {
	return {
		t: 'C',
		xy: [1, 2],
		wh: [2, 2],
		...(so ? { so_: so } : {}),
		...(eo ? { eo } : {})
	}
}

/** Read a stored connector's terminals whichever spelling it uses */
function terminals(stored: StoredConnector): [[number, number], [number, number]] {
	return storedConnectorTerminals(stored)
}

const A = toObjectId('boxA')
const B = toObjectId('boxB')
const ARR = toObjectId('arr')

function scene(make: (so?: string, eo?: string) => StoredConnector = boundArrow) {
	const { yDoc, doc } = makeDoc()
	addStored(doc, A, box(0, 0))
	addStored(doc, B, box(300, 0))
	addStored(doc, ARR, make(A, B))
	return { yDoc, doc }
}

beforeEach(() => {
	clearRouteCache()
})

describe('findIncidentArrows', () => {
	it('finds arrows bound to a target', () => {
		const { doc } = scene()
		expect(findIncidentArrows(doc, [A])).toEqual([{ arrowId: ARR, start: true, end: false }])
		expect(findIncidentArrows(doc, [B])).toEqual([{ arrowId: ARR, start: false, end: true }])
		expect(findIncidentArrows(doc, [A, B])).toEqual([{ arrowId: ARR, start: true, end: true }])
	})

	it('returns nothing for an unrelated id or an empty list', () => {
		const { doc } = scene()
		expect(findIncidentArrows(doc, [toObjectId('nope')])).toEqual([])
		expect(findIncidentArrows(doc, [])).toEqual([])
	})
})

describe('deleteObjectsWithBindingCleanup', () => {
	// The orphan policy: an arrow is a drawing, not an edge. It survives its target.
	it('keeps the arrow and freezes the terminal at its resolved position', () => {
		const { yDoc, doc } = scene()
		const before = getObject(doc, ARR) as ConnectorObject

		deleteObjectsWithBindingCleanup(yDoc, doc, [A])

		const stored = doc.o.get(ARR) as StoredConnector
		expect(stored).toBeDefined()
		expect(stored.so_).toBeUndefined()
		expect(stored.sa).toBeUndefined()
		// Still bound at the other end
		expect(stored.eo).toBe(B)
		// Frozen at the ROUTED endpoint - clipped to the box outline with the standoff gap -
		// not at the stale 1,2 snapshot and not at the shape's centre
		const [frozenStart, frozenEnd] = terminals(stored)
		expect(frozenStart[0]).toBeGreaterThan(100)
		expect(frozenStart[0]).toBeLessThan(110)
		expect(frozenStart[1]).toBeCloseTo(50, 0)
		// The still-bound end keeps its own snapshot: freezing the start must not drag it along
		expect(frozenEnd).toEqual([3, 4])
		expect(before.startObjectId).toBe(A)
	})

	it('removes the deleted object from both the map and the z-order', () => {
		const { yDoc, doc } = scene()
		deleteObjectsWithBindingCleanup(yDoc, doc, [A])
		expect(doc.o.has(A)).toBe(false)
		expect(doc.r.toArray()).not.toContain(A)
	})

	it('unbinds both terminals when both targets go', () => {
		const { yDoc, doc } = scene()
		deleteObjectsWithBindingCleanup(yDoc, doc, [A, B])
		const stored = doc.o.get(ARR) as StoredConnector
		expect(stored.so_).toBeUndefined()
		expect(stored.eo).toBeUndefined()
	})

	it('does not bother freezing an arrow that is itself being deleted', () => {
		const { yDoc, doc } = scene()
		deleteObjectsWithBindingCleanup(yDoc, doc, [A, ARR])
		expect(doc.o.has(ARR)).toBe(false)
	})

	// Freeze and delete share one transaction, so undo is a single step
	it('restores both the shape and the binding in one undo', () => {
		const { yDoc, doc } = scene()
		const undo = new Y.UndoManager([doc.o, doc.r], { trackedOrigins: new Set([yDoc.clientID]) })

		deleteObjectsWithBindingCleanup(yDoc, doc, [A])
		expect(doc.o.has(A)).toBe(false)
		expect((doc.o.get(ARR) as StoredConnector).so_).toBeUndefined()

		undo.undo()
		expect(doc.o.has(A)).toBe(true)
		expect((doc.o.get(ARR) as StoredConnector).so_).toBe(A)
	})

	it('is a no-op for an empty list', () => {
		const { yDoc, doc } = scene()
		deleteObjectsWithBindingCleanup(yDoc, doc, [])
		expect(doc.o.size).toBe(3)
	})

	// The Smart Ink undo hint used to call a plain deleteObject(), which skipped the freeze -
	// so undoing a stroke that had been snapped into a shape left every connector bound to it
	// pointing at a missing id, falling back to the stale bind-time snapshot. Single-id removal
	// goes through the SAME entry point as every other one.
	it('freezes incident connectors when a single snapped object is removed', () => {
		const { yDoc, doc } = scene()
		// The snapped stroke: a Smart Ink rect standing in for what the undo hint removes
		doc.o.set(A, { ...(box(0, 0) as object), sn: true } as StoredObject)

		deleteObjectsWithBindingCleanup(yDoc, doc, [A])

		const stored = doc.o.get(ARR) as StoredConnector
		expect(stored.so_).toBeUndefined() // no dangling ref left behind
		// Frozen where it was last DRAWN - clipped to the box outline - not at the stale [1, 2]
		expect(terminals(stored)[0][0]).toBeGreaterThan(100)
	})
})

// A lock used to mean "cannot be modified" everywhere EXCEPT delete - the drag handler refused
// a locked object and the eraser skipped it, but Delete wiped it, taking the freeze of every
// incident connector with it. The filter lives in the CRDT primitive so all callers inherit it.
describe('locked objects are not deleted', () => {
	/** The A rect of `scene()`, locked */
	function lockedScene(make: (so?: string, eo?: string) => StoredConnector = boundArrow) {
		const { yDoc, doc } = scene(make)
		doc.o.set(A, { ...box(0, 0), lk: true } as StoredObject)
		return { yDoc, doc }
	}

	it('leaves a locked shape and its binding alone', () => {
		const { yDoc, doc } = lockedScene()

		deleteObjectsWithBindingCleanup(yDoc, doc, [A])

		expect(doc.o.has(A)).toBe(true)
		expect(doc.r.toArray()).toContain(A as string)
		// Nothing was removed, so nothing was frozen either
		const stored = doc.o.get(ARR) as StoredConnector
		expect(stored.so_).toBe(A)
		expect(stored.eo).toBe(B)
	})

	it('deletes the unlocked members of a mixed selection', () => {
		const { yDoc, doc } = lockedScene()

		deleteObjectsWithBindingCleanup(yDoc, doc, [A, B])

		expect(doc.o.has(A)).toBe(true)
		expect(doc.o.has(B)).toBe(false)
		expect(doc.r.toArray()).not.toContain(B as string)
		const stored = doc.o.get(ARR) as StoredConnector
		expect(stored.so_).toBe(A) // still welded to the surviving locked box
		expect(stored.eo).toBeUndefined() // frozen where B was
	})

	it('deletableObjectIds drops locked and unknown ids', () => {
		const { doc } = lockedScene()
		expect(deletableObjectIds(doc, [A])).toEqual([])
		expect(deletableObjectIds(doc, [A, B])).toEqual([B])
		expect(deletableObjectIds(doc, [toObjectId('nope')])).toEqual([])
		expect(deletableObjectIds(doc, [])).toEqual([])
	})
})

describe('bindEndpoint', () => {
	it('binds a terminal and refreshes the fallback snapshot', () => {
		const { yDoc, doc } = makeDoc()
		addStored(doc, A, box(0, 0))
		addStored(doc, ARR, boundArrow())

		bindEndpoint(yDoc, doc, ARR, 'start', A, 'r', [42, 43])
		const stored = doc.o.get(ARR) as StoredConnector
		expect(stored.so_).toBe(A)
		expect(stored.sa).toBe('r')
		const [start, end] = terminals(stored)
		expect(start).toEqual([42, 43])
		expect(end).toEqual([3, 4]) // the untouched terminal stays exactly where it was
	})

	it('omits the anchor for the auto default', () => {
		const { yDoc, doc } = makeDoc()
		addStored(doc, A, box(0, 0))
		addStored(doc, ARR, boundArrow())
		bindEndpoint(yDoc, doc, ARR, 'end', A, undefined, [1, 1])
		expect((doc.o.get(ARR) as StoredConnector).ea).toBeUndefined()
	})

	// Dropping on empty canvas is the entire unbind gesture - no menu needed
	it('unbinds and freezes at the drop point', () => {
		const { yDoc, doc } = scene()
		bindEndpoint(yDoc, doc, ARR, 'start', null, undefined, [500, 600])
		const stored = doc.o.get(ARR) as StoredConnector
		expect(stored.so_).toBeUndefined()
		expect(stored.sa).toBeUndefined()
		expect(terminals(stored)[0]).toEqual([500, 600])
		expect(stored.eo).toBe(B)
	})

	it('ignores a non-arrow target', () => {
		const { yDoc, doc } = scene()
		expect(() => bindEndpoint(yDoc, doc, A, 'start', B)).not.toThrow()
		expect(doc.o.get(A)).toEqual(box(0, 0))
	})

	// setTerminals drops `pts`, and the 0.8.x reader indexes it unconditionally on a 't: A' -
	// so leaving the type code alone would have handed that peer a record it hard-crashes on.
	// 't: C' is a code it never claimed to read, which degrades instead.
	it('normalises a legacy `A` record to `C` on its first edit', () => {
		const { yDoc, doc } = makeDoc()
		addStored(doc, A, box(0, 0))
		addStored(doc, ARR, boundArrow())
		expect((doc.o.get(ARR) as StoredConnector).pts).toBeDefined()

		bindEndpoint(yDoc, doc, ARR, 'start', A, 'r', [42, 43])

		const stored = doc.o.get(ARR) as StoredConnector
		expect(stored.t).toBe('C')
		expect(stored.wh).toBeDefined()
		expect(stored.pts).toBeUndefined()
	})
})

// A stored 'L' keeps its geometry in `pts` with `xy` inert, and the duplicate path used to
// gate the terminal-offsetting freeze on isStoredConnector - which does not match 'L'. So on any
// board saved before the connector rewrite, Ctrl+D on a plain line left an invisible second object
// exactly on top of the first.
describe('duplicateObject on a legacy L line', () => {
	const LINE = toObjectId('line')

	function storedLine(): StoredObject {
		return {
			t: 'L',
			xy: [0, 0],
			pts: [
				[10, 10],
				[50, 50]
			]
		} as StoredObject
	}

	it('offsets both terminals and migrates the copy to `C`', () => {
		const { yDoc, doc } = makeDoc()
		addStored(doc, LINE, storedLine())

		const newId = duplicateObject(yDoc, doc, LINE, 20, 20) as ObjectId
		const copy = getObject(doc, newId) as ConnectorObject

		expect(copy.startX).toBe(30)
		expect(copy.startY).toBe(30)
		expect(copy.endX).toBe(70)
		expect(copy.endY).toBe(70)

		const stored = doc.o.get(newId) as StoredConnector
		expect(stored.t).toBe('C')
		expect(stored.pts).toBeUndefined()
		expect(stored.wh).toEqual([40, 40])

		// The original is untouched, still readable as the legacy record it is
		expect(doc.o.get(LINE)).toEqual(storedLine())
	})
})

// Run against both stored codes: 'C' is what every connector created today uses, 'A' the legacy
// record. A guard that only matched one of them would silently stack an invisible duplicate.
describe.each([
	['C', boundConnector],
	['A', boundArrow]
] as const)('duplicateObject on a %s connector', (_code, make) => {
	// Keeping the bindings would make the copy resolve to the same route as the original
	it('detaches the copy so the offset is visible', () => {
		const { yDoc, doc } = scene(make)
		const newId = duplicateObject(yDoc, doc, ARR, 20, 20) as ObjectId
		const copy = doc.o.get(newId) as StoredConnector

		expect(copy.so_).toBeUndefined()
		expect(copy.eo).toBeUndefined()
		const original = doc.o.get(ARR) as StoredConnector
		expect(original.so_).toBe(A)

		// Frozen at the ROUTED endpoint plus the offset, not at the shape centre - otherwise
		// the copy would appear to jump inwards relative to the original
		const resolved = getAllResolvedObjects(doc).find((o) => o.id === ARR) as ConnectorObject
		const [copyStart, copyEnd] = terminals(copy)
		expect(copyStart[0]).toBeCloseTo(resolved.startX + 20, 1)
		expect(resolved.startX).toBeGreaterThan(100) // clipped to the box outline, not its centre
		// The offset is applied exactly ONCE, to BOTH terminals - the freeze is the whole record
		expect(copyEnd[0]).toBeCloseTo(resolved.endX + 20, 1)
		expect(copyEnd[1]).toBeCloseTo(resolved.endY + 20, 1)
	})

	it('leaves a plain shape duplicate alone', () => {
		const { yDoc, doc } = scene(make)
		const newId = duplicateObject(yDoc, doc, A, 20, 20) as ObjectId
		expect(doc.o.get(newId)?.xy).toEqual([20, 20])
	})

	// A connector's geometry used to live in `pts`, which the generic xy offset could not
	// reach, and the freeze branch only ran for a BOUND connector - so Ctrl+D on a plain arrow
	// drawn on empty canvas stacked the copy exactly on top of the original.
	it('offsets both terminals of an UNBOUND connector', () => {
		const { yDoc, doc } = scene(make)
		doc.o.set(ARR, make()) // same fixture, no bindings

		const newId = duplicateObject(yDoc, doc, ARR, 20, 20) as ObjectId
		expect(terminals(doc.o.get(newId) as StoredConnector)).toEqual([
			[21, 22],
			[23, 24]
		])
		// ...and the original has not moved with it
		expect(terminals(doc.o.get(ARR) as StoredConnector)).toEqual([
			[1, 2],
			[3, 4]
		])
	})

	// Half-bound: the bound end is frozen where it resolves, the free end keeps its own point.
	// Both get the offset once, so the copy keeps the original's shape.
	it('offsets a half-bound connector exactly once at each terminal', () => {
		const { yDoc, doc } = scene(make)
		doc.o.set(ARR, make(A)) // start bound, end free at [3, 4]

		const resolved = getAllResolvedObjects(doc).find((o) => o.id === ARR) as ConnectorObject
		const newId = duplicateObject(yDoc, doc, ARR, 20, 20) as ObjectId
		const [copyStart, copyEnd] = terminals(doc.o.get(newId) as StoredConnector)

		expect(copyStart[0]).toBeCloseTo(resolved.startX + 20, 1)
		expect(copyEnd).toEqual([23, 24])
	})
})

// A polygon's vertices are ABSOLUTE, so copying the geo array verbatim lands the duplicate exactly
// on top of the original: offset xy, unmoved outline, nothing visible.
describe('duplicateObject on a polygon', () => {
	const POLY = toObjectId('poly')

	it('offsets the duplicated vertices and leaves the source array alone', () => {
		const { yDoc, doc } = makeDoc()
		addStored(doc, POLY, { t: 'P', xy: [0, 0] } as StoredObject)
		const source = new Y.Array<number>()
		doc.geo.set(POLY, source)
		source.push([5, 0, 10, 10, 0, 10])

		const newId = duplicateObject(yDoc, doc, POLY, 20, 20) as ObjectId

		expect(doc.geo.get(newId)?.toArray()).toEqual([25, 20, 30, 30, 20, 30])
		// A naive in-place map would have moved the ORIGINAL too
		expect(source.toArray()).toEqual([5, 0, 10, 10, 0, 10])
	})
})

// A connector has no tid/pid/gid payload to link, so a linked copy detaches exactly like a true
// copy - otherwise it would land invisibly on top of the original.
describe.each([
	['C', boundConnector],
	['A', boundArrow]
] as const)('duplicateAsLinkedCopy on a %s connector', (_code, make) => {
	it('detaches the copy so the offset is visible', () => {
		const { yDoc, doc } = scene(make)
		const resolvedStart = (
			getAllResolvedObjects(doc).find((o) => o.id === ARR) as ConnectorObject
		).startX

		const newId = duplicateAsLinkedCopy(yDoc, doc, ARR, 20, 20) as ObjectId
		const copy = doc.o.get(newId) as StoredConnector

		expect(copy.so_).toBeUndefined()
		expect(copy.eo).toBeUndefined()
		expect(terminals(copy)[0][0]).toBeCloseTo(resolvedStart + 20, 1)
		expect((doc.o.get(ARR) as StoredConnector).so_).toBe(A)
	})
})

describe('connectObjects', () => {
	const style = {
		strokeColor: 'n0',
		fillColor: 'transparent',
		strokeWidth: 2,
		strokeStyle: 'solid' as const,
		opacity: 1
	}

	it('connects two shapes with auto anchors at both ends', () => {
		const { yDoc, doc } = makeDoc()
		addStored(doc, A, box(0, 0))
		addStored(doc, B, box(300, 0))

		const [id] = connectObjects(yDoc, doc, [A, B], { style })
		const stored = doc.o.get(id) as StoredConnector
		expect(stored.t).toBe('C')
		expect(stored.so_).toBe(A)
		expect(stored.eo).toBe(B)
		// Auto is the default, so both anchors are omitted from storage
		expect(stored.sa).toBeUndefined()
		expect(stored.ea).toBeUndefined()
	})

	// The C shortcut is one of the three creation paths, and all three agree: no arrowheads
	// unless the caller asks for them.
	it('defaults to a headless connector', () => {
		const { yDoc, doc } = makeDoc()
		addStored(doc, A, box(0, 0))
		addStored(doc, B, box(300, 0))

		const [id] = connectObjects(yDoc, doc, [A, B], { style })
		const stored = doc.o.get(id) as StoredConnector
		expect(stored.sar).toBeUndefined()
		expect(stored.ear).toBeUndefined()
		expect(stored.ah).toBeUndefined()
	})

	it('follows selection order for direction', () => {
		const { yDoc, doc } = makeDoc()
		addStored(doc, A, box(0, 0))
		addStored(doc, B, box(300, 0))
		const [id] = connectObjects(yDoc, doc, [B, A], { style })
		const stored = doc.o.get(id) as StoredConnector
		expect(stored.so_).toBe(B)
		expect(stored.eo).toBe(A)
	})

	it('connects more than two shapes pairwise', () => {
		const { yDoc, doc } = makeDoc()
		const C = toObjectId('boxC')
		addStored(doc, A, box(0, 0))
		addStored(doc, B, box(300, 0))
		addStored(doc, C, box(600, 0))
		expect(connectObjects(yDoc, doc, [A, B, C], { style })).toHaveLength(2)
	})

	it('needs at least two shapes', () => {
		const { yDoc, doc } = makeDoc()
		addStored(doc, A, box(0, 0))
		expect(connectObjects(yDoc, doc, [A], { style })).toEqual([])
		expect(connectObjects(yDoc, doc, [], { style })).toEqual([])
	})

	it('ignores connectors in the selection - only shapes are bindable', () => {
		const { yDoc, doc } = makeDoc()
		addStored(doc, A, box(0, 0))
		addStored(doc, ARR, boundArrow())
		expect(connectObjects(yDoc, doc, [A, ARR], { style })).toEqual([])
	})

	it('carries the given routing and arrowhead defaults', () => {
		const { yDoc, doc } = makeDoc()
		addStored(doc, A, box(0, 0))
		addStored(doc, B, box(300, 0))
		const [id] = connectObjects(yDoc, doc, [A, B], {
			style,
			routing: 'orthogonal',
			startArrow: { type: 'diamond' },
			endArrow: { type: 'triangle' }
		})
		const stored = doc.o.get(id) as StoredConnector
		expect(stored.rt).toBe('O')
		expect(stored.sar).toEqual(['D'])
		expect(stored.ear).toEqual(['T'])
	})

	it('resolves into a real route immediately', () => {
		const { yDoc, doc } = makeDoc()
		addStored(doc, A, box(0, 0))
		addStored(doc, B, box(300, 0))
		const [id] = connectObjects(yDoc, doc, [A, B], { style })
		const resolved = getAllResolvedObjects(doc).find((o) => o.id === id) as ConnectorObject
		expect(resolved.route).toBeDefined()
		expect(resolved.startX).toBeGreaterThan(100)
	})
})

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as Y from 'yjs'

import { toObjectId } from '../crdt/ids.js'
import {
	getAllObjects,
	getObject,
	replaceGeometryPoints,
	translateObject,
	tryExpandObject,
	updateObject
} from '../crdt/object-ops.js'
import type {
	ArrowStyle,
	ConnectorObject,
	IdealloObject,
	PolygonObject,
	RectObject,
	TextBearingObject,
	TextObject
} from '../crdt/runtime-types.js'
import { DEFAULT_STYLE } from '../crdt/runtime-types.js'
import type {
	StoredConnector,
	StoredLine,
	StoredObject,
	StoredSticky,
	StoredText,
	YIdealloDocument
} from '../crdt/stored-types.js'
import { compactObject, expandObject, retireUnknownCodes } from '../crdt/type-converters.js'
import { getBoundsFromPoints, scalePointsIntoBounds } from '../utils/geometry.js'

/** Minimal document stub - the connector branch never touches txt/geo/paths */
function makeDoc(): YIdealloDocument {
	const yDoc = new Y.Doc()
	return {
		o: yDoc.getMap('o'),
		r: yDoc.getArray('r'),
		m: yDoc.getMap('m'),
		txt: yDoc.getMap('txt'),
		geo: yDoc.getMap('geo'),
		paths: yDoc.getMap('paths')
	} as YIdealloDocument
}

const ID = toObjectId('arrow1')

/**
 * A legacy 'A' record - read only; nothing writes this code any more. Its geometry is in `pts`,
 * with `xy` inert, which is exactly why it must migrate on the first edit.
 */
function storedArrow(extra: Partial<StoredConnector> = {}): StoredConnector {
	return {
		t: 'A',
		xy: [0, 0],
		pts: [
			[10, 20],
			[110, 120]
		],
		...extra
	} as StoredConnector
}

/** A current 'C' record - what compactObject writes: xy = start, wh = signed delta to the end */
function storedConnector(extra: Partial<StoredConnector> = {}): StoredConnector {
	return {
		t: 'C',
		xy: [10, 20],
		wh: [100, 100],
		...extra
	}
}

/** A pre-release 'C' record: written before `wh` existed, so its geometry is still in `pts` */
function preReleaseConnector(extra: Partial<StoredConnector> = {}): StoredConnector {
	return storedArrow({ ...extra, t: 'C' })
}

/** A legacy 'L' record - read only, migrated to a headless connector */
function storedLine(extra: Partial<StoredLine> = {}): StoredLine {
	return {
		t: 'L',
		xy: [10, 20],
		pts: [
			[10, 20],
			[40, 60]
		],
		...extra
	}
}

function expandArrow(stored: StoredObject): ConnectorObject {
	return expandObject(ID, stored, makeDoc()) as ConnectorObject
}

function roundTrip(stored: StoredObject): StoredConnector {
	return compactObject(expandArrow(stored)) as StoredConnector
}

describe('connector expand/compact', () => {
	it('round-trips a plain unbound connector byte-identically', () => {
		const stored = storedConnector()
		expect(roundTrip(stored)).toEqual(stored)
	})

	it('defaults an unbound connector to straight routing and auto anchors', () => {
		const arrow = expandArrow(storedConnector())
		expect(arrow.routing).toBe('straight')
		expect(arrow.startAnchor).toBe('auto')
		expect(arrow.endAnchor).toBe('auto')
		expect(arrow.startObjectId).toBeUndefined()
		expect(arrow.endObjectId).toBeUndefined()
	})

	// The whole point of the 'C' code: an omitted head means NO head, so the common case is
	// byte-free rather than carrying an explicit ['N'].
	it('defaults an omitted sar/ear to no arrowhead', () => {
		const arrow = expandArrow(storedConnector())
		expect(arrow.startArrow).toEqual({ type: 'none' })
		expect(arrow.endArrow).toEqual({ type: 'none' })
	})

	it('round-trips every binding field', () => {
		const stored = storedConnector({
			so_: 'boxA',
			sa: 'r',
			eo: 'boxB',
			ea: [0.25, 0.75],
			rt: 'O',
			sar: ['D'],
			ear: ['C', 2, false]
		})
		const arrow = expandArrow(stored)
		expect(arrow.startObjectId).toBe('boxA')
		expect(arrow.startAnchor).toBe('right')
		expect(arrow.endObjectId).toBe('boxB')
		expect(arrow.endAnchor).toEqual({ x: 0.25, y: 0.75 })
		expect(arrow.routing).toBe('orthogonal')
		expect(arrow.startArrow).toEqual({ type: 'diamond' })
		expect(arrow.endArrow).toEqual({ type: 'circle', size: 2, filled: false })
		expect(roundTrip(stored)).toEqual(stored)
	})

	it('omits every field that is at its default', () => {
		const compacted = roundTrip(storedConnector())
		expect(Object.keys(compacted).sort()).toEqual(['t', 'wh', 'xy'])
	})

	it('never emits the derived route field', () => {
		const arrow = expandArrow(storedConnector({ so_: 'boxA' }))
		arrow.route = {
			kind: 'straight',
			points: [
				[0, 0],
				[1, 1]
			],
			d: 'M 0 0 L 1 1',
			startDir: null,
			endDir: null,
			bounds: { x: 0, y: 0, width: 1, height: 1 }
		}
		expect('route' in (compactObject(arrow) as object)).toBe(false)
	})

	// The compactObject whitelist rebuilds the stored record from scratch. A field that is not
	// threaded through BOTH converters is silently destroyed by an unrelated edit.
	it('preserves bindings across a style-only update', () => {
		const stored = storedConnector({
			so_: 'boxA',
			sa: 'tl',
			eo: 'boxB',
			ea: 'b',
			rt: 'C',
			sar: ['T'],
			ear: ['B']
		})
		const expanded = expandArrow(stored)
		const updated = {
			...expanded,
			style: { ...expanded.style, strokeColor: 'a1' }
		} as IdealloObject
		const compacted = compactObject(updated) as StoredConnector

		expect(compacted.so_).toBe('boxA')
		expect(compacted.sa).toBe('tl')
		expect(compacted.eo).toBe('boxB')
		expect(compacted.ea).toBe('b')
		expect(compacted.rt).toBe('C')
		expect(compacted.sar).toEqual(['T'])
		expect(compacted.ear).toEqual(['B'])
		expect(compacted.sc).toBe('a1')
	})

	it('preserves reserved waypoint and bend fields', () => {
		const stored = storedConnector({ wp: [[5, 5]], bd: 0.4 })
		expect(roundTrip(stored)).toEqual(stored)
	})

	it('round-trips a free normalized anchor', () => {
		const stored = storedConnector({ so_: 'boxA', sa: [0, 1] })
		expect(roundTrip(stored)).toEqual(stored)
	})

	// `wh` is a SIGNED delta, never a normalised extent: normalise it and the two terminals swap,
	// which silently reverses every arrowhead on the board.
	it.each([
		['right-to-left', [-100, 60]],
		['bottom-to-top', [100, -60]],
		['both', [-100, -60]]
	])('preserves endpoint order for a %s connector', (_name, wh) => {
		const stored = storedConnector({ wh: wh as [number, number] })
		const arrow = expandArrow(stored)
		expect([arrow.startX, arrow.startY]).toEqual([10, 20])
		expect([arrow.endX, arrow.endY]).toEqual([10 + wh[0], 20 + wh[1]])
		expect(roundTrip(stored)).toEqual(stored)
	})

	// xy is the START terminal, not a bbox origin, so obj.x === obj.startX for every connector.
	// compactObject writes xy from startX/startY on the strength of that.
	it('expands x/y to the start terminal', () => {
		const arrow = expandArrow(storedConnector({ wh: [-100, -60] }))
		expect([arrow.x, arrow.y]).toEqual([arrow.startX, arrow.startY])
	})

	// Pre-release 'C' records (written before `wh` existed) still carry their geometry in `pts`.
	// 0.8.17 shipped no 'C' at all, so this is only ever a local scratch board - but it must open.
	it('reads a pre-release C record from pts', () => {
		const arrow = expandArrow(preReleaseConnector())
		expect([arrow.startX, arrow.startY, arrow.endX, arrow.endY]).toEqual([10, 20, 110, 120])
	})

	it('migrates a pre-release C record to xy/wh on the first write', () => {
		const compacted = roundTrip(preReleaseConnector())
		expect(compacted.xy).toEqual([10, 20])
		expect(compacted.wh).toEqual([100, 100])
		expect(compacted.pts).toBeUndefined()
	})
})

const NONE: ArrowStyle = { type: 'none' }
const ARROW: ArrowStyle = { type: 'arrow' }

describe('legacy A arrow records', () => {
	// An 'A' record has an inert xy and its real geometry in `pts`. Reading it through the new
	// xy/wh rule would put every legacy arrow at the origin with zero length.
	it('expands its endpoints from pts, not from the inert xy', () => {
		const arrow = expandArrow(storedArrow())
		expect([arrow.startX, arrow.startY, arrow.endX, arrow.endY]).toEqual([10, 20, 110, 120])
		expect([arrow.x, arrow.y]).toEqual([10, 20])
	})

	it('rewrites its geometry as xy/wh on the first write', () => {
		const compacted = roundTrip(storedArrow())
		expect(compacted.xy).toEqual([10, 20])
		expect(compacted.wh).toEqual([100, 100])
		expect(compacted.pts).toBeUndefined()
	})

	it.each([
		[undefined, NONE, ARROW],
		['E' as const, NONE, ARROW],
		['S' as const, ARROW, NONE],
		['B' as const, ARROW, ARROW]
	])('expands ah=%s to the right pair', (ah, start, end) => {
		const arrow = expandArrow(storedArrow(ah ? { ah } : {}))
		expect(arrow.startArrow).toEqual(start)
		expect(arrow.endArrow).toEqual(end)
	})

	// LEGACY_A_DEFAULT_END doing its job: an 'A' saved before sar/ear existed has an END
	// arrowhead, and must not lose it just because the NEW default is headless.
	it('keeps the implied end arrowhead when ear and ah are both absent', () => {
		expect(expandArrow(storedArrow()).endArrow).toEqual(ARROW)
	})

	// ...and once rewritten as 'C', where an omitted ear means NO head, that arrowhead has to
	// become explicit or it would silently vanish on the next load.
	it('rewrites as C, making the implied end arrowhead explicit', () => {
		const compacted = roundTrip(storedArrow())
		expect(compacted.t).toBe('C')
		expect(compacted.ear).toEqual(['A'])
		expect(compacted.sar).toBeUndefined()
		expect(compacted.ah).toBeUndefined()
	})

	it.each([['S' as const], ['B' as const]])('migrates ah=%s into sar/ear', (ah) => {
		const compacted = roundTrip(storedArrow({ ah }))
		expect(compacted.sar).toEqual(['A'])
		expect(compacted.ear).toEqual(ah === 'B' ? ['A'] : undefined)
	})

	// `ah` existed so pre-sar/ear peers drew heads in the right place. No such peer can read a
	// 'C' record at all, so it is never written again.
	it.each([[undefined], ['E' as const], ['S' as const], ['B' as const]])(
		'never writes ah back (ah=%s)',
		(ah) => {
			expect(roundTrip(storedArrow(ah ? { ah } : {})).ah).toBeUndefined()
		}
	)

	it('lets sar/ear win over a stale legacy ah', () => {
		const arrow = expandArrow(storedArrow({ ah: 'B', sar: ['N'], ear: ['T'] }))
		expect(arrow.startArrow).toEqual({ type: 'none' })
		expect(arrow.endArrow).toEqual({ type: 'triangle' })
	})

	it('keeps a headless legacy arrow headless across a round trip', () => {
		const arrow = expandArrow(storedArrow({ ear: ['N'] }))
		expect(arrow.startArrow).toEqual(NONE)
		expect(arrow.endArrow).toEqual(NONE)
		const compacted = compactObject(arrow) as StoredConnector
		// Headless is now the OMITTED case, so ['N'] compacts away entirely
		expect(compacted.sar).toBeUndefined()
		expect(compacted.ear).toBeUndefined()
		expect(compacted.ah).toBeUndefined()
	})

	it('carries non-arrow shapes through unchanged', () => {
		const compacted = roundTrip(storedArrow({ sar: ['C'], ear: ['D'] }))
		expect(compacted.sar).toEqual(['C'])
		expect(compacted.ear).toEqual(['D'])
	})
})

describe('legacy L line migration', () => {
	it('expands a stored line into a headless connector', () => {
		const line = expandArrow(storedLine())
		expect(line.type).toBe('connector')
		expect([line.startX, line.startY, line.endX, line.endY]).toEqual([10, 20, 40, 60])
		expect(line.routing).toBe('straight')
		expect(line.startAnchor).toBe('auto')
		expect(line.endAnchor).toBe('auto')
		expect(line.startObjectId).toBeUndefined()
		expect(line.endObjectId).toBeUndefined()
	})

	// LOAD-BEARING. A stored line has no `ah`, and the legacy absent-`ah` rule reads as 'end' -
	// so routing 'L' through expandLegacyArrowheads would hand every old line an arrowhead it
	// never had. Guard the migration against exactly that refactor.
	it('gives a migrated line NO arrowheads', () => {
		const line = expandArrow(storedLine())
		expect(line.startArrow).toEqual(NONE)
		expect(line.endArrow).toEqual(NONE)
	})

	it('carries the base fields over untouched', () => {
		const line = expandArrow(
			storedLine({ sc: 'a1', sw: 5, ss: 'D', op: 0.5, r: 30, pv: [0, 1], lk: true, sn: true })
		)
		expect(line.style).toEqual({
			strokeColor: 'a1',
			fillColor: DEFAULT_STYLE.fillColor,
			strokeWidth: 5,
			strokeStyle: 'dashed',
			opacity: 0.5
		})
		expect(line.x).toBe(10)
		expect(line.y).toBe(20)
		expect(line.rotation).toBe(30)
		expect(line.pivotX).toBe(0)
		expect(line.pivotY).toBe(1)
		expect(line.locked).toBe(true)
		expect(line.snapped).toBe(true)
	})

	it('rewrites a line as a bare C record', () => {
		const compacted = roundTrip(storedLine())
		expect(compacted.t).toBe('C')
		expect(compacted.xy).toEqual([10, 20])
		expect(compacted.wh).toEqual([30, 40])
		expect(compacted.pts).toBeUndefined()
		expect(compacted.sar).toBeUndefined()
		expect(compacted.ear).toBeUndefined()
		expect(compacted.ah).toBeUndefined()
		expect(compacted.so_).toBeUndefined()
		expect(compacted.eo).toBeUndefined()
		expect(compacted.rt).toBeUndefined()
	})

	// End-to-end guard: expand -> compact -> expand must still be headless. If the creation
	// default and the storage default ever drift apart again, this is what catches it.
	it('stays headless across a double round trip', () => {
		const reloaded = expandArrow(roundTrip(storedLine()))
		expect(reloaded.startArrow).toEqual(NONE)
		expect(reloaded.endArrow).toEqual(NONE)
	})
})

describe('non-connector objects are untouched', () => {
	it('round-trips a rect', () => {
		const stored = {
			t: 'R' as const,
			xy: [1, 2] as [number, number],
			wh: [30, 40] as [number, number]
		}
		const expanded = expandObject(ID, stored, makeDoc())
		expect(expanded.style).toEqual(DEFAULT_STYLE)
		expect(compactObject(expanded)).toEqual(stored)
	})
})

describe('corner radius expand/compact', () => {
	/** The three types with a box to round. Ellipse and polygon deliberately have none. */
	const ROUNDABLE: StoredObject[] = [
		{ t: 'R', xy: [1, 2], wh: [30, 40] } as StoredObject,
		{ t: 'I', xy: [1, 2], wh: [30, 40], fid: 'f1' } as StoredObject,
		{ t: 'D', xy: [1, 2], wh: [30, 40], fid: 'f1', ct: 'cloudillo/quillo' } as StoredObject
	]

	it('round-trips a non-zero cr on a rect, an image and a document', () => {
		for (const bare of ROUNDABLE) {
			const stored = { ...bare, cr: 12 } as StoredObject
			const expanded = expandObject(ID, stored, makeDoc()) as { cornerRadius?: number }
			expect(expanded.cornerRadius).toBe(12)
			expect(compactObject(expanded as IdealloObject)).toEqual(stored)
		}
	})

	/*
	 * 0 is what an absent cr already means, so writing it back would give every square-cornered
	 * object a new key the first time anything unrelated about it is edited.
	 */
	it('omits cr again at 0 and when it was never set', () => {
		for (const bare of ROUNDABLE) {
			expect(compactObject(expandObject(ID, bare, makeDoc()))).toEqual(bare)
			const zeroed = { ...expandObject(ID, bare, makeDoc()), cornerRadius: 0 }
			expect(compactObject(zeroed as IdealloObject)).toEqual(bare)
		}
	})
})

describe('text style expand/compact', () => {
	/** A text record carrying nothing but the fields every 'T' has */
	function storedText(extra: Partial<StoredText> = {}): StoredText {
		return { t: 'T', xy: [1, 2], wh: [200, 32], ...extra }
	}

	/** A sticky record likewise. Sticky notes gained the four text fields in this change. */
	function storedSticky(extra: Partial<StoredSticky> = {}): StoredSticky {
		return { t: 'S', xy: [1, 2], wh: [200, 200], ...extra }
	}

	function expandText(stored: StoredObject) {
		return expandObject(ID, stored, makeDoc()) as TextBearingObject
	}

	/**
	 * Every record that carries the four text keys, at its bare minimum.
	 *
	 * The absent-ta/va -> defaults -> omitted-again case below is what protects every legacy
	 * document from being rewritten by an unrelated edit, and it now has to hold for the three
	 * shape codes too.
	 */
	const BARE_TEXT_BEARING: StoredObject[] = [
		storedText(),
		storedSticky(),
		{ t: 'R', xy: [1, 2], wh: [30, 40] } as StoredObject,
		{ t: 'E', xy: [1, 2], wh: [30, 40] } as StoredObject,
		{ t: 'P', xy: [1, 2] } as StoredObject
	]

	/*
	 * The unset case is the one that matters: a document written before these fields existed must
	 * expand to the defaults and compact back to ABSENT, not to an explicit 'c'/'m'. Otherwise
	 * every legacy object gets rewritten by the first unrelated edit.
	 */
	it('expands an absent ta/va to the defaults', () => {
		for (const stored of BARE_TEXT_BEARING) {
			const expanded = expandText(stored)
			expect(expanded.textAlign).toBe('center')
			expect(expanded.verticalAlign).toBe('middle')
		}
	})

	it('omits ta/va again when they are at their defaults', () => {
		for (const stored of BARE_TEXT_BEARING) {
			expect(compactObject(expandText(stored))).toEqual(stored)
		}
	})

	// 'l'/'t' were the defaults before text became centre/middle by default, so this is now the
	// case that proves a non-default alignment survives a round trip
	it('round-trips every non-default text style field on a text label', () => {
		const stored = storedText({ ff: 'Roboto', fz: 24, ta: 'l', va: 't' })
		const expanded = expandText(stored)
		expect(expanded.fontFamily).toBe('Roboto')
		expect(expanded.fontSize).toBe(24)
		expect(expanded.textAlign).toBe('left')
		expect(expanded.verticalAlign).toBe('top')
		expect(compactObject(expanded)).toEqual(stored)
	})

	it('round-trips every non-default text style field on a sticky note', () => {
		const stored = storedSticky({ ff: 'Lato', fz: 28, ta: 'j', va: 'b' })
		const expanded = expandText(stored)
		expect(expanded.fontFamily).toBe('Lato')
		expect(expanded.fontSize).toBe(28)
		expect(expanded.textAlign).toBe('justify')
		expect(expanded.verticalAlign).toBe('bottom')
		expect(compactObject(expanded)).toEqual(stored)
	})

	// Guards the deliberate divergence from prezillo, which spells font size `fs`. Renaming `fz`
	// would silently drop the size of every text label in every existing ideallo document.
	it('keeps font size under the key `fz`, not prezillo`s `fs`', () => {
		const compacted = compactObject(expandText(storedText({ fz: 36 }))) as StoredText
		expect(compacted.fz).toBe(36)
		expect(compacted).not.toHaveProperty('fs')
	})

	// The default family is what an absent ff already means, so writing it back would be noise
	it('does not store a font family that equals the default', () => {
		const compacted = compactObject(
			expandText(storedText({ ff: 'system-ui, sans-serif' }))
		) as StoredText
		expect(compacted).not.toHaveProperty('ff')
	})

	it('leaves an unrelated key untouched when only the alignment changes', () => {
		const expanded = expandText(storedText({ ff: 'Roboto', fz: 24 })) as TextObject
		const compacted = compactObject({ ...expanded, textAlign: 'right' })
		expect(compacted).toEqual(storedText({ ff: 'Roboto', fz: 24, ta: 'r' }))
	})
})

/*
 * A polygon is the one shape whose geometry does NOT live in the object record but in the shared
 * `geo` map.
 */
describe('polygon expand/compact', () => {
	/** A live doc with a polygon's flat vertex array under `key` */
	function docWithVertices(key: string, flat: number[]): YIdealloDocument {
		const doc = makeDoc()
		const yArray = new Y.Array<number>()
		doc.geo.set(key, yArray)
		yArray.push(flat)
		return doc
	}

	it('expands the flat geo array into vertex pairs', () => {
		const doc = docWithVertices(ID, [10, 0, 20, 10, 10, 20, 0, 10])
		const expanded = expandObject(ID, { t: 'P', xy: [0, 0] } as StoredObject, doc)
		expect(expanded.type).toBe('polygon')
		expect((expanded as PolygonObject).vertices).toEqual([
			[10, 0],
			[20, 10],
			[10, 20],
			[0, 10]
		])
	})

	it('round-trips a bare polygon byte-identically', () => {
		const doc = docWithVertices(ID, [5, 0, 10, 10, 0, 10])
		const stored = { t: 'P' as const, xy: [1, 2] as [number, number] }
		const expanded = expandObject(ID, stored, doc)
		expect(expanded.style).toEqual(DEFAULT_STYLE)
		expect(compactObject(expanded)).toEqual(stored)
	})

	// A linked copy shares one vertex array, so the key is the gid rather than the object id
	it('reads a linked copy through its gid and stores the gid again', () => {
		const gid = toObjectId('shared-geo')
		const doc = docWithVertices(gid, [0, 0, 4, 0, 2, 4])
		const stored = { t: 'P' as const, xy: [0, 0] as [number, number], gid }
		const expanded = expandObject(ID, stored, doc) as PolygonObject
		expect(expanded.gid).toBe(gid)
		expect(expanded.vertices).toEqual([
			[0, 0],
			[4, 0],
			[2, 4]
		])
		expect(compactObject(expanded)).toEqual(stored)
	})

	/*
	 * A polygon's outline is the ABSOLUTE vertex array in `doc.geo`, so onResizeEnd has to write it
	 * back explicitly - a resize that only touches the object record writes nothing and the shape
	 * snaps back on pointer-up.
	 */
	it('writes scaled vertices back through replaceGeometryPoints on a resize', () => {
		const yDoc = new Y.Doc()
		const doc: YIdealloDocument = {
			o: yDoc.getMap('o'),
			r: yDoc.getArray('r'),
			m: yDoc.getMap('m'),
			txt: yDoc.getMap('txt'),
			geo: yDoc.getMap('geo'),
			paths: yDoc.getMap('paths')
		} as YIdealloDocument
		doc.o.set(ID, { t: 'P', xy: [0, 0] } as StoredObject)
		const yArray = new Y.Array<number>()
		doc.geo.set(ID, yArray)
		yArray.push([5, 0, 10, 10, 0, 10])

		const original = { x: 0, y: 0, width: 10, height: 10 }
		const resized = { x: 100, y: 100, width: 20, height: 30 }
		const before = expandObject(ID, doc.o.get(ID) as StoredObject, doc) as PolygonObject

		replaceGeometryPoints(
			yDoc,
			doc,
			ID,
			scalePointsIntoBounds(before.vertices, original, resized)
		)

		const after = expandObject(ID, doc.o.get(ID) as StoredObject, doc) as PolygonObject
		expect(after.vertices).toEqual([
			[110, 100],
			[120, 130],
			[100, 130]
		])
	})
})

/*
 * The move counterpart of the resize case above: a polygon's `xy` is inert, so a commit that writes
 * only `xy` moves nothing and the shape snaps back on pointer-up.
 */
describe('translateObject', () => {
	/** A live doc plus the id's stored record, ready to move */
	function scene(stored: StoredObject, geo?: number[]) {
		const yDoc = new Y.Doc()
		const doc: YIdealloDocument = {
			o: yDoc.getMap('o'),
			r: yDoc.getArray('r'),
			m: yDoc.getMap('m'),
			txt: yDoc.getMap('txt'),
			geo: yDoc.getMap('geo'),
			paths: yDoc.getMap('paths')
		} as YIdealloDocument
		doc.o.set(ID, stored)
		if (geo) {
			const yArray = new Y.Array<number>()
			doc.geo.set(ID, yArray)
			yArray.push(geo)
		}
		return { yDoc, doc }
	}

	function expanded(doc: YIdealloDocument) {
		return expandObject(ID, doc.o.get(ID) as StoredObject, doc)
	}

	const triangle = { t: 'P', xy: [0, 0] } as StoredObject
	const triangleGeo = [5, 0, 10, 10, 0, 10]

	// The xy assertion is the 0.8.x-peer contract: such a peer positions the shape from xy, so a
	// "simplification" that stopped writing it would make the two peers disagree about where the
	// shape is.
	it('moves a polygon`s vertices, not just its inert xy', () => {
		const { yDoc, doc } = scene(triangle, triangleGeo)
		const before = expanded(doc) as PolygonObject

		translateObject(yDoc, doc, ID, before, 100, 50)

		const after = expanded(doc) as PolygonObject
		expect(after.vertices).toEqual([
			[105, 50],
			[110, 60],
			[100, 60]
		])
		expect((doc.o.get(ID) as StoredObject).xy).toEqual([100, 50])
	})

	// The invariant the whole fix rests on, held at every other polygon write site already
	it('keeps xy equal to the vertex bbox origin', () => {
		const { yDoc, doc } = scene(triangle, triangleGeo)
		translateObject(yDoc, doc, ID, expanded(doc), 100, 50)

		const after = expanded(doc) as PolygonObject
		const bbox = getBoundsFromPoints(after.vertices)
		expect([bbox.x, bbox.y]).toEqual((doc.o.get(ID) as StoredObject).xy)
	})

	it('moves a rect by xy alone', () => {
		const { yDoc, doc } = scene({ t: 'R', xy: [10, 10], wh: [40, 40] } as StoredObject)
		translateObject(yDoc, doc, ID, expanded(doc), 5, -5)

		expect((doc.o.get(ID) as StoredObject).xy).toEqual([15, 5])
		expect(doc.geo.size).toBe(0)
	})

	// A bound terminal is DERIVED from its target: writing it is churn that snaps straight back
	it('leaves a fully bound connector untouched', () => {
		const stored = storedConnector({ so_: 'boxA', eo: 'boxB' })
		const { yDoc, doc } = scene(stored)

		translateObject(yDoc, doc, ID, expanded(doc), 100, 100)

		expect(doc.o.get(ID)).toEqual(stored)
	})

	it('moves only the free terminal of a half-bound connector', () => {
		const { yDoc, doc } = scene(storedConnector({ so_: 'boxA' }))
		translateObject(yDoc, doc, ID, expanded(doc), 7, 3)

		const after = doc.o.get(ID) as StoredConnector
		// xy IS the bound start terminal, so it must not move: the bind-time snapshot stays put
		expect(after.xy).toEqual([10, 20])
		// ...and the free end moves, which is a wh change alone
		expect(after.wh).toEqual([107, 103])
	})

	it('moves only the free terminal of an end-bound connector', () => {
		const { yDoc, doc } = scene(storedConnector({ eo: 'boxB' }))
		translateObject(yDoc, doc, ID, expanded(doc), 7, 3)

		const after = doc.o.get(ID) as StoredConnector
		expect(after.xy).toEqual([17, 23]) // free start moved
		expect(after.wh).toEqual([93, 97]) // bound end stayed at [110, 120]
	})

	// A connector's geometry used to live in `pts`, which no generic xy write
	// could reach, so an unbound one silently refused to move.
	it('moves both terminals of an unbound connector', () => {
		const { yDoc, doc } = scene(storedConnector())
		translateObject(yDoc, doc, ID, expanded(doc), 7, 3)

		const after = expanded(doc) as ConnectorObject
		expect([after.startX, after.startY]).toEqual([17, 23])
		expect([after.endX, after.endY]).toEqual([117, 123])
	})

	// Kills the stale claim that freehand path data is absolute: it is relative to x/y
	it('shifts a freehand`s origin but not its path string', () => {
		const { yDoc, doc } = scene({ t: 'F', xy: [0, 0], wh: [10, 10] } as StoredObject)
		const pathData = 'M 0 0 L 10 10'
		doc.paths.set(ID, pathData)

		translateObject(yDoc, doc, ID, expanded(doc), 30, 40)

		expect(doc.paths.get(ID)).toBe(pathData)
		expect((doc.o.get(ID) as StoredObject).xy).toEqual([30, 40])
	})

	/*
	 * Yjs throws away a NESTED transaction's origin, so a bare yDoc.transact(fn) around the commit
	 * leaves both writes untracked and the move absent from the undo stack entirely. Mirrors the
	 * UndoManager built in useIdealloDocument.
	 */
	it('lands the object and geometry writes in one tracked transaction', () => {
		const { yDoc, doc } = scene(triangle, triangleGeo)
		const undo = new Y.UndoManager([doc.o, doc.geo], {
			trackedOrigins: new Set([yDoc.clientID])
		})
		const before = expanded(doc) as PolygonObject

		yDoc.transact(() => {
			translateObject(yDoc, doc, ID, before, 100, 50)
		}, yDoc.clientID)

		expect(undo.undoStack.length).toBe(1)

		undo.undo()
		expect((expanded(doc) as PolygonObject).vertices).toEqual(before.vertices)
		expect((doc.o.get(ID) as StoredObject).xy).toEqual([0, 0])
	})
})

describe('shape labels', () => {
	/** A doc carrying a Y.Text under `key` - what a labelled shape reads its caption from */
	function docWithText(key: string, text: string): YIdealloDocument {
		const doc = makeDoc()
		const yText = new Y.Text()
		doc.txt.set(key, yText)
		yText.insert(0, text)
		return doc
	}

	it('reads a rect`s label out of the txt map under the object id', () => {
		const doc = docWithText(ID, 'Start')
		// No Y.Text under the id yet: a shape is born without a label
		const unlabelled = expandObject(
			ID,
			{ t: 'R', xy: [0, 0], wh: [100, 60] } as StoredObject,
			makeDoc()
		) as RectObject
		expect(unlabelled.text).toBeUndefined()

		const withText = expandObject(
			ID,
			{ t: 'R', xy: [0, 0], wh: [100, 60] } as StoredObject,
			doc
		) as RectObject
		expect(withText.text).toBe('Start')
	})

	it('round-trips a labelled shape`s tid and text style on every shape code', () => {
		for (const bare of [
			{ t: 'R' as const, xy: [0, 0] as [number, number], wh: [10, 10] as [number, number] },
			{ t: 'E' as const, xy: [0, 0] as [number, number], wh: [10, 10] as [number, number] },
			{ t: 'P' as const, xy: [0, 0] as [number, number] }
		]) {
			const tid = 'shared-txt'
			const stored = { ...bare, tid, ta: 'l' as const, fz: 24 } as StoredObject
			const expanded = expandObject(ID, stored, docWithText(tid, 'Shared'))
			expect((expanded as RectObject).text).toBe('Shared')
			expect((expanded as RectObject).textAlign).toBe('left')
			expect(compactObject(expanded)).toEqual(stored)
		}
	})
})

describe('unknown object types on the read path', () => {
	/** A record written by a peer on a newer build, using a type code this one has never seen */
	const FUTURE: StoredObject = { t: 'Z', xy: [0, 0] } as unknown as StoredObject

	/** The skip is expected to warn; keep the suite output about failures only */
	function quietly<T>(fn: () => T): T {
		const original = console.warn
		console.warn = () => {}
		try {
			return fn()
		} finally {
			console.warn = original
		}
	}

	it('still throws from expandObject - a direct caller is a programming error', () => {
		expect(() => expandObject(ID, FUTURE, makeDoc())).toThrow(/Unknown object type/)
	})

	it('is skipped by tryExpandObject rather than thrown', () => {
		expect(quietly(() => tryExpandObject(ID, FUTURE, makeDoc()))).toBeNull()
	})

	// The whole point: one record a peer cannot parse must cost that object, not the document
	it('leaves the rest of the document readable through getAllObjects', () => {
		const doc = makeDoc()
		doc.o.set('good', { t: 'R', xy: [1, 2], wh: [30, 40] } as StoredObject)
		doc.o.set('future', FUTURE)
		doc.o.set('good2', { t: 'E', xy: [5, 6], wh: [10, 10] } as StoredObject)
		doc.r.push(['good', 'future', 'good2'])

		const objects = quietly(() => getAllObjects(doc))

		expect(objects.map((o) => o.id)).toEqual(['good', 'good2'])
		expect(objects.map((o) => o.type)).toEqual(['rect', 'ellipse'])
	})

	// getObject sits on eight render-time useMemos in app.tsx, and selection survives document
	// updates - so a peer rewriting a SELECTED object with a code this build cannot read used to
	// throw out of a memo and, with no error boundary, blank the canvas.
	it('is undefined from getObject, not a throw', () => {
		const doc = makeDoc()
		doc.o.set(ID, FUTURE)
		expect(quietly(() => getObject(doc, ID))).toBeUndefined()
	})
})

/*
 * An unrecognised sub-code expands to a safe DEFAULT, and updateObject is expand -> merge ->
 * compact - so without carrying the raw code through, the next unrelated local edit would write
 * that default back over a peer's (or a future version's) value. Same contract as wp/bd.
 */
describe('unknown enum sub-codes survive a local edit', () => {
	/** Nudge one unrelated field, which is what makes updateObject rewrite the whole record */
	function nudge(doc: YIdealloDocument, yDoc: Y.Doc, id: string) {
		updateObject(yDoc, doc, toObjectId(id), { x: 999 })
	}

	function docWith(stored: StoredObject): { yDoc: Y.Doc; doc: YIdealloDocument } {
		const yDoc = new Y.Doc()
		const doc = {
			o: yDoc.getMap('o'),
			r: yDoc.getArray('r'),
			m: yDoc.getMap('m'),
			txt: yDoc.getMap('txt'),
			geo: yDoc.getMap('geo'),
			paths: yDoc.getMap('paths')
		} as YIdealloDocument
		doc.o.set(ID, stored)
		doc.r.push([ID])
		return { yDoc, doc }
	}

	it('keeps an unknown routing code', () => {
		const { yDoc, doc } = docWith(
			storedConnector({ rt: 'X' } as unknown as Partial<StoredConnector>)
		)
		// Rendered as the safe default in the meantime
		expect(
			(expandObject(ID, doc.o.get(ID) as StoredObject, doc) as ConnectorObject).routing
		).toBe('straight')
		nudge(doc, yDoc, ID)
		expect((doc.o.get(ID) as StoredConnector).rt).toBe('X')
	})

	it('keeps an unknown arrowhead shape code', () => {
		const { yDoc, doc } = docWith(
			storedConnector({ sar: ['X'] } as unknown as Partial<StoredConnector>)
		)
		expect(
			(expandObject(ID, doc.o.get(ID) as StoredObject, doc) as ConnectorObject).startArrow
				.type
		).toBe('none')
		nudge(doc, yDoc, ID)
		expect((doc.o.get(ID) as StoredConnector).sar).toEqual(['X'])
	})

	it('keeps an unknown text alignment code on a rect', () => {
		const { yDoc, doc } = docWith({
			t: 'R',
			xy: [0, 0],
			wh: [100, 50],
			ta: 'X'
		} as unknown as StoredObject)
		expect((expandObject(ID, doc.o.get(ID) as StoredObject, doc) as RectObject).textAlign).toBe(
			'center'
		)
		nudge(doc, yDoc, ID)
		expect((doc.o.get(ID) as { ta?: string }).ta).toBe('X')
	})

	// `ss` is a base-STYLE code rather than a type-specific one, so it rides the same bag but is
	// restored by compactObject itself rather than by a per-type branch
	it('keeps an unknown stroke style code', () => {
		const { yDoc, doc } = docWith({
			t: 'R',
			xy: [0, 0],
			wh: [100, 50],
			ss: 'W'
		} as unknown as StoredObject)
		const expanded = expandObject(ID, doc.o.get(ID) as StoredObject, doc)
		expect(expanded.style.strokeStyle).toBe('solid')
		expect(expanded.unknownCodes?.ss).toBe('W')
		nudge(doc, yDoc, ID)
		expect((doc.o.get(ID) as { ss?: string }).ss).toBe('W')
	})

	// The style bag and a type-specific bag are the SAME field; expanding one must not drop the other
	it('keeps an unknown stroke style alongside an unknown text alignment', () => {
		const { yDoc, doc } = docWith({
			t: 'R',
			xy: [0, 0],
			wh: [100, 50],
			ss: 'W',
			ta: 'X'
		} as unknown as StoredObject)
		nudge(doc, yDoc, ID)
		const rewritten = doc.o.get(ID) as { ss?: string; ta?: string }
		expect(rewritten.ss).toBe('W')
		expect(rewritten.ta).toBe('X')
	})

	it('lets a real edit replace the unknown stroke style code', () => {
		const { yDoc, doc } = docWith({
			t: 'R',
			xy: [0, 0],
			wh: [100, 50],
			ss: 'W'
		} as unknown as StoredObject)
		updateObject(yDoc, doc, ID, { style: { ...DEFAULT_STYLE, strokeStyle: 'dashed' } })
		expect((doc.o.get(ID) as { ss?: string }).ss).toBe('D')
	})

	// ...but an explicit user change still wins: the code was never understood, not sacred
	it('lets a real edit replace the unknown code', () => {
		const { yDoc, doc } = docWith(
			storedConnector({ rt: 'X' } as unknown as Partial<StoredConnector>)
		)
		updateObject(yDoc, doc, ID, { routing: 'orthogonal' })
		expect((doc.o.get(ID) as StoredConnector).rt).toBe('O')
	})

	/*
	 * ...INCLUDING when the user picks the value that happens to be the default. That compacts to an
	 * ABSENT key, indistinguishable from never-touched by the time applyUnknownCodes runs, so the
	 * code used to be put straight back and the UI offered no other way to clear it.
	 */
	it('lets a real edit clear the unknown code even when it picks the default', () => {
		const { yDoc, doc } = docWith(
			storedConnector({ rt: 'X' } as unknown as Partial<StoredConnector>)
		)
		updateObject(yDoc, doc, ID, { routing: 'straight' })
		expect((doc.o.get(ID) as StoredConnector).rt).toBeUndefined()
	})

	it('lets a real edit clear an unknown stroke style code at the default', () => {
		const { yDoc, doc } = docWith({
			t: 'R',
			xy: [0, 0],
			wh: [100, 50],
			ss: 'W'
		} as unknown as StoredObject)
		updateObject(yDoc, doc, ID, { style: { ...DEFAULT_STYLE, strokeStyle: 'solid' } })
		expect((doc.o.get(ID) as { ss?: string }).ss).toBeUndefined()
	})

	// The retirement is per-FIELD, not per-record: nudging one thing must not discard the rest
	it('keeps the codes an edit did not name', () => {
		const { yDoc, doc } = docWith({
			t: 'R',
			xy: [0, 0],
			wh: [100, 50],
			ss: 'W',
			ta: 'X'
		} as unknown as StoredObject)
		updateObject(yDoc, doc, ID, { textAlign: 'center' })
		const rewritten = doc.o.get(ID) as { ss?: string; ta?: string }
		expect(rewritten.ta).toBeUndefined()
		expect(rewritten.ss).toBe('W')
	})
})

describe('retireUnknownCodes', () => {
	it('retires ss when the update assigns a stroke style', () => {
		expect(retireUnknownCodes({ ss: 'W' }, { style: { strokeStyle: 'solid' } } as never)).toBe(
			undefined
		)
	})

	// `ss` lives under `style`, so a style update that does NOT name it must leave it alone
	it('keeps ss when the update touches another style field', () => {
		expect(retireUnknownCodes({ ss: 'W' }, { style: { strokeWidth: 4 } } as never)).toEqual({
			ss: 'W'
		})
	})

	it.each<[string, Record<string, unknown>]>([
		['rt', { routing: 'straight' }],
		['sa', { startAnchor: 'auto' }],
		['ea', { endAnchor: 'auto' }],
		['sar', { startArrow: { type: 'none' } }],
		['ear', { endArrow: { type: 'none' } }],
		['ta', { textAlign: 'center' }],
		['va', { verticalAlign: 'middle' }]
	])('retires %s when its field is assigned', (code, updates) => {
		expect(retireUnknownCodes({ [code]: 'X' }, updates as never)).toBeUndefined()
	})

	it('retires only the named code and keeps the rest', () => {
		expect(retireUnknownCodes({ rt: 'X', ta: 'Y', va: 'Z' }, { routing: 'straight' })).toEqual({
			ta: 'Y',
			va: 'Z'
		})
	})

	// The common path - an unrelated nudge - must not allocate
	it('returns the same reference when nothing is retired', () => {
		const codes = { rt: 'X' }
		expect(retireUnknownCodes(codes, { x: 999 })).toBe(codes)
		expect(retireUnknownCodes(undefined, { routing: 'straight' })).toBeUndefined()
	})
})

// vim: ts=4

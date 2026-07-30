// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * What happens to a connector when the shapes around it change.
 *
 * The orphan policy is deliberate: deleting a bound shape does NOT delete arrows attached to it.
 * On a whiteboard an arrow is a drawing, and silently destroying the user's drawings because they
 * removed a box is destructive and surprising - Excalidraw and tldraw both avoid it. Instead the
 * arrow survives frozen at its last resolved position, inside the same transaction as the delete,
 * so a single undo restores everything.
 *
 * (A node-and-edge app like a flowchart editor would want the opposite rule, where an edge with
 * no node is meaningless. ideallo is not that app.)
 */

import type * as Y from 'yjs'

import type { ObjectId, YIdealloDocument } from '../crdt/index.js'
import type { ConnectorObject } from '../crdt/runtime-types.js'
import type { StoredConnector, StoredLine, StoredObject } from '../crdt/stored-types.js'
import {
	expandAnchorPoint,
	expandObject,
	storedConnectorTerminals
} from '../crdt/type-converters.js'
import { anchorWorldPoint } from './anchors.js'
import { resolveArrow } from './resolve.js'
import type { ConnectorContext } from './types.js'

type Pt = [number, number]

/**
 * Write both terminals at once.
 *
 * The stored form is start + signed delta (see StoredConnector), so a terminal cannot be moved by
 * poking one index the way `pts` allowed: shifting the start without recomputing `wh` would drag
 * the end along with it. Every caller therefore resolves the pair first and hands it over whole.
 * Fresh arrays, so the record still in doc.o is never mutated underneath a peer.
 *
 * The type code is normalised to 'C' along with dropping `pts`, which is how a legacy 'A' or
 * pre-release 'C' record migrates on its first edit. BOTH halves are required: the 0.8.x reader
 * indexes `pts` unconditionally on a 't: A', so an 'A' record without `pts` is a shape no reader
 * has ever been promised and would crash it. 't: C' is a code 0.8.x never claimed to understand -
 * a clean break rather than a booby trap.
 */
function setTerminals(next: StoredConnector, start: Pt, end: Pt): void {
	next.t = 'C'
	next.xy = roundPair(start)
	next.wh = roundPair([end[0] - start[0], end[1] - start[1]])
	delete next.pts
}

/** Which terminals of an arrow are bound to any of the given objects */
export interface Incidence {
	arrowId: ObjectId
	start: boolean
	end: boolean
}

/**
 * Both codes: 'C' is what we write, 'A' the legacy arrow. A stored 'L' line never had bindings,
 * so it has nothing to freeze until its first edit rewrites it as 'C'.
 */
export function isStoredConnector(stored: StoredObject | undefined): stored is StoredConnector {
	return stored?.t === 'A' || stored?.t === 'C'
}

/**
 * Every code whose geometry is a terminal PAIR, legacy 'L' included. Used by the duplicate path,
 * which must offset both terminals: an 'L' keeps its geometry in `pts` with `xy` inert, so the
 * generic xy offset leaves the copy exactly on top of the original.
 *
 * Distinct from isStoredConnector, which gates the BINDING paths - an 'L' never had bindings.
 */
export function isStoredTerminalPair(
	stored: StoredObject | undefined
): stored is StoredConnector | StoredLine {
	return stored?.t === 'A' || stored?.t === 'C' || stored?.t === 'L'
}

/**
 * Every arrow with a terminal bound to one of `objectIds`.
 * Used to freeze bindings before the targets disappear.
 */
export function findIncidentArrows(
	doc: YIdealloDocument,
	objectIds: Iterable<ObjectId>
): Incidence[] {
	const targets = new Set<string>(objectIds as Iterable<string>)
	if (!targets.size) return []

	const out: Incidence[] = []
	doc.o.forEach((stored, id) => {
		if (!isStoredConnector(stored)) return
		const start = Boolean(stored.so_ && targets.has(stored.so_))
		const end = Boolean(stored.eo && targets.has(stored.eo))
		if (start || end) out.push({ arrowId: id as ObjectId, start, end })
	})
	return out
}

/**
 * Freeze the given terminals at their currently resolved position and clear their bindings.
 *
 * Must be called INSIDE the caller's transaction, before the targets are removed, so the freeze
 * and the delete land as one undo entry and the geometry is still resolvable.
 */
export function freezeBindings(
	doc: YIdealloDocument,
	arrowId: ObjectId,
	which: 'start' | 'end' | 'both',
	ctx: ConnectorContext
): void {
	const stored = doc.o.get(arrowId)
	if (!isStoredConnector(stored)) return

	const next: StoredConnector = { ...stored }
	const freezeStart = which === 'start' || which === 'both'
	const freezeEnd = which === 'end' || which === 'both'

	// Resolve against pre-delete geometry so the arrow stays exactly where it looks right now.
	// This must be the ROUTED endpoint - the outline clip plus standoff - not the bare anchor
	// point, or the arrow would visibly jump inwards to the shape centre as the shape vanishes.
	const [start, end] = resolvedTerminals(doc, arrowId, stored, ctx)
	// The snapshot the record already carries: what an unfrozen (or unresolvable) terminal keeps
	const [snapStart, snapEnd] = storedConnectorTerminals(stored)

	const nextStart = freezeStart && stored.so_ && start ? start : snapStart
	const nextEnd = freezeEnd && stored.eo && end ? end : snapEnd
	setTerminals(next, nextStart, nextEnd)

	if (freezeStart && stored.so_) {
		delete next.so_
		delete next.sa
	}
	if (freezeEnd && stored.eo) {
		delete next.eo
		delete next.ea
	}
	doc.o.set(arrowId, next)
}

/**
 * The two points a bound arrow currently renders at.
 * Falls back to the bare anchor point if the arrow cannot be resolved at all.
 */
function resolvedTerminals(
	doc: YIdealloDocument,
	arrowId: ObjectId,
	stored: StoredConnector,
	ctx: ConnectorContext
): [Pt | null, Pt | null] {
	const expanded = expandObject(arrowId, stored, doc) as ConnectorObject
	const resolved = resolveArrow(expanded, ctx)
	if (resolved.route) {
		const pts = resolved.route.points
		return [pts[0], pts[pts.length - 1]]
	}
	const startShape = stored.so_ ? ctx.get(stored.so_ as ObjectId) : undefined
	const endShape = stored.eo ? ctx.get(stored.eo as ObjectId) : undefined
	return [
		startShape ? anchorWorldPoint(startShape, expandAnchorPoint(stored.sa)) : null,
		endShape ? anchorWorldPoint(endShape, expandAnchorPoint(stored.ea)) : null
	]
}

function roundPair(p: Pt): Pt {
	return [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]
}

/**
 * Bind or unbind one terminal of an arrow.
 *
 * Passing `targetId: null` unbinds: the terminal is frozen at `fallbackPoint` (the drop position,
 * or the last resolved point) and becomes a plain absolute endpoint again. That is the whole
 * unbind gesture - drop on empty canvas - and also what the PropertyBar's "(not connected)" does.
 */
export function bindEndpoint(
	yDoc: Y.Doc,
	doc: YIdealloDocument,
	arrowId: ObjectId,
	which: 'start' | 'end',
	targetId: ObjectId | null,
	anchor?: StoredConnector['sa'],
	fallbackPoint?: [number, number]
): void {
	const stored = doc.o.get(arrowId)
	if (!isStoredConnector(stored)) return

	yDoc.transact(() => {
		const next: StoredConnector = { ...stored }
		const idKey = which === 'start' ? 'so_' : 'eo'
		const anchorKey = which === 'start' ? 'sa' : 'ea'

		// Both terminals go through setTerminals even though only one moves: the stored form is
		// start + signed delta, so moving the start alone is a two-field write.
		const terminals = storedConnectorTerminals(stored)
		if (fallbackPoint) terminals[which === 'start' ? 0 : 1] = [...fallbackPoint]
		setTerminals(next, terminals[0], terminals[1])

		if (targetId) {
			next[idKey] = targetId
			if (anchor === undefined) delete next[anchorKey]
			else next[anchorKey] = anchor
			// The point written above doubles as the snapshot: the fallback if this target ever
			// goes missing
		} else {
			delete next[idKey]
			delete next[anchorKey]
		}
		doc.o.set(arrowId, next)
	}, yDoc.clientID)
}

/**
 * Prepare a duplicated arrow: freeze both bound terminals so the +offset is visible.
 *
 * Without this a duplicated connector would resolve to exactly the same route as the original
 * and the user would see nothing happen.
 *
 * The offset is applied HERE, to both terminals, and the result is the finished record - the
 * caller must not offset `xy` again on top of it. A bound terminal starts from where it currently
 * resolves; a free one from its own stored point, so a half-bound connector keeps its shape.
 *
 * A legacy 'L' is accepted too: it is a terminal pair with an inert `xy`, so the generic offset
 * would leave the copy on top of the original. It has no so_/eo, so the snapshot branch is taken
 * throughout, and setTerminals normalises it to 'C' like any other first edit.
 */
export function freezeStoredArrowForDuplicate(
	doc: YIdealloDocument,
	arrowId: ObjectId,
	stored: StoredConnector | StoredLine,
	ctx: ConnectorContext,
	offsetX: number,
	offsetY: number
): StoredConnector {
	// Normalised up front so resolvedTerminals gets a record it can type, and so setTerminals below
	// only has to fill xy/wh in.
	const next = { ...stored, t: 'C' as const } as StoredConnector
	const [resolvedStart, resolvedEnd] = resolvedTerminals(doc, arrowId, next, ctx)
	const [snapStart, snapEnd] = storedConnectorTerminals(stored)

	// Read the bindings off `next`, not `stored`: they are the same values, but an 'L' has no such
	// fields to narrow against. setTerminals leaves them alone, so the deletes below still see them.
	const start = next.so_ && resolvedStart ? resolvedStart : snapStart
	const end = next.eo && resolvedEnd ? resolvedEnd : snapEnd
	setTerminals(
		next,
		[start[0] + offsetX, start[1] + offsetY],
		[end[0] + offsetX, end[1] + offsetY]
	)

	if (next.so_) {
		delete next.so_
		delete next.sa
	}
	if (next.eo) {
		delete next.eo
		delete next.ea
	}
	return next
}

// vim: ts=4

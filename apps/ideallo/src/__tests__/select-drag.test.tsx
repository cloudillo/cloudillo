// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Moving an object with the select tool is ONE gesture: a press on an unselected object selects it
 * and picks it up. What keeps that from nudging things on every stray click is the screen-space
 * threshold below which a press is still just a click - which is what most of this file is about.
 */

import { act, renderHook } from '@testing-library/react'
import * as React from 'react'
import * as Y from 'yjs'

import { getOrCreateDocument } from '../crdt/document.js'
import type { ObjectId } from '../crdt/ids.js'
import { toObjectId } from '../crdt/ids.js'
import { getObject } from '../crdt/object-ops.js'
import type { StoredObject, YIdealloDocument } from '../crdt/stored-types.js'
import { useSelectHandler } from '../hooks/useSelectHandler.js'

const BOX = toObjectId('box1')

function addStored(doc: YIdealloDocument, id: string, stored: StoredObject) {
	doc.o.set(id, stored)
	doc.r.push([id])
}

/**
 * The hook plus the selection state its caller owns, so `selectObject` really does change what the
 * next render sees - the arming path reads `selectedIds` and the tests assert on it.
 */
function setup(opts: { locked?: boolean; scale?: number; selected?: boolean } = {}) {
	const yDoc = new Y.Doc()
	const doc = getOrCreateDocument(yDoc)
	addStored(doc, BOX, {
		t: 'R',
		xy: [0, 0],
		wh: [100, 100],
		...(opts.locked ? { lk: true } : {})
	})

	let renders = 0
	const view = renderHook(() => {
		renders++
		const [selectedIds, setSelectedIds] = React.useState<Set<ObjectId>>(
			() => new Set(opts.selected ? [BOX] : [])
		)
		const selectObject = React.useCallback((id: ObjectId, addToSelection?: boolean) => {
			setSelectedIds((prev) => (addToSelection ? new Set([...prev, id]) : new Set([id])))
		}, [])
		const clearSelection = React.useCallback(() => setSelectedIds(new Set()), [])
		const handler = useSelectHandler({
			yDoc,
			doc,
			awareness: null,
			selectedIds,
			selectObject,
			clearSelection,
			enabled: true,
			scale: opts.scale
		})
		return { handler, selectedIds }
	})

	const down = (x: number, y: number) => {
		act(() => {
			view.result.current.handler.handlePointerDown(x, y)
		})
	}
	const move = (x: number, y: number) => {
		act(() => {
			view.result.current.handler.handlePointerMove(x, y)
		})
	}
	const up = () => {
		act(() => {
			view.result.current.handler.handlePointerUp()
		})
	}
	/** Where the object actually ended up, straight out of the CRDT */
	const position = (): [number, number] => {
		const obj = getObject(doc, BOX)
		return [obj?.x ?? Number.NaN, obj?.y ?? Number.NaN]
	}

	return { yDoc, doc, view, down, move, up, position, renderCount: () => renders }
}

describe('useSelectHandler drag', () => {
	it('selects and moves an unselected object in a single gesture', () => {
		const { view, down, move, up, position } = setup()

		down(50, 50)
		move(60, 55)
		up()

		expect(view.result.current.selectedIds).toEqual(new Set([BOX]))
		expect(position()).toEqual([10, 5])
	})

	/** The reason the old two-gesture rule existed: a click that wobbles must not displace anything */
	it('treats a press under the threshold as a click, leaving the object where it was', () => {
		const { view, down, move, up, position, doc } = setup()

		down(50, 50)
		move(52, 50)
		up()

		expect(view.result.current.selectedIds).toEqual(new Set([BOX]))
		expect(position()).toEqual([0, 0])
		// Not merely back where it started - nothing was ever written
		expect(doc.o.get(BOX)?.xy).toEqual([0, 0])
	})

	it('still drags an already-selected object', () => {
		const { down, move, up, position } = setup({ selected: true })

		down(50, 50)
		move(70, 50)
		up()

		expect(position()).toEqual([20, 0])
	})

	it('selects a locked object without moving it', () => {
		const { view, down, move, up, position } = setup({ locked: true })

		down(50, 50)
		move(90, 90)
		up()

		expect(view.result.current.selectedIds).toEqual(new Set([BOX]))
		expect(position()).toEqual([0, 0])
	})

	/**
	 * The threshold is in SCREEN pixels, so the same world delta is a drag when zoomed in and a
	 * click when zoomed out - the slop follows the hand, not the document.
	 */
	it('measures the threshold in screen space', () => {
		const zoomedIn = setup({ scale: 4 })
		zoomedIn.down(50, 50)
		zoomedIn.move(52, 50)
		zoomedIn.up()
		expect(zoomedIn.position()).toEqual([2, 0])

		const zoomedOut = setup({ scale: 0.25 })
		zoomedOut.down(50, 50)
		zoomedOut.move(52, 50)
		zoomedOut.up()
		expect(zoomedOut.position()).toEqual([0, 0])
	})

	/**
	 * Every pointer move reaches the handler TWICE - once as the tool move, once from the cursor
	 * broadcast - so the promotion has to be idempotent or the object travels twice as far.
	 */
	it('commits one translation when every move is delivered twice', () => {
		const { down, move, up, position } = setup()

		down(50, 50)
		move(55, 50)
		move(55, 50)
		move(70, 50)
		move(70, 50)
		up()

		expect(position()).toEqual([20, 0])
	})

	/**
	 * The duplicate delivery must also be free. Left unguarded it allocated a fresh DragState per
	 * frame, and the resulting setState-per-passive-flush is what made React log "Maximum update
	 * depth exceeded" after ~50 pointer moves of a continuous drag.
	 */
	it('does not re-render for the duplicate delivery of a move', () => {
		const { view, down, move, up, renderCount } = setup()

		down(50, 50)
		move(70, 50)

		const offset = view.result.current.handler.dragOffset
		const before = renderCount()

		move(70, 50)

		expect(renderCount()).toBe(before)
		expect(view.result.current.handler.dragOffset).toBe(offset)
		expect(offset).toMatchObject({ dx: 20, dy: 0 })

		up()
	})

	/** A gesture that starts exactly where the previous one ended must still move the object */
	it('drags again from the point the last gesture ended', () => {
		const { down, move, up, position } = setup()

		down(50, 50)
		move(70, 50)
		up()
		expect(position()).toEqual([20, 0])

		down(70, 50)
		move(90, 50)
		up()
		expect(position()).toEqual([40, 0])
	})
})

// vim: ts=4

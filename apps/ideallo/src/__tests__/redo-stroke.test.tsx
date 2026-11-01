// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Stroke redo reproduces the undone stroke: the same shape even when Smart Ink was toggled in
 * between, and redoing one stroke keeps the later ones redoable.
 */

import { act, renderHook } from '@testing-library/react'
import * as Y from 'yjs'

import { getOrCreateDocument } from '../crdt/document.js'
import type { StoredObject } from '../crdt/index.js'
import { useDrawingHandler } from '../hooks/useDrawingHandler.js'

const STYLE = { strokeColor: '#000', strokeWidth: 2 }

/** A closed square outline, densely sampled, at (x, y) */
function square(x: number, y: number, size = 100): [number, number][] {
	const pts: [number, number][] = []
	const corners: [number, number][] = [
		[x, y],
		[x + size, y],
		[x + size, y + size],
		[x, y + size],
		[x, y]
	]
	for (let c = 0; c < 4; c++) {
		const [ax, ay] = corners[c]
		const [bx, by] = corners[c + 1]
		for (let i = 0; i < 20; i++)
			pts.push([ax + ((bx - ax) * i) / 20, ay + ((by - ay) * i) / 20])
	}
	pts.push([x, y])
	return pts
}

function setup() {
	const yDoc = new Y.Doc()
	const doc = getOrCreateDocument(yDoc)
	const view = renderHook(
		({ smartInk }) =>
			useDrawingHandler({
				yDoc,
				doc,
				awareness: null,
				currentStyle: STYLE as never,
				smartInk
			}),
		{ initialProps: { smartInk: true } }
	)
	const draw = (pts: [number, number][]) => {
		act(() => view.result.current.handlePointerDown(...pts[0]))
		act(() => {
			for (const p of pts.slice(1)) view.result.current.handlePointerMove(...p)
		})
		act(() => view.result.current.handlePointerUp())
	}
	const types = () => [...doc.o.values()].map((o: StoredObject) => o.t).sort()
	return { view, doc, draw, types }
}

describe('redoStroke', () => {
	it('redoes the same shape after Smart Ink was toggled off', () => {
		const { view, draw, types } = setup()
		draw(square(0, 0))
		const drawn = types()
		expect(drawn).toEqual(['R'])

		act(() => view.result.current.undoStroke())
		expect(types()).toEqual([])
		view.rerender({ smartInk: false })
		act(() => view.result.current.redoStroke())
		expect(types()).toEqual(drawn)
	})

	it('undoes two strokes and redoes both', () => {
		const { view, draw, types } = setup()
		draw(square(0, 0))
		draw(square(300, 0))
		const drawn = types()
		expect(drawn).toEqual(['R', 'R'])

		act(() => view.result.current.undoStroke())
		act(() => view.result.current.undoStroke())
		expect(types()).toEqual([])
		act(() => view.result.current.redoStroke())
		expect(view.result.current.canRedoStroke).toBe(true)
		act(() => view.result.current.redoStroke())
		expect(types()).toEqual(drawn)
		expect(view.result.current.canRedoStroke).toBe(false)
	})
})

// vim: ts=4

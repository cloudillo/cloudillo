// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A pan must not re-render the SCENE - with or without a selection.
 *
 * Canvas holds the matrix in state and re-renders per frame by design: the screen-space fixed layer
 * (selection box, rotation and pivot handles, connector terminals) has to follow. What must not
 * follow is everything inside SvgCanvas' transformed <g>, which is why that lives behind
 * CanvasScene's React.memo. ObjectRenderer is not memoised, so without the boundary a pan with
 * something selected reconciled every object on the board, once per frame.
 *
 * A <Profiler> cannot see the bail-out: React sets the Update flag on a Profiler fiber whenever
 * that fiber is begun, including on the bail-out path, so onRender fires whenever the Profiler's
 * PARENT re-renders - exactly the scenario under test. DOM identity is no help either. What is
 * observable is what the render READS: CanvasScene calls eraserHighlightedIds.has(obj.id) once per
 * object, unconditionally, and nothing else in Canvas touches that Set. So the spy counts scene
 * renders.
 */

import { act, render } from '@testing-library/react'
import * as React from 'react'
import * as Y from 'yjs'

import { Canvas, type CanvasHandle } from '../components/Canvas.js'
import type { Bounds, ObjectId, StoredObject } from '../crdt/index.js'
import { getOrCreateDocument } from '../crdt/index.js'

class StubResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

beforeAll(() => {
	;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver
})

// Stable identities: CanvasScene memoises against these, so a fresh literal per render would be a
// re-render of its own and would hide the very thing under test
const NO_SELECTION: Set<ObjectId> = new Set()
const NO_PRESENCE = new Map()
const OBJECTS: Record<string, StoredObject> = { box: { t: 'R', xy: [0, 0], wh: [100, 100] } }
const ORDER = ['box']
const BOX_BOUNDS: Bounds = { x: 0, y: 0, width: 100, height: 100 }
const OBJECT_COUNT = Object.keys(OBJECTS).length

function setup(initialSelection: Bounds | null) {
	const yDoc = new Y.Doc()
	const doc = getOrCreateDocument(yDoc)
	const canvasRef = React.createRef<CanvasHandle>()

	// Patched on the INSTANCE, so the Set keeps its identity and React.memo still bails - only the
	// reads are counted. A plain assignment rather than jest.spyOn: the `jest` global is not
	// injected under ESM and @jest/globals is not a dependency of this package.
	const highlighted = new Set<ObjectId>()
	const realHas = Set.prototype.has.bind(highlighted)
	let reads = 0
	highlighted.has = (id: ObjectId) => {
		reads++
		return realHas(id)
	}

	let scaleChanges = 0
	const onScaleChange = () => {
		scaleChanges++
	}

	function Harness({ selectionBounds }: { selectionBounds: Bounds | null }) {
		return (
			// setViewport resolves the viewport through `.ideallo-app svg`, as the real app does
			<div className="ideallo-app">
				<Canvas
					ref={canvasRef}
					doc={doc}
					objects={OBJECTS}
					order={ORDER}
					activeStroke={null}
					shapePreview={null}
					remotePresence={NO_PRESENCE}
					activeTool="select"
					selectedIds={NO_SELECTION}
					selectionBounds={selectionBounds}
					selectedObjectRotation={0}
					selectedObjectPivotX={0.5}
					selectedObjectPivotY={0.5}
					dragOffset={null}
					eraserHighlightedIds={highlighted}
					onScaleChange={onScaleChange}
					onPointerDown={() => {}}
					onPointerMove={() => {}}
					onPointerUp={() => {}}
				/>
			</div>
		)
	}

	const view = render(<Harness selectionBounds={initialSelection} />)

	/** One read per object per scene render */
	const sceneRenders = () => reads / OBJECT_COUNT

	/** Scene renders caused by one matrix change */
	const pan = (tx: number) => {
		reads = 0
		act(() => {
			// jsdom measures the viewport as 0x0, so this lands the matrix at [1,0,0,1,-tx,0]:
			// a pure translation, with the scale untouched
			canvasRef.current?.setViewport(tx, 0, 1)
		})
		return sceneRenders()
	}

	const zoom = (factor: number) => {
		reads = 0
		act(() => {
			canvasRef.current?.setViewport(0, 0, factor)
		})
		return sceneRenders()
	}

	/** The SelectionBox's own rect - the overlay geometry the fixed layer draws in screen space */
	const overlayBox = () => {
		const rect = view.container.querySelector('rect[stroke="#0066ff"]')
		return rect ? [Number(rect.getAttribute('x')), Number(rect.getAttribute('y'))] : null
	}

	return { view, pan, zoom, overlayBox, scaleChanges: () => scaleChanges, Harness }
}

describe('Canvas pan cost', () => {
	it('does not re-render the scene when panning with an empty selection', () => {
		const { pan } = setup(null)

		expect([pan(200), pan(400), pan(600)]).toEqual([0, 0, 0])
	})

	it('does not re-render the scene when panning WITH a selection', () => {
		const { pan, overlayBox } = setup(BOX_BOUNDS)

		// Canvas itself re-renders here - the fixed layer has to follow the matrix - but the memo
		// boundary keeps every ObjectRenderer out of it
		expect(pan(200)).toBe(0)
		// The box's world origin is (0, 0), so the screen x is the pan's translation
		expect(overlayBox()).toEqual([-200, 0])
	})

	// A zoom is not a pan: stroke widths and the eraser cursor divide by the scale. Also the
	// control that keeps the spy honest.
	it('does re-render the scene on a zoom', () => {
		const { zoom } = setup(null)

		expect(zoom(2)).toBe(1)
	})

	/**
	 * The overlay is placed against the matrix the pan reached, not the one it started from.
	 */
	it('places the overlay correctly when a selection arrives after a pan', () => {
		const { view, pan, overlayBox, Harness } = setup(null)

		pan(200)
		expect(overlayBox()).toBeNull()

		act(() => {
			view.rerender(<Harness selectionBounds={BOX_BOUNDS} />)
		})

		expect(overlayBox()).toEqual([-200, 0])
	})

	// Gated on the scale: app.tsx answers onScaleChange with a setState of the value it holds
	it('reports a scale change only on a zoom', () => {
		const { pan, zoom, scaleChanges } = setup(null)

		pan(200)
		expect(scaleChanges()).toBe(0)

		zoom(2)
		expect(scaleChanges()).toBe(1)
	})
})

// vim: ts=4

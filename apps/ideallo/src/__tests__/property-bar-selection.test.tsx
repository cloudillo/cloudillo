// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The property bar reads its selection from a RENDER-PHASE value.
 *
 * Every control group is gated on `caps`, which is derived from the resolved selection, and only
 * the `…` overflow group is unconditional. So an empty `selectedObjects` does not degrade the bar,
 * it empties it - which is what a commit-time ref (useLatestRef) getter produced on the one render
 * where a one-shot tool creates an object and selects it in the same batch: the getter still held
 * the previous revision, the new id was not in it, and the freshly drawn shape got a bar with
 * nothing on it but `…`.
 *
 * Rendered rather than unit-tested because the bug was entirely in WHEN the objects were read.
 */

import { act, render, screen } from '@testing-library/react'
import * as React from 'react'
import * as Y from 'yjs'

import { PropertyBar } from '../components/PropertyBar.js'
import { getOrCreateDocument } from '../crdt/document.js'
import type {
	Bounds,
	NewObjectInput,
	ObjectId,
	StoredObject,
	YIdealloDocument
} from '../crdt/index.js'
import { addObject, getAllResolvedObjects } from '../crdt/index.js'
import type { CurrentStyle } from '../hooks/useIdealloDocument.js'

/*
 * jsdom implements neither matchMedia nor ResizeObserver, and both run during the bar's first
 * render. This one REPORTS a size rather than doing nothing: until it has one the bar renders
 * `visibility: hidden`, and role queries skip a hidden subtree - every control would look absent
 * for a reason that has nothing to do with the selection.
 */
class SizedResizeObserver {
	constructor(private readonly cb: ResizeObserverCallback) {}
	observe(el: Element) {
		const entry = {
			target: el,
			borderBoxSize: [{ inlineSize: 240, blockSize: 40 }]
		} as unknown as ResizeObserverEntry
		this.cb([entry], this as unknown as ResizeObserver)
	}
	unobserve() {}
	disconnect() {}
}

function setDesktopViewport() {
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false
	})) as unknown as typeof window.matchMedia
}

/** The bar renders nothing without one - it has nowhere to put itself */
const SCREEN_BOUNDS: Bounds = { x: 100, y: 100, width: 200, height: 120 }

const CURRENT_STYLE: CurrentStyle = {
	strokeColor: '#000000',
	fillColor: '#ffffff',
	strokeWidth: 2
}

const STYLE = {
	strokeColor: '#000000',
	fillColor: '#ffffff',
	strokeWidth: 2,
	strokeStyle: 'solid' as const,
	opacity: 1
}

const RECT: NewObjectInput = {
	type: 'rect',
	x: 10,
	y: 10,
	width: 100,
	height: 60,
	rotation: 0,
	pivotX: 0.5,
	pivotY: 0.5,
	locked: false,
	style: STYLE
}

const TEXT: NewObjectInput = {
	type: 'text',
	x: 10,
	y: 10,
	width: 80,
	height: 20,
	rotation: 0,
	pivotX: 0.5,
	pivotY: 0.5,
	locked: false,
	style: STYLE,
	text: 'hello'
}

const CONNECTOR: NewObjectInput = {
	type: 'connector',
	x: 0,
	y: 0,
	startX: 0,
	startY: 0,
	endX: 100,
	endY: 100,
	routing: 'straight',
	startArrow: { type: 'none' },
	endArrow: { type: 'arrow' },
	rotation: 0,
	pivotX: 0.5,
	pivotY: 0.5,
	locked: false,
	style: STYLE
}

interface Api {
	yDoc: Y.Doc
	doc: YIdealloDocument
	/** Create an object and select it in ONE batched update, the way a one-shot tool does */
	createAndSelect(input: NewObjectInput): ObjectId
	select(ids: ObjectId[]): void
}

function renderBar(): Api {
	const yDoc = new Y.Doc()
	const doc = getOrCreateDocument(yDoc)
	// Both methods are replaced by the mount below; these only make the object well-typed
	const api: Api = {
		yDoc,
		doc,
		createAndSelect: () => {
			throw new Error('harness not mounted')
		},
		select: () => {}
	}

	function Harness() {
		// Stands in for the useY snapshot: one bump per document revision
		const [revision, setRevision] = React.useState(0)
		const [selectedIds, setSelectedIds] = React.useState<Set<ObjectId>>(() => new Set())

		// Mirrors app.tsx's shared resolve pass, memoised on the same revision the objects are
		const resolvedObjects = React.useMemo(() => getAllResolvedObjects(doc), [revision])
		const objects = React.useMemo(
			() => doc.o.toJSON() as Record<string, StoredObject>,
			[revision]
		)

		// Reassigned every render so the closures below never capture a stale setter
		React.useEffect(() => {
			api.createAndSelect = (input) => {
				const id = addObject(yDoc, doc, input)
				// Both setters in one caller, so React batches them into the single render the
				// bug lived in - the objects and the selection arrive together
				setRevision((r) => r + 1)
				setSelectedIds(new Set([id]))
				return id
			}
			api.select = (ids) => setSelectedIds(new Set(ids))
		})

		return (
			<PropertyBar
				yDoc={yDoc}
				doc={doc}
				objects={objects}
				selectedIds={selectedIds}
				screenBounds={SCREEN_BOUNDS}
				currentStyle={CURRENT_STYLE}
				resolvedObjects={resolvedObjects}
			/>
		)
	}

	render(<Harness />)
	return api
}

const trigger = (name: string) => screen.queryByRole('button', { name })

beforeEach(() => {
	setDesktopViewport()
	globalThis.ResizeObserver = SizedResizeObserver as unknown as typeof globalThis.ResizeObserver
})

describe('a freshly created object', () => {
	it('gets its controls on the first frame, not just the overflow menu', () => {
		const api = renderBar()
		act(() => {
			api.createAndSelect(RECT)
		})

		expect(trigger('More')).not.toBeNull()
		expect(trigger('Stroke')).not.toBeNull()
		expect(trigger('Fill')).not.toBeNull()
	})

	// Nothing invalidated the memo afterwards, so the empty result used to stick until the
	// selection changed again - the "click away and re-select" workaround
	it('keeps them across a re-render that changes nothing', () => {
		const api = renderBar()
		act(() => {
			api.createAndSelect(RECT)
		})
		act(() => {
			window.dispatchEvent(new Event('resize'))
		})

		expect(trigger('Stroke')).not.toBeNull()
	})
})

describe('caps follow the resolved selection', () => {
	it('titles a text label’s swatch Colour and offers no fill', () => {
		const api = renderBar()
		act(() => {
			api.createAndSelect(TEXT)
		})

		expect(trigger('Colour')).not.toBeNull()
		expect(trigger('Stroke')).toBeNull()
		expect(trigger('Fill')).toBeNull()
	})

	it('gives a connector the routing buttons and the arrowhead swatch', () => {
		const api = renderBar()
		act(() => {
			api.createAndSelect(CONNECTOR)
		})

		expect(trigger('Straight')).not.toBeNull()
		expect(trigger('Curved')).not.toBeNull()
		expect(trigger('Elbow')).not.toBeNull()
		expect(trigger('Arrowheads')).not.toBeNull()
	})

	// The intersection, not the union: a rect and a text label share only the stroke
	it('intersects a mixed selection', () => {
		const api = renderBar()
		const ids: ObjectId[] = []
		act(() => {
			ids.push(api.createAndSelect(RECT))
		})
		act(() => {
			ids.push(api.createAndSelect(TEXT))
		})
		act(() => {
			api.select(ids)
		})

		expect(trigger('Stroke')).not.toBeNull()
		expect(trigger('Fill')).toBeNull()
	})
})

// vim: ts=4

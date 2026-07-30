// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The connector endpoint drag, which owns three rules that are only ever exercised by a real
 * gesture: the gesture is single-pointer, a plain click must not unbind, and every abort path drops
 * the drag without committing.
 *
 * The pointer events are hand-rolled objects rather than real ones: jsdom has no PointerEvent, and
 * the hook reads only `pointerId`/`clientX`/`clientY`/`altKey` off them anyway.
 */

import { act, renderHook } from '@testing-library/react'
import type * as React from 'react'

import { toObjectId } from '../crdt/ids.js'
import type { IdealloObject } from '../crdt/runtime-types.js'
import {
	type Terminal,
	type UseConnectorEndpointDragOptions,
	useConnectorEndpointDrag
} from '../hooks/useConnectorEndpointDrag.js'

type Pt = [number, number]

interface Calls {
	dragStart: Terminal[]
	dragEnd: { terminal: Terminal; point: Pt }[]
	cancel: number
	drag: number
}

function setup(over: Partial<UseConnectorEndpointDragOptions> = {}) {
	const calls: Calls = { dragStart: [], dragEnd: [], cancel: 0, drag: 0 }
	const options: UseConnectorEndpointDragOptions = {
		arrowId: toObjectId('arrow1'),
		// 1:1, so a screen delta reads as the same world delta in the assertions
		translateTo: (x, y) => [x, y] as Pt,
		// Empty: every drop lands on bare canvas, which keeps `bind` null throughout and leaves
		// these tests about the GESTURE rather than about hit testing
		getObjects: () => [] as IdealloObject[],
		scale: 1,
		onDragStart: (terminal) => {
			calls.dragStart.push(terminal)
		},
		onDrag: () => {
			calls.drag++
		},
		onDragEnd: (terminal, _bind, point) => {
			calls.dragEnd.push({ terminal, point })
		},
		onCancel: () => {
			calls.cancel++
		},
		...over
	}
	const view = renderHook(() => useConnectorEndpointDrag(options))
	return { calls, view }
}

/** Only the fields the hook actually reads, plus the two no-op methods it calls */
function downOn(pointerId = 1, clientX = 0, clientY = 0): React.PointerEvent {
	return {
		pointerId,
		clientX,
		clientY,
		altKey: false,
		currentTarget: { setPointerCapture: () => {} },
		stopPropagation: () => {},
		preventDefault: () => {}
	} as unknown as React.PointerEvent
}

function fire(type: string, over: Record<string, unknown> = {}) {
	const evt = new Event(type)
	Object.assign(evt, { pointerId: 1, clientX: 0, clientY: 0, altKey: false }, over)
	act(() => {
		window.dispatchEvent(evt)
	})
}

describe('useConnectorEndpointDrag', () => {
	it('reports the drag immediately, so the caller can gate the select handler', () => {
		const { calls, view } = setup()
		act(() => {
			view.result.current.handlePointerDown('start', downOn())
		})
		expect(calls.dragStart).toEqual(['start'])
		expect(view.result.current.isDragging).toBe(true)
	})

	/**
	 * The single-pointer contract. Touching the OTHER handle mid-drag used to overwrite `terminal`
	 * and the owning pointer id, which left the first drag with neither an onDragEnd nor an
	 * onCancel and swapped the caller's preview out from under it.
	 */
	it('ignores a second touch on the other handle mid-drag', () => {
		const { calls, view } = setup()
		act(() => {
			view.result.current.handlePointerDown('start', downOn(1))
		})
		fire('pointermove', { pointerId: 1, clientX: 40, clientY: 0 })

		act(() => {
			view.result.current.handlePointerDown('end', downOn(2))
		})
		expect(view.result.current.dragState?.terminal).toBe('start')
		expect(calls.dragStart).toEqual(['start'])

		// The first pointer still owns the gesture, so it is the one that commits it
		fire('pointerup', { pointerId: 1, clientX: 40, clientY: 0 })
		expect(calls.cancel).toBe(0)
		expect(calls.dragEnd).toEqual([{ terminal: 'start', point: [40, 0] }])
	})

	it('ignores a move or a release from a foreign pointer', () => {
		const { calls, view } = setup()
		act(() => {
			view.result.current.handlePointerDown('start', downOn(1))
		})
		fire('pointermove', { pointerId: 9, clientX: 40, clientY: 0 })
		expect(calls.drag).toBe(0)

		fire('pointerup', { pointerId: 9, clientX: 40, clientY: 0 })
		expect(calls.dragEnd).toEqual([])
		expect(calls.cancel).toBe(0)
		expect(view.result.current.isDragging).toBe(true)
	})

	/**
	 * A plain click resolved `bind` at the terminal point, which sits standoffGap OUTSIDE the
	 * outline and can fall past the tolerance at zoom - so clicking an endpoint silently unbound it.
	 */
	it('treats a release under the threshold as a click, not an unbind', () => {
		const { calls, view } = setup()
		act(() => {
			view.result.current.handlePointerDown('start', downOn(1, 100, 100))
		})
		fire('pointermove', { clientX: 102, clientY: 100 })
		fire('pointerup', { clientX: 102, clientY: 100 })

		expect(calls.drag).toBe(0)
		expect(calls.dragEnd).toEqual([])
		expect(calls.cancel).toBe(1)
		expect(view.result.current.isDragging).toBe(false)
	})

	it('commits once the pointer has travelled past the threshold', () => {
		const { calls, view } = setup()
		act(() => {
			view.result.current.handlePointerDown('end', downOn(1, 100, 100))
		})
		fire('pointermove', { clientX: 140, clientY: 100 })
		expect(calls.drag).toBe(1)

		fire('pointerup', { clientX: 140, clientY: 100 })
		expect(calls.cancel).toBe(0)
		expect(calls.dragEnd).toEqual([{ terminal: 'end', point: [140, 100] }])
	})

	it.each([
		['Escape', () => fire('keydown', { key: 'Escape' })],
		['pointercancel', () => fire('pointercancel')],
		['a lost capture', () => fire('lostpointercapture')]
	])('drops the drag without committing on %s', (_label, abort) => {
		const { calls, view } = setup()
		act(() => {
			view.result.current.handlePointerDown('start', downOn())
		})
		fire('pointermove', { clientX: 40, clientY: 0 })

		abort()
		expect(calls.cancel).toBe(1)
		expect(calls.dragEnd).toEqual([])
		expect(view.result.current.isDragging).toBe(false)
	})

	it('does nothing while disabled or without an arrow', () => {
		const off = setup({ disabled: true })
		act(() => {
			off.view.result.current.handlePointerDown('start', downOn())
		})
		expect(off.view.result.current.isDragging).toBe(false)

		const detached = setup({ arrowId: null })
		act(() => {
			detached.view.result.current.handlePointerDown('start', downOn())
		})
		expect(detached.view.result.current.isDragging).toBe(false)
	})
})

// vim: ts=4

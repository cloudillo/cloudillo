// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Slides rail helpers: `SortableList` final index → `reorderView` insert-before index, who is on
 * which slide, and presentation navigation (start slide, "New slide after").
 */

import * as Y from 'yjs'

import type { PresenceEntry } from '@cloudillo/core'

import { initialPresentedIndex } from '../components/PresentationMode'
import { deleteFocusTarget, slideKeyAction } from '../components/SlidesRail'
import { splitViewOccupants } from '../components/SlideThumbnail'
import {
	createViewAfter,
	getOrCreateDocument,
	toViewId,
	updateView,
	type ViewId,
	type ViewNode
} from '../crdt'
import { toInsertIndex } from '../crdt/view-ops'

describe('toInsertIndex', () => {
	it('inserts one past the target on forward moves', () => {
		expect(toInsertIndex(1, 3)).toBe(4)
		expect(toInsertIndex(0, 1)).toBe(2)
	})

	it('keeps the target on backward moves', () => {
		expect(toInsertIndex(3, 1)).toBe(1)
		expect(toInsertIndex(2, 0)).toBe(0)
	})

	it('keeps the index when it does not move', () => {
		expect(toInsertIndex(2, 2)).toBe(2)
	})
})

describe('updateView', () => {
	it('keeps the template link when toggling skip', () => {
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc)
		const id = toViewId('V1')
		doc.v.set(id, { name: 'Slide', x: 0, y: 0, width: 1920, height: 1080, tpl: 'T1' })
		updateView(yDoc, doc, id, { hidden: true })
		expect(doc.v.get(id)).toMatchObject({ tpl: 'T1', hidden: true })
	})
})

function entry(
	connId: string,
	state: Record<string, unknown>,
	extra?: Partial<PresenceEntry>
): PresenceEntry {
	return {
		connId,
		name: connId,
		idTag: connId,
		self: false,
		connections: 1,
		hue: 0,
		state,
		...extra
	}
}

describe('splitViewOccupants', () => {
	it('skips self and non-string view ids', () => {
		const map = splitViewOccupants([
			entry('me', { view: 'V1' }, { self: true }),
			entry('x', { view: 42 }),
			entry('y', { presenting: { viewId: 7 } })
		])
		expect(map.size).toBe(0)
	})

	it('puts a presenter on the presented slide, not the edited one', () => {
		const map = splitViewOccupants([entry('a', { view: 'V1', presenting: { viewId: 'V2' } })])
		expect(map.has(toViewId('V1'))).toBe(false)
		expect(map.get(toViewId('V2'))?.presenters.map((u) => u.connId)).toEqual(['a'])
	})

	it('shows someone presenting in one tab and editing in another only as presenter', () => {
		const map = splitViewOccupants([
			entry('a1', { presenting: { viewId: 'V1' } }, { idTag: 'alice' }),
			entry('a2', { view: 'V1' }, { idTag: 'alice' }),
			entry('b', { view: 'V1' })
		])
		const slot = map.get(toViewId('V1'))!
		expect(slot.presenters.map((u) => u.idTag)).toEqual(['alice'])
		expect(slot.others.map((u) => u.idTag)).toEqual(['b'])
	})

	it('dedupes per person', () => {
		const map = splitViewOccupants([
			entry('a1', { view: 'V1' }, { idTag: 'alice' }),
			entry('a2', { view: 'V1' }, { idTag: 'alice' })
		])
		const others = map.get(toViewId('V1'))!.others
		expect(others).toHaveLength(1)
		expect(others[0].connections).toBe(2)
	})
})

describe('initialPresentedIndex', () => {
	const order = ['A', 'B', 'C', 'D']
	// B and D skipped
	const views = ['A', 'C'].map((id) => ({ id: toViewId(id) }) as ViewNode)

	it('starts on a presented slide', () => {
		expect(initialPresentedIndex(order, views, toViewId('C'))).toBe(1)
	})

	it('moves off a skipped slide to the next presented one', () => {
		expect(initialPresentedIndex(order, views, toViewId('B'))).toBe(1)
	})

	it('falls back to the first after a skipped final slide', () => {
		expect(initialPresentedIndex(order, views, toViewId('D'))).toBe(0)
	})

	it('starts at the first without an initial slide', () => {
		expect(initialPresentedIndex(order, views)).toBe(0)
		expect(initialPresentedIndex(order, views, null)).toBe(0)
	})
})

describe('slideKeyAction', () => {
	const key = (
		k: string,
		mods: Partial<Record<'ctrl' | 'meta' | 'alt' | 'shift', boolean>> = {}
	) => ({
		key: k,
		ctrlKey: !!mods.ctrl,
		metaKey: !!mods.meta,
		altKey: !!mods.alt,
		shiftKey: !!mods.shift
	})

	it('moves with Alt+Up/Down; the range check is left to the caller', () => {
		expect(slideKeyAction(key('ArrowUp', { alt: true }), 2, 4, true)).toEqual({
			type: 'move',
			to: 1
		})
		expect(slideKeyAction(key('ArrowDown', { alt: true }), 2, 4, true)).toEqual({
			type: 'move',
			to: 3
		})
		expect(slideKeyAction(key('ArrowUp', { alt: true }), 0, 4, true)).toEqual({
			type: 'move',
			to: -1
		})
		expect(slideKeyAction(key('ArrowDown', { alt: true }), 3, 4, true)).toEqual({
			type: 'move',
			to: 4
		})
	})

	it('duplicates with Ctrl+D and Meta+D', () => {
		expect(slideKeyAction(key('d', { ctrl: true }), 1, 4, true)).toEqual({ type: 'duplicate' })
		expect(slideKeyAction(key('D', { meta: true }), 1, 4, true)).toEqual({ type: 'duplicate' })
		expect(slideKeyAction(key('d', { ctrl: true, shift: true }), 1, 4, true)).toBeUndefined()
	})

	it('deletes only when editable', () => {
		expect(slideKeyAction(key('Delete'), 1, 4, true)).toEqual({ type: 'delete' })
		expect(slideKeyAction(key('Delete'), 1, 4, false)).toBeUndefined()
	})

	it('navigates with plain arrows, Home and End', () => {
		expect(slideKeyAction(key('ArrowUp'), 2, 4, false)).toEqual({ type: 'go', index: 1 })
		expect(slideKeyAction(key('ArrowDown'), 2, 4, false)).toEqual({ type: 'go', index: 3 })
		expect(slideKeyAction(key('Home'), 2, 4, false)).toEqual({ type: 'go', index: 0 })
		expect(slideKeyAction(key('End'), 2, 4, false)).toEqual({ type: 'go', index: 3 })
	})

	it('ignores edit keys when read-only', () => {
		expect(slideKeyAction(key('ArrowUp', { alt: true }), 2, 4, false)).toBeUndefined()
		expect(slideKeyAction(key('d', { ctrl: true }), 2, 4, false)).toBeUndefined()
		expect(slideKeyAction(key('x'), 2, 4, true)).toBeUndefined()
	})
})

describe('deleteFocusTarget', () => {
	const views = ['A', 'B', 'C'].map((id) => ({ id: toViewId(id) }) as ViewNode)
	const [a, b, c] = views.map((v) => v.id)

	it('moves to the previous slide when deleting the active one', () => {
		expect(deleteFocusTarget(views, 1, b, b)).toBe(a)
		expect(deleteFocusTarget(views, 2, c, c)).toBe(b)
	})

	it('moves to the next slide when deleting the active first one', () => {
		expect(deleteFocusTarget(views, 0, a, a)).toBe(b)
	})

	it('uses a neighbour when nothing is active', () => {
		expect(deleteFocusTarget(views, 0, a, null)).toBe(b)
	})

	it('keeps the active slide when deleting another', () => {
		expect(deleteFocusTarget(views, 0, a, c)).toBe(c)
		expect(deleteFocusTarget(views, 1, b, a)).toBe(a)
		expect(deleteFocusTarget(views, 2, c, a)).toBe(a)
	})

	it('has nothing to focus after the only slide', () => {
		expect(deleteFocusTarget([views[0]], 0, a, a)).toBeNull()
	})
})

describe('createViewAfter', () => {
	it('inserts right after the source and re-applies its template', () => {
		const yDoc = new Y.Doc()
		const doc = getOrCreateDocument(yDoc)
		const tplId = 'TPL1'
		doc.tpl.set(tplId, { n: 'Template', w: 1920, h: 1080 })
		const first = doc.vo.get(0) as ViewId
		doc.v.set(first, { ...doc.v.get(first)!, tpl: tplId })
		const second = createViewAfter(yDoc, doc, first)
		const third = createViewAfter(yDoc, doc, first)

		expect(doc.vo.toArray().slice(0, 3)).toEqual([first, third, second])
		expect(doc.v.get(third)?.tpl).toBe(tplId)
	})
})

// vim: ts=4

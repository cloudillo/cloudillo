// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Group events in the message timeline: which rows are events, the page split and
 * merge, and where each event lands relative to the loaded window.
 */

import type { ActionView } from '@cloudillo/types'

import { splitPage } from '../apps/messages/hooks/useMessages.js'
import { isConvEvent, mergeEvents, placeEvents } from '../apps/messages/utils.js'

function a(
	actionId: string,
	type: string,
	createdAt: number,
	over: Partial<ActionView> = {}
): ActionView {
	return {
		actionId,
		type,
		createdAt,
		issuer: { idTag: 'x.test', name: 'X' },
		...over
	} as ActionView
}

const ids = (rows: ActionView[]) => rows.map((r) => r.actionId)

describe('isConvEvent', () => {
	it.each([
		['CONV', undefined, undefined, true],
		['CONV', 'UPD', undefined, true],
		['SUBS', undefined, 'A', true],
		['SUBS', undefined, 'D', true],
		['SUBS', undefined, 'C', false],
		['SUBS', 'DEL', undefined, true],
		['SUBS', 'ROLE', undefined, true],
		['SUBS', 'UPD', undefined, false],
		['INVT', undefined, undefined, true],
		['INVT', 'DEL', undefined, true],
		['PIN', undefined, undefined, true],
		['PIN', 'DEL', undefined, true],
		['MSG', 'TEXT', undefined, false],
		['RCPT', undefined, undefined, false]
	])('%s:%s (%s) → %s', (type, subType, status, want) => {
		expect(isConvEvent(a('e', type, 1, { subType, status } as Partial<ActionView>))).toBe(want)
	})
})

describe('splitPage / mergeEvents', () => {
	it('splits messages from events and drops MSG:UPD/DEL', () => {
		const page = splitPage([
			a('m1', 'MSG', 3, { subType: 'TEXT' }),
			a('u1', 'MSG', 3, { subType: 'UPD' }),
			a('s1', 'SUBS', 2),
			a('k1', 'SUBS', 2, { status: 'C' } as Partial<ActionView>)
		])
		expect(ids(page.msgs)).toEqual(['m1'])
		expect(ids(page.events)).toEqual(['s1'])
	})

	it('dedupes by id and sorts ascending', () => {
		const merged = mergeEvents([a('e2', 'PIN', 20)], [a('e3', 'PIN', 30), a('e1', 'CONV', 10)])
		expect(ids(mergeEvents(merged, [a('e2', 'PIN', 20)]))).toEqual(['e1', 'e2', 'e3'])
	})
})

describe('placeEvents', () => {
	const msgs = [a('m1', 'MSG', 10), a('m2', 'MSG', 20)]
	const early = a('early', 'SUBS', 5)
	const mid = a('mid', 'SUBS', 15)
	const tie = a('tie', 'PIN', 20)
	const late = a('late', 'SUBS', 25)

	it('places an event before the first message not older than it', () => {
		const p = placeEvents(msgs, [mid, tie], { hasOlder: false, atLive: true })
		expect(p.before.map(ids)).toEqual([[], ['mid', 'tie']])
		expect(p.after).toEqual([])
	})

	it('shows events before the window only when nothing older is left', () => {
		expect(placeEvents(msgs, [early], { hasOlder: true, atLive: true }).before[0]).toEqual([])
		expect(
			ids(placeEvents(msgs, [early], { hasOlder: false, atLive: true }).before[0])
		).toEqual(['early'])
	})

	it('shows trailing events only at the live edge', () => {
		expect(placeEvents(msgs, [late], { hasOlder: false, atLive: false }).after).toEqual([])
		expect(ids(placeEvents(msgs, [late], { hasOlder: false, atLive: true }).after)).toEqual([
			'late'
		])
	})

	it('puts everything after when there are no messages', () => {
		const p = placeEvents([], [early, late], { hasOlder: true, atLive: false })
		expect(ids(p.after)).toEqual(['early', 'late'])
	})
})

// vim: ts=4

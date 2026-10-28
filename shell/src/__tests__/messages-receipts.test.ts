// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Read receipts (`useReceipts` pure helpers) and message grouping (`groupMessages`).
 */

import type { ActionView } from '@cloudillo/types'

import {
	isConvRcpt,
	mergeReceipts,
	type Receipt,
	receiptPoints,
	seenBy,
	toReceipt
} from '../apps/messages/hooks/useReceipts.js'
import type { ActionEvt } from '../apps/messages/types.js'
import { groupMessages } from '../apps/messages/utils.js'

const ME = 'me.test'
const PEER = 'peer.test'
const OTHER = 'other.test'

function rcpt(over: Partial<ActionView>): ActionView {
	return {
		actionId: 'r1',
		type: 'RCPT',
		issuer: { idTag: PEER },
		content: '100',
		createdAt: 100,
		...over
	} as ActionView
}

function msg(actionId: string, issuer: string, createdAt: number, tempId?: string): ActionEvt {
	return {
		actionId,
		type: 'MSG',
		issuer: { idTag: issuer },
		createdAt,
		content: 'x',
		tempId
	} as unknown as ActionEvt
}

function receipt(idTag: string, readAt: number): Receipt {
	return { profile: { idTag } as Receipt['profile'], readAt }
}

describe('isConvRcpt', () => {
	it('matches a group RCPT by subject', () => {
		expect(isConvRcpt(rcpt({ subject: 'c~1' }), 'c~1', true)).toBe(true)
		expect(isConvRcpt(rcpt({ subject: 'c~2' }), 'c~1', true)).toBe(false)
	})

	it('matches a DM RCPT with no subject from or to the peer', () => {
		expect(isConvRcpt(rcpt({}), PEER, false)).toBe(true)
		expect(
			isConvRcpt(
				rcpt({
					issuer: { idTag: ME } as ActionView['issuer'],
					audience: { idTag: PEER } as ActionView['audience']
				}),
				PEER,
				false
			)
		).toBe(true)
		expect(
			isConvRcpt(rcpt({ issuer: { idTag: OTHER } as ActionView['issuer'] }), PEER, false)
		).toBe(false)
		expect(isConvRcpt(rcpt({ subject: 'c~1' }), PEER, false)).toBe(false)
	})

	it('rejects non-RCPT actions', () => {
		expect(isConvRcpt(rcpt({ type: 'MSG', subject: 'c~1' }), 'c~1', true)).toBe(false)
	})
})

describe('toReceipt', () => {
	it('parses a positive epoch', () => {
		expect(toReceipt(rcpt({ content: '123' }))?.readAt).toBe(123)
	})

	it('drops non-numeric or non-positive content', () => {
		expect(toReceipt(rcpt({ content: 'abc' }))).toBeUndefined()
		expect(toReceipt(rcpt({ content: '0' }))).toBeUndefined()
		expect(toReceipt(rcpt({ content: '-5' }))).toBeUndefined()
	})
})

describe('receiptPoints', () => {
	const msgs = [
		msg('m1', ME, 10),
		msg('m2', PEER, 20),
		msg('m3', ME, 30),
		msg('m4', ME, 40),
		msg('tmp~1', ME, 15, 'tmp~1')
	]

	it('returns an empty map for empty inputs', () => {
		expect(receiptPoints([], [receipt(PEER, 50)], ME, false)).toEqual({ byMsg: new Map() })
		expect(receiptPoints(msgs, [], ME, true)).toEqual({ byMsg: new Map() })
		expect(receiptPoints(undefined, [receipt(PEER, 50)], ME, true).byMsg.size).toBe(0)
	})

	it('DM: seenId is the newest own non-temp message at or before the max readAt', () => {
		// readAt 35 → m3 (own, 30); m4 is later; tmp is skipped
		expect(receiptPoints(msgs, [receipt(PEER, 25), receipt(PEER, 35)], ME, false).seenId).toBe(
			'm3'
		)
		// readAt 25 → m2 is the peer's, so m1
		expect(receiptPoints(msgs, [receipt(PEER, 25)], ME, false).seenId).toBe('m1')
		// before every own message
		expect(receiptPoints(msgs, [receipt(PEER, 5)], ME, false).seenId).toBeUndefined()
	})

	it('group: readers are grouped by the message they reached, temp rows skipped', () => {
		const { byMsg } = receiptPoints(
			[msg('m1', ME, 10), msg('m2', PEER, 20), msg('tmp~1', ME, 25, 'tmp~1')],
			[receipt(PEER, 22), receipt(OTHER, 30), receipt('x.test', 12)],
			ME,
			true
		)
		expect(byMsg.get('m2')?.map((p) => p.idTag)).toEqual([PEER, OTHER])
		expect(byMsg.get('m1')?.map((p) => p.idTag)).toEqual(['x.test'])
		expect(byMsg.has('tmp~1')).toBe(false)
	})

	it('a reconciled own row (tempId kept, real actionId) counts; a pending one does not', () => {
		const sent = msg('real', ME, 30, 't1')
		const pending = msg('t2', ME, 35, 't2')
		expect(receiptPoints([sent, pending], [receipt(PEER, 40)], ME, false).seenId).toBe('real')
		const { byMsg } = receiptPoints([sent, pending], [receipt(PEER, 40)], ME, true)
		expect(byMsg.get('real')?.map((p) => p.idTag)).toEqual([PEER])
		expect(byMsg.has('t2')).toBe(false)
	})
})

describe('seenBy', () => {
	it('lists readers past the message, the author excluded', () => {
		const m = msg('m1', PEER, 20)
		const r = [receipt(PEER, 50), receipt(OTHER, 20), receipt('late.test', 19)]
		expect(seenBy(m, r).map((p) => p.idTag)).toEqual([OTHER])
	})
})

describe('mergeReceipts', () => {
	it('keeps one receipt per reader, the newer readAt winning in either order', () => {
		const old = [receipt(PEER, 10), receipt(OTHER, 30)]
		const live = [receipt(PEER, 20)]
		for (const merged of [mergeReceipts(old, live), mergeReceipts(live, old)]) {
			const byId = Object.fromEntries(merged.map((r) => [r.profile.idTag, r.readAt]))
			expect(byId).toEqual({ [PEER]: 20, [OTHER]: 30 })
		}
	})
})

describe('groupMessages', () => {
	// Local noon, so ±minutes never cross midnight
	const noon = new Date(2026, 0, 10, 12).getTime() / 1000

	it('starts a group on the first message, a sender change, a >5min gap and a new day', () => {
		const g = groupMessages([
			msg('a', ME, noon),
			msg('b', ME, noon + 60), // same run
			msg('c', PEER, noon + 120), // sender change
			msg('d', PEER, noon + 120 + 301), // gap
			msg('e', PEER, noon + 120 + 301 + 86400) // next day (gap too)
		])
		expect(g.map((x) => x.showSender)).toEqual([true, false, true, true, true])
		expect(g.map((x) => x.showTimestamp)).toEqual([true, false, true, true, true])
		expect(g.map((x) => x.newDay)).toEqual([true, false, false, false, true])
	})

	it('a day change within the gap window still starts a new group', () => {
		const late = new Date(2026, 0, 10, 23, 59, 30).getTime() / 1000
		const g = groupMessages([msg('a', ME, late), msg('b', ME, late + 60)])
		expect(g[1]).toMatchObject({ showSender: true, newDay: true })
	})
})

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Message-window bookkeeping: optimistic-row reconciliation, the jump-window merge,
 * the read-marker ceilings, and a live MSG applied to the inbox row.
 */

import type { ActionView } from '@cloudillo/types'

import { applyLiveMsg } from '../apps/messages/hooks/useConversationUnread.js'
import {
	defaultSubType,
	findNewestIncomingTs,
	findNewestListTs,
	keepPending,
	markFailed,
	markSent,
	mergeWindow
} from '../apps/messages/hooks/useMessages.js'
import type { ActionEvt, Conversation } from '../apps/messages/types.js'

const ME = 'me.test'
const PEER = 'peer.test'

function m(actionId: string, createdAt: number, over: Partial<ActionEvt> = {}): ActionEvt {
	return {
		actionId,
		type: 'MSG',
		subType: 'TEXT',
		content: actionId,
		issuer: { idTag: PEER },
		createdAt,
		...over
	} as ActionEvt
}

describe('defaultSubType', () => {
	it('defaults to IMG with attachments, TEXT without, and keeps an explicit one', () => {
		expect(defaultSubType(undefined, ['f1'])).toBe('IMG')
		expect(defaultSubType(undefined, [])).toBe('TEXT')
		expect(defaultSubType('FILE', ['f1'])).toBe('FILE')
	})
})

describe('markSent / markFailed', () => {
	const tmp = m('tmp1', 5, { tempId: 'tmp1', sendStatus: 'sending' })

	it('gives the optimistic row its real id', () => {
		const out = markSent([m('a', 1), tmp], 'tmp1', 'real1')
		expect(out?.map((x) => x.actionId)).toEqual(['a', 'real1'])
		expect(out?.[1].sendStatus).toBe('sent')
	})

	it('drops a WS echo that already landed under the real id', () => {
		const out = markSent([tmp, m('real1', 5)], 'tmp1', 'real1')
		expect(out?.map((x) => x.actionId)).toEqual(['real1'])
		expect(out?.[0].tempId).toBe('tmp1')
	})

	it('leaves the list alone for an unknown tempId', () => {
		const list = [m('a', 1), tmp]
		expect(markSent(list, 'nope', 'real1')).toEqual(list)
		expect(markFailed(list, 'nope')).toEqual(list)
	})

	it('flags the row as failed', () => {
		expect(markFailed([tmp], 'tmp1')?.[0].sendStatus).toBe('failed')
	})

	it('does not fail a row an echo already reconciled', () => {
		const echoed = { ...tmp, actionId: 'real1', sendStatus: 'sent' as const }
		expect(markFailed([echoed], 'tmp1')?.[0].sendStatus).toBe('sent')
	})
})

describe('keepPending', () => {
	const failed = m('tmp1', 5, { tempId: 'tmp1', sendStatus: 'failed' })
	const sent = m('real2', 6, { tempId: 'tmp2', sendStatus: 'sent' })

	it('appends unreconciled rows and skips reconciled ones', () => {
		const out = keepPending([m('a', 1)], [m('b', 2), failed, sent])
		expect(out.map((x) => x.actionId)).toEqual(['a', 'tmp1'])
	})

	it('does not duplicate a row already in the fresh list', () => {
		const out = keepPending([m('a', 1), failed], [failed])
		expect(out.map((x) => x.actionId)).toEqual(['a', 'tmp1'])
		expect(keepPending([m('a', 1)], undefined).map((x) => x.actionId)).toEqual(['a'])
	})
})

describe('mergeWindow', () => {
	it('dedupes the shared second and stays ascending', () => {
		const older = [m('a', 1), m('b', 2), m('c', 2)]
		const newer = [m('b', 2), m('c', 2), m('d', 3)]
		expect(mergeWindow(older, newer).map((x) => x.actionId)).toEqual(['a', 'b', 'c', 'd'])
	})
})

describe('read-marker ceilings', () => {
	const list = [m('a', 1), m('b', 2), m('c', 3, { issuer: { idTag: ME } })]

	it('findNewestIncomingTs skips own messages', () => {
		expect(findNewestIncomingTs(list, ME)).toBe(2)
		expect(findNewestIncomingTs([list[2]], ME)).toBe(0)
	})

	it('findNewestListTs includes own messages', () => {
		expect(findNewestListTs(list)).toBe(3)
		expect(findNewestListTs([])).toBe(0)
	})
})

describe('applyLiveMsg', () => {
	const dm = (id: string, at: number, unreadCount = 0) =>
		({ id, type: 'direct', profiles: [], lastMessageAt: at, unreadCount }) as Conversation
	const inbox = [dm('new.test', 20), dm(PEER, 10, 1)]
	const msg = (issuer: string, audience: string, at: number) =>
		({
			actionId: `m${at}`,
			type: 'MSG',
			issuer: { idTag: issuer },
			audience: { idTag: audience },
			createdAt: at
		}) as ActionView

	it("bumps a known DM's preview, order and unread", () => {
		const out = applyLiveMsg(inbox, msg(PEER, ME, 30), ME)
		expect(out?.map((c) => c.id)).toEqual([PEER, 'new.test'])
		expect(out?.[0]).toMatchObject({ lastMessageAt: 30, unreadCount: 2 })
		expect(out?.[0].lastMessage?.actionId).toBe('m30')
	})

	it('updates the preview of an own message without unread', () => {
		const out = applyLiveMsg(inbox, msg(ME, PEER, 30), ME)
		expect(out?.[0]).toMatchObject({ id: PEER, lastMessageAt: 30, unreadCount: 1 })
	})

	it("does not count a message seen at the open conversation's live edge", () => {
		const out = applyLiveMsg(inbox, msg(PEER, ME, 30), ME, PEER)
		expect(out?.[0]).toMatchObject({ id: PEER, lastMessageAt: 30, unreadCount: 1 })
	})

	it('returns undefined for an unknown conversation', () => {
		expect(applyLiveMsg(inbox, msg('stranger.test', ME, 30), ME)).toBeUndefined()
	})
})

// vim: ts=4

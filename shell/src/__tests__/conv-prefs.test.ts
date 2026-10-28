// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Optimistic reader-state prefs on a conversation (`applyConvPatch`) and the
 * Conversation fields derived from a reader-state row (`readerStateFields`).
 */

import type { ReaderState } from '@cloudillo/types'

import { readerStateFields } from '../apps/messages/hooks/useConversations.js'
import { applyConvPatch } from '../apps/messages/hooks/useConvPrefs.js'
import type { Conversation } from '../apps/messages/types.js'

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-02T00:00:00.000Z'
const T2 = '2026-01-03T00:00:00.000Z'
const FUTURE = '2999-01-01T00:00:00.000Z'

function conv(rs: Partial<ReaderState>): Conversation {
	const readerState = { kind: 'A:CONV', ref: 'c1', createdAt: T0, ...rs } as ReaderState
	return {
		id: 'c1',
		type: 'group',
		...readerStateFields(readerState)
	} as Conversation
}

describe('readerStateFields', () => {
	it('maps notify to a mute level, ignoring an expired notifyUntil', () => {
		expect(readerStateFields(conv({ notify: 'T' }).readerState).muteLevel).toBe('mentions')
		expect(
			readerStateFields(conv({ notify: 'M', notifyUntil: FUTURE }).readerState)
		).toMatchObject({ muteLevel: 'none' })
		expect(
			readerStateFields(conv({ notify: 'M', notifyUntil: T0 }).readerState).muteLevel
		).toBeUndefined()
	})

	it('counts the unread flag as one and flags a mention past readAt', () => {
		const f = readerStateFields(
			conv({ unreadFlag: true, mentionedAt: T2, readAt: T1 }).readerState
		)
		expect(f.unreadCount).toBe(1)
		expect(f.mentioned).toBe(true)
	})
})

describe('applyConvPatch', () => {
	it('mutes and unmutes', () => {
		const muted = applyConvPatch(conv({}), { notify: 'M', notifyUntil: FUTURE })
		expect(muted.muteLevel).toBe('none')
		const unmuted = applyConvPatch(muted, { notify: null, notifyUntil: null })
		expect(unmuted.muteLevel).toBeUndefined()
		expect(unmuted.readerState).not.toHaveProperty('notify')
	})

	it('mark read past the last message clears the count and the flag', () => {
		const c = conv({ lastAt: T1, unread: 3, unreadFlag: true, readAt: T0 })
		const read = applyConvPatch(c, { readAt: T2 })
		expect(read.unreadCount).toBe(0)
		expect(read.readerState?.unreadFlag).toBeUndefined()
	})

	it('ignores a readAt that moves backwards', () => {
		const c = conv({ lastAt: T2, unread: 2, readAt: T1 })
		const same = applyConvPatch(c, { readAt: T0 })
		expect(same.readerState?.readAt).toBe(T1)
		expect(same.unreadCount).toBe(2)
	})
})

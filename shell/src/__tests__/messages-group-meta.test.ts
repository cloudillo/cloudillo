// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Group conversation metadata: active members from SUBS, pending invites from INVT,
 * and the Conversation fields derived from the CONV action.
 */

import type { ActionView } from '@cloudillo/types'

import { buildGroupMeta } from '../apps/messages/hooks/useMessages.js'

const t = (k: string) => k

const conv = (over: Partial<ActionView> = {}) =>
	({
		actionId: 'a1~conv',
		type: 'CONV',
		issuer: { idTag: 'owner' },
		content: { name: 'G' },
		...over
	}) as ActionView

const subs = (id: string, idTag: string, over: Partial<ActionView> = {}) =>
	({ actionId: id, type: 'SUBS', issuer: { idTag }, createdAt: 1, ...over }) as ActionView

const invt = (id: string, idTag: string, over: Partial<ActionView> = {}) =>
	({
		actionId: id,
		type: 'INVT',
		issuer: { idTag: 'owner' },
		audience: { idTag },
		createdAt: 2,
		...over
	}) as ActionView

const ids = (r: ReturnType<typeof buildGroupMeta>) =>
	r.members.map((m) => `${m.profile.idTag}:${m.status}`)

describe('buildGroupMeta', () => {
	it('leaves a SUBS:DEL out of members, profiles and memberCount', () => {
		const r = buildGroupMeta(
			conv(),
			[subs('s1', 'alice'), subs('s2', 'bob', { subType: 'DEL' })],
			[],
			t
		)
		expect(ids(r)).toEqual(['alice:active'])
		expect(r.conversation.profiles.map((p) => p.idTag)).toEqual(['alice'])
		expect(r.conversation.memberCount).toBe(1)
	})

	it('does not list an INVT:DEL as invited', () => {
		const r = buildGroupMeta(conv(), [], [invt('i1', 'carol', { subType: 'DEL' })], t)
		expect(r.members).toEqual([])
	})

	it('drops the INVT of an active member, keeps one whose only SUBS is a DEL', () => {
		const r = buildGroupMeta(
			conv(),
			[subs('s1', 'alice'), subs('s2', 'bob', { subType: 'DEL' })],
			[invt('i1', 'alice'), invt('i2', 'bob')],
			t
		)
		expect(ids(r)).toEqual(['alice:active', 'bob:invited'])
	})

	it('defaults the role to member and lists active before invited', () => {
		const r = buildGroupMeta(
			conv(),
			[
				subs('s1', 'alice', { x: { role: 'admin' } } as Partial<ActionView>),
				subs('s2', 'bob')
			],
			[invt('i1', 'carol')],
			t
		)
		expect(r.members.map((m) => [m.profile.idTag, m.status, m.role])).toEqual([
			['alice', 'active', 'admin'],
			['bob', 'active', 'member'],
			['carol', 'invited', 'member']
		])
	})

	it('derives the conversation fields', () => {
		const plain = buildGroupMeta(conv(), [], [], t).conversation
		expect(plain.communityTag).toBeUndefined()
		expect(plain.name).toBe('G')
		expect(plain.isOpen).toBe(false)

		const community = buildGroupMeta(
			conv({
				issuer: { idTag: 'comm', type: 'community' } as ActionView['issuer'],
				content: {},
				flags: 'O'
			}),
			[],
			[],
			t
		).conversation
		expect(community.communityTag).toBe('comm')
		expect(community.ownerTag).toBe('comm')
		expect(community.name).toBe('Unnamed Group')
		expect(community.isOpen).toBe(true)
	})
})

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { FileAccess, FileAccessPerson } from '@cloudillo/core'
import type { TFunction } from 'i18next'

import { accessAudienceText, sortPeople } from '../apps/files/components/AccessList.js'

const t = ((k: string, o?: Record<string, unknown>) =>
	k.replace(/{{(\w+)}}/g, (_, n) => String(o?.[n]))) as unknown as TFunction

const ME = 'me.example'
const access = (audience: FileAccess['audience'], owner = 'comm.example'): FileAccess =>
	({ owner: { idTag: owner }, audience, people: [], canManage: false }) as unknown as FileAccess
const text = (audience: FileAccess['audience'], owner?: string) =>
	accessAudienceText(t, access(audience, owner), 'Comm', ME)
const room = (channel: Partial<NonNullable<FileAccess['audience']['channel']>>) =>
	text({ kind: 'room', channel: { name: 'r', closed: false, ...channel } })

describe('accessAudienceText', () => {
	it('owner: "Only you" for the caller, "Only the owner" otherwise', () => {
		expect(text({ kind: 'owner' }, ME)).toEqual({
			label: 'Only you',
			long: 'Only you',
			ownerOnly: true
		})
		expect(text({ kind: 'owner' }).label).toBe('Only the owner')
	})

	it('shared', () => {
		expect(text({ kind: 'shared' })).toMatchObject({
			label: 'Shared with you',
			ownerOnly: false
		})
	})

	it('members, and a room the caller cannot enter, read as all members', () => {
		const all = { label: 'All members', long: 'All Comm members', ownerOnly: false }
		expect(text({ kind: 'members' })).toEqual(all)
		expect(text({ kind: 'room' })).toEqual(all)
	})

	it('closed room, with and without a member count', () => {
		expect(room({ closed: true, memberCount: 12 })).toMatchObject({
			label: 'Invited · 12',
			long: 'Invited members · 12 people'
		})
		expect(room({ closed: true })).toMatchObject({
			label: 'Invited members',
			long: 'Invited members'
		})
	})

	it('open room: a role floor gets the short label, no floor reads as everyone', () => {
		expect(room({ minRole: 'moderator' }).label).toBe('Mods+')
		expect(room({})).toMatchObject({ label: 'Everyone', long: 'Everyone who can see Comm' })
	})

	it('a visibility level', () => {
		expect(text({ kind: 'public' })).toEqual({
			label: 'Public',
			long: 'Public',
			ownerOnly: false
		})
		expect(text({ kind: 'secondDegree' }).label).toBe('Connections of connections')
	})
})

describe('sortPeople', () => {
	const p = (idTag: string, permission: string): FileAccessPerson => ({
		idTag,
		permission,
		inherited: false
	})

	it('orders A > W > C > R and keeps the server order within a rank', () => {
		const sorted = sortPeople([
			p('r1', 'R'),
			p('w1', 'W'),
			p('a1', 'A'),
			p('c1', 'C'),
			p('w2', 'W'),
			p('r2', 'R')
		])
		expect(sorted.map((x) => x.idTag)).toEqual(['a1', 'w1', 'w2', 'c1', 'r1', 'r2'])
	})
})

// vim: ts=4

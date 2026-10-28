// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Group roles: the community-role mapping, the effective role (higher of SUBS and mapped),
 * and the user's own role in a group.
 */

import type { Profile } from '@cloudillo/types'

import type { ConversationMember, MemberRole, MemberStatus } from '../apps/messages/types.js'
import { communityMappedRole, effectiveRole, myGroupRole } from '../apps/messages/types.js'

function member(
	idTag: string,
	role: MemberRole,
	status: MemberStatus = 'active'
): ConversationMember {
	return { profile: { idTag } as Profile, role, status, actionId: `subs-${idTag}` }
}

describe('communityMappedRole', () => {
	it('maps leader to admin and moderator to moderator', () => {
		expect(communityMappedRole(['leader'])).toBe('admin')
		expect(communityMappedRole(['moderator'])).toBe('moderator')
		expect(communityMappedRole(['contributor', 'leader'])).toBe('admin')
	})

	it('maps lower or missing roles to nothing', () => {
		expect(communityMappedRole(['contributor'])).toBeUndefined()
		expect(communityMappedRole([])).toBeUndefined()
		expect(communityMappedRole(undefined)).toBeUndefined()
	})
})

describe('effectiveRole', () => {
	it('takes the higher of the two in both directions', () => {
		expect(effectiveRole('member', ['moderator'])).toBe('moderator')
		expect(effectiveRole('admin', ['moderator'])).toBe('admin')
		expect(effectiveRole('observer', ['leader'])).toBe('admin')
	})

	it('falls back to whichever side is present', () => {
		expect(effectiveRole('member')).toBe('member')
		expect(effectiveRole('member', ['contributor'])).toBe('member')
		expect(effectiveRole(undefined, ['moderator'])).toBe('moderator')
		expect(effectiveRole(undefined, ['contributor'])).toBeUndefined()
	})
})

describe('myGroupRole', () => {
	const members = [member('alice', 'moderator'), member('bob', 'admin', 'invited')]

	it('makes the CONV owner admin', () => {
		expect(myGroupRole({ ownerTag: 'owner', members, me: 'owner' })).toBe('admin')
	})

	it('uses the active SUBS role only', () => {
		expect(myGroupRole({ ownerTag: 'owner', members, me: 'alice' })).toBe('moderator')
		expect(myGroupRole({ ownerTag: 'owner', members, me: 'bob' })).toBeUndefined()
	})

	it('has no role once left, even as owner or community leader', () => {
		expect(myGroupRole({ ownerTag: 'owner', members, me: 'owner', left: true })).toBeUndefined()
		expect(
			myGroupRole({ members, me: 'alice', communityRoles: ['leader'], left: true })
		).toBeUndefined()
	})

	it('is raised by the community role', () => {
		expect(
			myGroupRole({ ownerTag: 'owner', members, me: 'alice', communityRoles: ['leader'] })
		).toBe('admin')
		expect(
			myGroupRole({ ownerTag: 'owner', members, me: 'carol', communityRoles: ['moderator'] })
		).toBe('moderator')
	})

	it('never treats a missing owner as a match', () => {
		expect(myGroupRole({ members })).toBeUndefined()
	})
})

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Room, partnership and admin-page helpers.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs): the
 * helpers live in component modules.
 */

import { type ActionView, ROLE_LEVELS, roleLevel } from '@cloudillo/types'
import type { TFunction } from 'i18next'

import { collapsePartnerships } from '../apps/feed/PartnershipCard.js'
import { canAdminContext } from '../context/hooks.js'
import type { ActiveContext } from '../context/types.js'
import { inviteMessage } from '../notifications/NotificationItem.js'
import { floorText } from '../profile/role-labels.js'
import { allowedPages } from '../settings/index.js'
import { rangeSentences } from '../settings/partners.js'

const t = ((s: string) => s) as unknown as TFunction

function action(fields: Partial<ActionView>): ActionView {
	return {
		actionId: 'a1',
		type: 'POST',
		issuer: { idTag: 'x.tld' },
		createdAt: 0,
		...fields
	} as ActionView
}

function community(roles: string[]): ActiveContext {
	return { idTag: 'c.tld', type: 'community', name: 'C', roles, permissions: [] }
}

describe('collapsePartnerships', () => {
	it('keeps the first PTNR of each unordered pair, and every other action', () => {
		const ab = action({ actionId: '1', type: 'PTNR', issuer: { idTag: 'a' }, subject: '@b' })
		const ba = action({ actionId: '2', type: 'PTNR', issuer: { idTag: 'b' }, subject: '@a' })
		const ac = action({ actionId: '3', type: 'PTNR', issuer: { idTag: 'a' }, subject: '@c' })
		const post = action({ actionId: '4' })
		expect(collapsePartnerships([ab, post, ba, ac]).map((a) => a.actionId)).toEqual([
			'1',
			'4',
			'3'
		])
	})
})

describe('canAdminContext / allowedPages', () => {
	it('a leader may open every admin page', () => {
		const c = community(['leader'])
		expect(canAdminContext(c, 'me.tld')).toBe(true)
		expect(allowedPages(c, 'me.tld')).toEqual([
			'general',
			'privacy',
			'files',
			'rooms',
			'partners',
			'site'
		])
	})

	it('a moderator may open rooms only', () => {
		const c = community(['moderator'])
		expect(canAdminContext(c, 'me.tld')).toBe(true)
		expect(canAdminContext(c, 'me.tld', 'rooms')).toBe(true)
		expect(canAdminContext(c, 'me.tld', 'general')).toBe(false)
		expect(allowedPages(c, 'me.tld')).toEqual(['rooms'])
	})

	it('a member may open nothing', () => {
		const c = community(['contributor'])
		expect(canAdminContext(c, 'me.tld')).toBe(false)
		expect(allowedPages(c, 'me.tld')).toEqual([])
	})

	it('at home, the personal pages — no community-only ones', () => {
		const pages = allowedPages(undefined, 'me.tld')
		expect(pages).toContain('security')
		expect(pages).not.toContain('partners')
		expect(pages).not.toContain('general')
	})
})

describe('floorText', () => {
	it('names the role as a floor, members-only for anything else', () => {
		expect(floorText(t, 'supporter')).toBe('Supporters and above')
		expect(floorText(t, 'leader')).toBe('Leaders only')
		expect(floorText(t, 'bogus')).toBe('Members only')
	})
})

describe('inviteMessage', () => {
	it('takes string content as is', () => {
		expect(inviteMessage(action({ type: 'CONN', content: 'hi' }))).toBe('hi')
	})

	it('reads the CONN { msg, roles } object', () => {
		expect(
			inviteMessage(action({ type: 'CONN', content: { msg: 'hi', roles: ['supporter'] } }))
		).toBe('hi')
		expect(inviteMessage(action({ type: 'CONN', content: { roles: [] } }))).toBeUndefined()
	})

	it('ignores malformed CONN content', () => {
		expect(inviteMessage(action({ type: 'CONN', content: { msg: 42 } }))).toBeUndefined()
		expect(inviteMessage(action({ type: 'CONN', content: 7 }))).toBeUndefined()
	})

	it('reads an invitation message', () => {
		expect(inviteMessage(action({ type: 'INVT', content: { message: 'join' } }))).toBe('join')
	})
})

describe('rangeSentences', () => {
	// Interpolates `{{x}}`, so the sentence shows which roles went where
	const ti = ((s: string, o?: Record<string, string>) =>
		s.replace(/\{\{(\w+)\}\}/g, (_, k) => o?.[k] ?? '')) as unknown as TFunction

	it('names a single role on its own', () => {
		expect(rangeSentences(ti, { leader: 'contributor' })).toEqual([
			'Leaders join here as Contributor.'
		])
	})

	it('says "and above" for a range reaching leader', () => {
		expect(rangeSentences(ti, { supporter: 'supporter' })).toEqual([
			'Supporters and above join here as Supporter.'
		])
	})

	it('names both ends of a middle range', () => {
		expect(rangeSentences(ti, { contributor: 'supporter', leader: 'contributor' })).toEqual([
			'Contributors to Moderators join here as Supporter.',
			'Leaders join here as Contributor.'
		])
	})
})

describe('roleLevel', () => {
	it('is the highest known role, unknown ones counting 0', () => {
		expect(roleLevel(['supporter', 'moderator', 'bogus'])).toBe(ROLE_LEVELS.moderator)
		expect(roleLevel(['bogus'])).toBe(0)
		expect(roleLevel(undefined)).toBe(0)
	})

	it('never drops below the floor', () => {
		expect(roleLevel(undefined, ROLE_LEVELS.follower)).toBe(ROLE_LEVELS.follower)
		expect(roleLevel(['leader'], ROLE_LEVELS.follower)).toBe(ROLE_LEVELS.leader)
	})
})

// vim: ts=4

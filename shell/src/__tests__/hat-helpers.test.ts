// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { contextKey, FetchError, splitContextKey } from '@cloudillo/core'

import { isRefusal, recoverHattedAuth, registerHattedRecovery } from '../context/hat-recovery.js'
import {
	effectiveHatRoles,
	formatHatRoles,
	hatRoleRanges,
	parseHatRoles
} from '../settings/hat-roles.js'

describe('parseHatRoles / formatHatRoles', () => {
	it('parses a map, trimming and dropping incomplete pairs and unknown keys', () => {
		expect(parseHatRoles(' leader:contributor, supporter : follower,bad,:x')).toEqual({
			leader: 'contributor',
			supporter: 'follower'
		})
		expect(parseHatRoles('follower:follower,bogus:follower')).toEqual({ follower: 'follower' })
	})

	it('treats null and empty as no mapping', () => {
		expect(parseHatRoles(null)).toEqual({})
		expect(parseHatRoles('')).toEqual({})
	})

	it('formats in peer-role order, dropping unknown keys and "no access"', () => {
		expect(
			formatHatRoles({
				leader: 'contributor',
				bogus: 'follower',
				moderator: '',
				supporter: 'follower'
			})
		).toBe('supporter:follower,leader:contributor')
	})

	it('round-trips', () => {
		const s = 'supporter:follower,contributor:supporter,leader:contributor'
		expect(formatHatRoles(parseHatRoles(s))).toBe(s)
	})

	it('round-trips server keys below supporter', () => {
		const s = 'follower:follower,leader:contributor'
		expect(formatHatRoles(parseHatRoles(s))).toBe(s)
	})
})

describe('effectiveHatRoles / hatRoleRanges', () => {
	it('falls back to the closest lower mapped role', () => {
		const map = parseHatRoles('contributor:supporter,leader:contributor')
		expect(effectiveHatRoles(map)).toEqual([
			{ peer: 'supporter' },
			{ peer: 'contributor', local: 'supporter', from: 'contributor' },
			{ peer: 'moderator', local: 'supporter', from: 'contributor' },
			{ peer: 'leader', local: 'contributor', from: 'leader' }
		])
		expect(hatRoleRanges(map)).toEqual([
			{ lo: 'contributor', hi: 'moderator', local: 'supporter' },
			{ lo: 'leader', hi: 'leader', local: 'contributor' }
		])
	})

	it('a single entry at supporter covers everyone above', () => {
		expect(hatRoleRanges({ supporter: 'supporter' })).toEqual([
			{ lo: 'supporter', hi: 'leader', local: 'supporter' }
		])
	})

	it('a single leader entry is a one-role range', () => {
		expect(hatRoleRanges({ leader: 'contributor' })).toEqual([
			{ lo: 'leader', hi: 'leader', local: 'contributor' }
		])
	})

	it('an empty map grants nothing', () => {
		expect(effectiveHatRoles({}).every((e) => !e.local)).toBe(true)
		expect(hatRoleRanges({})).toEqual([])
	})

	it('keeps same-role neighbours from different entries apart', () => {
		expect(hatRoleRanges({ supporter: 'supporter', moderator: 'supporter' })).toEqual([
			{ lo: 'supporter', hi: 'contributor', local: 'supporter' },
			{ lo: 'moderator', hi: 'leader', local: 'supporter' }
		])
	})
})

describe('contextKey / splitContextKey', () => {
	it('keys bare and hatted contexts', () => {
		expect(contextKey('b.org')).toBe('b.org')
		expect(contextKey('b.org', 'a.org')).toBe('b.org|a.org')
	})

	it('splits back', () => {
		expect(splitContextKey('b.org')).toEqual({ idTag: 'b.org' })
		expect(splitContextKey(contextKey('b.org', 'a.org'))).toEqual({
			idTag: 'b.org',
			hat: 'a.org'
		})
	})
})

describe('recoverHattedAuth', () => {
	it('is not recoverable without a registered re-handshake', async () => {
		expect(await recoverHattedAuth('b.org', 'a.org')).toBeUndefined()
	})

	it('re-handshakes under the hatted key, until unregistered', async () => {
		const keys: string[] = []
		const unregister = registerHattedRecovery(async (key) => {
			keys.push(key)
			return 'tok'
		})
		expect(await recoverHattedAuth('b.org', 'a.org')).toEqual({ token: 'tok' })
		expect(keys).toEqual(['b.org|a.org'])
		unregister()
		expect(await recoverHattedAuth('b.org', 'a.org')).toBeUndefined()
	})

	it('a refused re-handshake is not recoverable', async () => {
		const unregister = registerHattedRecovery(async () => undefined)
		expect(await recoverHattedAuth('b.org', 'a.org')).toBeUndefined()
		unregister()
	})
})

describe('isRefusal', () => {
	it('is a 403 or 404 fetch error only', () => {
		expect(isRefusal(new FetchError('E', 'x', 403))).toBe(true)
		expect(isRefusal(new FetchError('E', 'x', 404))).toBe(true)
		expect(isRefusal(new FetchError('E', 'x', 500))).toBe(false)
		expect(isRefusal(new Error('403'))).toBe(false)
	})
})

// vim: ts=4

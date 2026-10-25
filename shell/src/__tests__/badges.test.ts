// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Reducing `BDG` actions to one badge per audience, community and slot,
 * appending to `profile.badges` past stale keys, and the unsigned checks on
 * shown badge tokens.
 */

import { jest } from '@jest/globals'
import type { ApiClient } from '@cloudillo/core'
import type { ActionView } from '@cloudillo/types'

// The profile-page hook's imports: React context, unused here.
jest.unstable_mockModule('../context/index.js', () => ({ useApiContext: () => {} }))

const { addShownBadge, badgeClaims, isIssuerHost, latestBadges, MAX_SHOWN, shortExpiry } =
	await import('../profile/badges.js')

const DAY = 86400
const now = () => Math.floor(Date.now() / 1000)
const comm = { idTag: 'comm.example', name: 'Comm', type: 'community' as const }

function bdg(o: {
	audience?: string
	issuer?: string
	slot?: 'STD' | 'PAT'
	level: string
	created: number
	exp: number
}): ActionView {
	return {
		actionId: `a${o.created}${o.level}`,
		type: 'BDG',
		subType: o.slot ?? 'PAT',
		issuer: { ...comm, idTag: o.issuer ?? comm.idTag },
		audience: { idTag: o.audience ?? 'ada.example', name: 'Ada', type: 'person' },
		content: { b: o.level },
		createdAt: o.created,
		expiresAt: o.exp
	} as ActionView
}

describe('latestBadges', () => {
	it('lets the newest-created win over an older, later-expiring one', () => {
		const res = latestBadges([
			bdg({ level: 'gold', created: now() - 10 * DAY, exp: now() + 300 * DAY }),
			bdg({ level: 'bronze', created: now() - DAY, exp: now() + 30 * DAY })
		])
		expect(res.get('ada.example')?.get('comm.example:PAT')?.level).toBe('bronze')
	})

	it('does not bring back an older badge when the newest has expired', () => {
		const res = latestBadges([
			bdg({ level: 'bronze', created: now() - 2 * DAY, exp: now() - DAY }),
			bdg({ level: 'gold', created: now() - 10 * DAY, exp: now() + 300 * DAY })
		])
		expect(res.get('ada.example')).toBeUndefined()
	})

	it('keeps audiences apart', () => {
		const res = latestBadges([
			bdg({ audience: 'ada.example', level: 'gold', created: now() - DAY, exp: now() + DAY }),
			bdg({ audience: 'bob.example', level: 'silver', created: now(), exp: now() + DAY })
		])
		expect(res.get('ada.example')?.get('comm.example:PAT')?.level).toBe('gold')
		expect(res.get('bob.example')?.get('comm.example:PAT')?.level).toBe('silver')
	})
})

describe('addShownBadge', () => {
	function mockApi(received: ActionView[], shown: string[]) {
		const update = jest.fn(async (_key: string, _body: { value: string[] }) => ({}))
		const api = {
			actions: {
				listPaginated: async () => ({ data: received, cursorPagination: undefined })
			},
			settings: { get: async () => ({ value: shown }), update }
		} as unknown as ApiClient
		return { api, update }
	}
	const live = (issuer: string) =>
		bdg({ issuer, level: 'gold', created: now(), exp: now() + DAY })

	it('prunes stale keys before appending', async () => {
		const { api, update } = mockApi(
			[live('a.example'), live('b.example')],
			['gone.example:PAT', 'a.example:PAT']
		)
		expect(await addShownBadge(api, 'ada.example', 'b.example:PAT')).toBe('added')
		expect(update).toHaveBeenCalledWith('profile.badges', {
			value: ['a.example:PAT', 'b.example:PAT']
		})
	})

	it('reports a shown key as present', async () => {
		const { api, update } = mockApi([live('a.example')], ['a.example:PAT'])
		expect(await addShownBadge(api, 'ada.example', 'a.example:PAT')).toBe('present')
		expect(update).not.toHaveBeenCalled()
	})

	it('is full at MAX_SHOWN live keys, not counting stale ones', async () => {
		const issuers = Array.from({ length: MAX_SHOWN + 1 }, (_, i) => `c${i}.example`)
		const keys = issuers.slice(0, MAX_SHOWN).map((i) => `${i}:PAT`)
		const full = mockApi(issuers.map(live), keys)
		expect(await addShownBadge(full.api, 'ada.example', `${issuers[MAX_SHOWN]}:PAT`)).toBe(
			'full'
		)
		expect(full.update).not.toHaveBeenCalled()

		// Same shown list, but one of them expired: there is room again.
		const stale = mockApi(issuers.slice(1).map(live), keys)
		expect(await addShownBadge(stale.api, 'ada.example', `${issuers[MAX_SHOWN]}:PAT`)).toBe(
			'added'
		)
	})

	it('reports a key that is no longer a live received badge as gone', async () => {
		const { api, update } = mockApi([live('a.example')], [])
		expect(await addShownBadge(api, 'ada.example', 'b.example:PAT')).toBe('gone')
		expect(update).not.toHaveBeenCalled()
	})
})

describe('isIssuerHost', () => {
	it('accepts a public DNS name', () => {
		expect(isIssuerHost('comm.example.org')).toBe(true)
	})

	it.each(['localhost', 'foo.local', '10.0.0.1', 'a/b', 'x:1', '@x.org', ''])(
		'rejects %p',
		(iss) => {
			expect(isIssuerHost(iss)).toBe(false)
		}
	)
})

describe('badgeClaims', () => {
	const b64 = (o: object) =>
		btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
	const jws = (payload: object) => `${b64({ alg: 'ES384' })}.${b64(payload)}.sig`
	const claim = (iss: string, o: { t?: string; b?: string; exp?: number } = {}) =>
		jws({
			iss,
			t: o.t ?? 'BDG:PAT',
			c: { b: o.b ?? 'gold' },
			...('exp' in o ? { exp: o.exp } : { exp: now() + DAY })
		})

	it('drops malformed, unknown and expired claims', () => {
		const good = claim('a.example')
		const res = badgeClaims([
			claim('b.example', { t: 'BDG:XYZ' }),
			claim('c.example', { t: 'POST' }),
			claim('d.example', { b: 'platinum' }),
			claim('e.example', { exp: now() - 1 }),
			claim('f.example', { exp: undefined }),
			claim('localhost'),
			'not-a-jws',
			good
		])
		expect(res).toEqual([
			{ token: good, iss: 'a.example', slot: 'PAT', level: 'gold', exp: expect.any(Number) }
		])
	})

	it('keeps the first claim per issuer and slot, in order', () => {
		const first = claim('a.example', { b: 'bronze' })
		const std = claim('a.example', { t: 'BDG:STD', b: 'verified' })
		const res = badgeClaims([first, claim('a.example', { b: 'gold' }), std])
		expect(res.map((c) => c.token)).toEqual([first, std])
	})

	it('drops a claim expiring past the backend max TTL', () => {
		expect(badgeClaims([claim('a.example', { exp: now() + 400 * DAY })])).toEqual([])
		expect(badgeClaims([claim('a.example', { exp: now() + 366 * DAY })])).toHaveLength(1)
	})

	it(`caps at MAX_SHOWN`, () => {
		const tokens = Array.from({ length: MAX_SHOWN + 2 }, (_, i) => claim(`c${i}.example`))
		expect(badgeClaims(tokens).map((c) => c.token)).toEqual(tokens.slice(0, MAX_SHOWN))
	})
})

describe('shortExpiry', () => {
	const t = ((key: string, o?: { n?: number }) =>
		key.replace('{{n}}', String(o?.n))) as unknown as Parameters<typeof shortExpiry>[1]
	const at = 1_700_000_000_000
	const inDays = (d: number) => at / 1000 + d * DAY

	it('rounds to days, then months', () => {
		expect(shortExpiry(inDays(0.5), t, at)).toBe('<1d')
		expect(shortExpiry(inDays(12), t, at)).toBe('12d')
		expect(shortExpiry(inDays(59.9), t, at)).toBe('59d')
		expect(shortExpiry(inDays(60), t, at)).toBe('2m')
		expect(shortExpiry(inDays(95), t, at)).toBe('3m')
	})
})

// vim: ts=4

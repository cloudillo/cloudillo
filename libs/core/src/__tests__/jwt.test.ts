// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	decodeJwtPayload,
	getJwtTimes,
	jwtExpiryDate,
	jwtRemainingSeconds,
	renewalDelayMs
} from '../jwt.js'

/** Encode a payload object as an unpadded base64url JWT segment. */
function b64url(obj: unknown): string {
	const bytes = new TextEncoder().encode(JSON.stringify(obj))
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')
}

function makeToken(payload: Record<string, unknown>): string {
	return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`
}

describe('decodeJwtPayload', () => {
	it('decodes a plain payload', () => {
		expect(decodeJwtPayload(makeToken({ sub: 'alice', exp: 42 }))).toEqual({
			sub: 'alice',
			exp: 42
		})
	})

	it('decodes a base64url payload containing - and _', () => {
		// `~~~?` and `>>>` force 0x3e/0x3f bytes, which encode to `-` and `_`
		// in base64url. Plain atob() rejects these, which is the bug this
		// module exists to fix: a token that failed to decode silently
		// disabled renewal.
		const payload = { scope: 'file:aaa?>>>~~~?:W', exp: 1_700_000_000 }
		const token = makeToken(payload)
		expect(token.split('.')[1]).toMatch(/[-_]/)
		expect(decodeJwtPayload(token)).toEqual(payload)
	})

	it('returns null for malformed input', () => {
		expect(decodeJwtPayload('')).toBeNull()
		expect(decodeJwtPayload('not-a-jwt')).toBeNull()
		expect(decodeJwtPayload('a.!!!not-base64!!!.c')).toBeNull()
	})
})

describe('getJwtTimes', () => {
	it('converts exp/iat from seconds to epoch ms', () => {
		expect(getJwtTimes(makeToken({ exp: 2000, iat: 1000 }))).toEqual({
			exp: 2_000_000,
			iat: 1_000_000
		})
	})

	it('reports iat as null when the token omits it', () => {
		expect(getJwtTimes(makeToken({ exp: 2000 }))).toEqual({ exp: 2_000_000, iat: null })
	})

	it('returns null without a usable exp', () => {
		expect(getJwtTimes(makeToken({ sub: 'alice' }))).toBeNull()
		expect(getJwtTimes(makeToken({ exp: '2000' }))).toBeNull()
	})
})

describe('jwtExpiryDate', () => {
	it('reads the exp claim as a Date', () => {
		const exp = 1_700_000_000
		expect(jwtExpiryDate(makeToken({ exp, sub: 'alice' }))?.getTime()).toBe(exp * 1000)
	})

	it('returns undefined when exp is missing', () => {
		expect(jwtExpiryDate(makeToken({ sub: 'alice' }))).toBeUndefined()
	})

	it('returns undefined for a non-numeric or zero exp', () => {
		expect(jwtExpiryDate(makeToken({ exp: '1700000000' }))).toBeUndefined()
		expect(jwtExpiryDate(makeToken({ exp: 0 }))).toBeUndefined()
	})

	it('returns undefined for a malformed token', () => {
		expect(jwtExpiryDate('not-a-jwt')).toBeUndefined()
		expect(jwtExpiryDate('header..sig')).toBeUndefined()
		expect(jwtExpiryDate('header.####.sig')).toBeUndefined()
	})

	it('returns undefined for a missing token', () => {
		expect(jwtExpiryDate(undefined)).toBeUndefined()
	})
})

describe('jwtRemainingSeconds', () => {
	it('reports the remaining lifetime', () => {
		const exp = Math.floor(Date.now() / 1000) + 600
		expect(jwtRemainingSeconds(makeToken({ exp }))).toBeGreaterThan(590)
		expect(jwtRemainingSeconds(makeToken({ exp }))).toBeLessThanOrEqual(600)
	})

	it('floors an expired token at 0 rather than going negative', () => {
		const exp = Math.floor(Date.now() / 1000) - 600
		expect(jwtRemainingSeconds(makeToken({ exp }))).toBe(0)
	})

	it('returns undefined when undeterminable', () => {
		expect(jwtRemainingSeconds('garbage')).toBeUndefined()
	})
})

describe('renewalDelayMs', () => {
	it('anchors to iat + 80% of total lifetime, not to remaining time', () => {
		const nowSec = Math.floor(Date.now() / 1000)
		// A 1000 s token issued 900 s ago: 100 s left, but 80% of its life is
		// already spent, so renewal is due 100 s *before* now → clamped to 0.
		expect(renewalDelayMs(makeToken({ iat: nowSec - 900, exp: nowSec + 100 }))).toBe(0)

		// Same token half-consumed: renewal at iat+800 s = 300 s from now.
		const delay = renewalDelayMs(makeToken({ iat: nowSec - 500, exp: nowSec + 500 }))
		expect(delay).toBeGreaterThan(295_000)
		expect(delay).toBeLessThanOrEqual(300_000)
	})

	it('falls back to 80% of remaining time when iat is absent', () => {
		const delay = renewalDelayMs(makeToken({ exp: Math.floor(Date.now() / 1000) + 1000 }))
		// 80% of ~1000 s remaining
		expect(delay).toBeGreaterThan(795_000)
		expect(delay).toBeLessThanOrEqual(800_000)
	})

	it('honours a custom threshold', () => {
		const nowSec = Math.floor(Date.now() / 1000)
		const delay = renewalDelayMs(makeToken({ exp: nowSec + 1000 }), { threshold: 0.5 })
		expect(delay).toBeGreaterThan(495_000)
		expect(delay).toBeLessThanOrEqual(500_000)
	})

	it('keeps jitter within the requested band', () => {
		const nowSec = Math.floor(Date.now() / 1000)
		const token = makeToken({ exp: nowSec + 1000 })
		for (let i = 0; i < 50; i++) {
			const delay = renewalDelayMs(token, { jitter: 0.05 })
			expect(delay).toBeGreaterThan(800_000 * 0.94)
			expect(delay).toBeLessThan(800_000 * 1.06)
		}
	})

	it('floors the delay at `min` without lifting a longer one', () => {
		const nowSec = Math.floor(Date.now() / 1000)
		// Past its threshold: unfloored this is 0, which is what turns a stream
		// of stale-`iat` reissues into a request loop.
		const stale = makeToken({ iat: nowSec - 900, exp: nowSec + 100 })
		expect(renewalDelayMs(stale)).toBe(0)
		expect(renewalDelayMs(stale, { min: 5000 })).toBe(5000)

		// A real delay is left alone.
		const fresh = makeToken({ iat: nowSec, exp: nowSec + 1000 })
		expect(renewalDelayMs(fresh, { min: 5000 })).toBeGreaterThan(795_000)
	})

	it('never turns a null into a timer, whatever the floor', () => {
		expect(
			renewalDelayMs(makeToken({ exp: Math.floor(Date.now() / 1000) - 1 }), { min: 5000 })
		).toBeNull()
		expect(renewalDelayMs('garbage', { min: 5000 })).toBeNull()
	})

	it('returns null for an expired or unparseable token', () => {
		expect(renewalDelayMs(makeToken({ exp: Math.floor(Date.now() / 1000) - 1 }))).toBeNull()
		expect(renewalDelayMs('garbage')).toBeNull()
	})
})

// vim: ts=4

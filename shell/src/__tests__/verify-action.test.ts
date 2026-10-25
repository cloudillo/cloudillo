// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** The claim recheck on tokens whose signature the home node verified. */

import type { VerifyTokenResult } from '@cloudillo/core'

import { claimsMatch, homeVerified } from '../apps/feed/verifyAction.js'

const b64 = (o: object) =>
	btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jws = (payload: object) => `${b64({ alg: 'ES384' })}.${b64(payload)}.sig`

const token = jws({ iss: 'ada.example', sub: 'a1~post', aud: 'comm.example' })
const expect_ = {
	issuerIdTag: 'ada.example',
	subjectActionId: 'a1~post',
	audienceTag: 'comm.example'
}
const issuer = { idTag: 'ada.example', name: 'Ada', type: 'person' as const }

describe('claimsMatch', () => {
	it('matches iss, sub and aud', () => {
		expect(claimsMatch(token, expect_)).toBe(true)
	})

	it.each([
		{ issuerIdTag: 'bob.example' },
		{ subjectActionId: 'a1~other' },
		{ audienceTag: 'other.example' }
	])('rejects a mismatch: %p', (o) => {
		expect(claimsMatch(token, { ...expect_, ...o })).toBe(false)
	})

	it('rejects a missing aud when one is expected', () => {
		const noAud = jws({ iss: 'ada.example', sub: 'a1~post' })
		expect(claimsMatch(noAud, expect_)).toBe(false)
	})

	it('rejects a malformed token', () => {
		expect(claimsMatch('not-a-jws', expect_)).toBe(false)
	})
})

describe('homeVerified', () => {
	const res = (o: Partial<VerifyTokenResult>): VerifyTokenResult => ({
		status: 'verified',
		issuer,
		...o
	})

	it('accepts a verified result with matching claims and issuer', () => {
		expect(homeVerified(res({}), token, expect_)).toBe(true)
	})

	it.each(['invalid', 'error', 'unknown', 'something-new'])('rejects status %p', (status) => {
		expect(homeVerified(res({ status }), token, expect_)).toBe(false)
	})

	it('rejects a missing result', () => {
		expect(homeVerified(undefined, token, expect_)).toBe(false)
	})

	it('rejects a claim mismatch', () => {
		expect(homeVerified(res({}), token, { ...expect_, audienceTag: 'x.example' })).toBe(false)
	})

	it("rejects a server issuer other than the token's", () => {
		expect(
			homeVerified(res({ issuer: { ...issuer, idTag: 'bob.example' } }), token, expect_)
		).toBe(false)
	})
})

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ActionView } from '@cloudillo/types'

import { isLiveInvite, prinvtRefId } from '../profile/prinvt.js'

const NOW = Date.parse('2026-06-01T00:00:00Z')

describe('isLiveInvite', () => {
	it('treats a missing expiry as live', () => {
		expect(isLiveInvite(undefined, NOW)).toBe(true)
	})

	it('reads a number as Unix seconds', () => {
		expect(isLiveInvite(NOW / 1000 + 60, NOW)).toBe(true)
		expect(isLiveInvite(NOW / 1000 - 60, NOW)).toBe(false)
		expect(isLiveInvite(NOW / 1000, NOW)).toBe(false)
	})

	it('reads a string as an ISO date', () => {
		expect(isLiveInvite('2026-06-02T00:00:00Z', NOW)).toBe(true)
		expect(isLiveInvite('2026-05-31T00:00:00Z', NOW)).toBe(false)
	})

	it('keeps an unparseable date live', () => {
		expect(isLiveInvite('not a date', NOW)).toBe(true)
	})
})

describe('prinvtRefId', () => {
	const action = (content: unknown) => ({ content }) as unknown as ActionView

	it('returns a non-empty string refId', () => {
		expect(prinvtRefId(action({ refId: 'abc123', message: 'hi' }))).toBe('abc123')
	})

	it('returns undefined for a missing, empty or non-string refId', () => {
		expect(prinvtRefId(action(undefined))).toBeUndefined()
		expect(prinvtRefId(action(null))).toBeUndefined()
		expect(prinvtRefId(action({}))).toBeUndefined()
		expect(prinvtRefId(action({ refId: '' }))).toBeUndefined()
		expect(prinvtRefId(action({ refId: 42 }))).toBeUndefined()
	})
})

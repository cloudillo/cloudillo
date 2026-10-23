// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ApiClient } from '@cloudillo/core'
import { jest } from '@jest/globals'

import { loadOnboardingCommunity, peerAllowed } from '../onboarding/community.js'

describe('peerAllowed', () => {
	it('allows everything without a policy or in open mode', () => {
		expect(peerAllowed(undefined, 'a.org')).toBe(true)
		expect(peerAllowed({ mode: 'open', allow: [] }, 'a.org')).toBe(true)
	})

	it('refuses everything in off mode', () => {
		expect(peerAllowed({ mode: 'off', allow: ['a.org'] }, 'a.org')).toBe(false)
	})

	it('matches allow-list entries exactly', () => {
		const policy = { mode: 'allowlist', allow: ['a.org'] }
		expect(peerAllowed(policy, 'a.org')).toBe(true)
		expect(peerAllowed(policy, 'b.a.org')).toBe(false)
	})

	it('matches a wildcard against subdomains only', () => {
		const policy = { mode: 'allowlist', allow: ['*.example.org'] }
		expect(peerAllowed(policy, 'a.example.org')).toBe(true)
		expect(peerAllowed(policy, 'example.org')).toBe(false)
	})

	it('ignores non-string entries', () => {
		expect(peerAllowed({ mode: 'allowlist', allow: [42, null, 'a.org'] }, 'a.org')).toBe(true)
		expect(peerAllowed({ mode: 'allowlist', allow: [42] }, '42')).toBe(false)
	})

	it('refuses everything with an empty allow list', () => {
		expect(peerAllowed({ mode: 'allowlist', allow: [] }, 'a.org')).toBe(false)
	})
})

describe('loadOnboardingCommunity', () => {
	function fakeApi(values: Record<string, unknown | Error>) {
		const get = jest.fn(async (key: string) => {
			const v = values[key]
			if (v instanceof Error) throw v
			return { value: v }
		})
		return { get, api: { settings: { get } } as unknown as ApiClient }
	}

	it('returns empty when onboarding.community cannot be read', async () => {
		jest.spyOn(console, 'warn').mockImplementation(() => {})
		const { api } = fakeApi({ 'onboarding.community': new Error('boom') })
		expect(await loadOnboardingCommunity(api)).toBe('')
	})

	it.each([[''], ['   '], [42], [undefined]])(
		'returns empty for %p without reading federation.peers',
		async (value) => {
			const { api, get } = fakeApi({ 'onboarding.community': value })
			expect(await loadOnboardingCommunity(api)).toBe('')
			expect(get).not.toHaveBeenCalledWith('federation.peers')
		}
	)

	it('returns empty when federation.peers refuses the community', async () => {
		const { api } = fakeApi({
			'onboarding.community': ' c.org ',
			'federation.peers': { mode: 'off' }
		})
		expect(await loadOnboardingCommunity(api)).toBe('')
	})

	it('falls back to the community when federation.peers is unreadable', async () => {
		const { api } = fakeApi({
			'onboarding.community': ' c.org ',
			'federation.peers': new Error('403')
		})
		expect(await loadOnboardingCommunity(api)).toBe('c.org')
	})

	it('returns the trimmed community when allowed', async () => {
		const { api } = fakeApi({
			'onboarding.community': ' c.org ',
			'federation.peers': { mode: 'open' }
		})
		expect(await loadOnboardingCommunity(api)).toBe('c.org')
	})
})

// vim: ts=4

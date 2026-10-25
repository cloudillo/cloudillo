// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** `CommunityBadge` label: never a bare idTag, even when the name is the idTag. */

import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import * as React from 'react'

/** Stand in for `@cloudillo/core`, built from its submodules (see `person-hover.test.tsx`). */
jest.unstable_mockModule('@cloudillo/core', async () => {
	const urls = await import('../../../core/lib/urls.js')
	const utils = await import('../../../core/lib/utils.js')
	const apiRegistry = await import('../../../core/lib/api-registry.js')
	const fileUtils = await import('../../../core/lib/file-utils.js')
	const presence = await import('../../../core/lib/presence.js')
	return {
		...urls,
		...utils,
		...apiRegistry,
		...fileUtils,
		...presence,
		docBaseName: () => undefined,
		decodeBadges: (await import('../../../core/lib/api-types.js')).decodeBadges,
		getAppBus: () => ({ idTag: 'node.example', ownerTag: undefined, accessToken: undefined }),
		createApiClient: () => ({ profiles: { getBatch: async () => [] } })
	}
})

const { CommunityBadge } = await import('../components/Badge/CommunityBadge.js')

function label(community: { idTag: string; name?: string }, unknown?: boolean) {
	render(
		<CommunityBadge
			community={community}
			slot="STD"
			level="verified"
			exp={2_000_000_000}
			unknown={unknown}
		/>
	)
	return screen.getByRole('img').getAttribute('aria-label') ?? ''
}

describe('CommunityBadge label', () => {
	it('shows @idTag when the name is just the idTag', () => {
		const text = label({ idTag: 'comm.example', name: 'Comm.Example' })
		expect(text).toContain('@comm.example')
	})

	it('shows the name with the idTag', () => {
		const text = label({ idTag: 'comm.example', name: 'Comm' })
		expect(text).toContain('Comm (@comm.example)')
		expect(text).not.toContain('Comm.Example')
	})

	it('flags an unknown community', () => {
		const text = label({ idTag: 'comm.example', name: 'Comm' }, true)
		expect(text).toContain('Comm (@comm.example)')
		expect(text).toContain("From a community you don't know")
	})
})

// vim: ts=4

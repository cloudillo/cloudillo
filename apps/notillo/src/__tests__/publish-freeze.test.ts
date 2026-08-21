// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * What a failed slug freeze does to the publish that already committed.
 *
 * The freeze runs *after* the container is live, so it cannot fail the publish — but
 * it is what pins each page's address. Swallowed silently, the author is told
 * "published" and then finds a rename moving a live URL months later. The result
 * carries the fact instead, and `app.tsx` says so in the dialog.
 */

import type { RtdbClient } from '@cloudillo/rtdb'
import { jest } from '@jest/globals'

import type { BuiltContainer } from '../publish/container.js'

/** Whether the freeze batch commits. The one variable in this suite. */
let commitFails = false

const buildContainer = jest.fn(
	async (): Promise<BuiltContainer> => ({
		blob: new Blob([]),
		entries: ['index.html'],
		pageCount: 1,
		// Neither frozen yet, so the freeze has an actual write to attempt.
		published: [{ pageId: 'p1', slug: 'hello', slugFixed: false, alreadyPublished: false }]
	})
)

const actualContainer = await import('../publish/container.js')

jest.unstable_mockModule('../publish/container.js', () => ({
	...actualContainer,
	buildContainer
}))

// Spread, not replaced: `publish/index.ts` re-exports the gate, which pulls in the
// rest of core. Only the two things that would reach the network are stubbed.
const actualCore = await import('@cloudillo/core')

jest.unstable_mockModule('@cloudillo/core', () => ({
	...actualCore,
	getAppBus: () => ({
		accessToken: 'token',
		publishSite: async () => ({ containerFileId: 'f1' })
	}),
	createApiClient: () => ({
		files: { getDescriptor: async () => undefined },
		profiles: { getBatch: async () => [] }
	})
}))

const { publishSite } = await import('../publish/index.js')

/** Just enough client for `freezePublishedPages`, with a commit that can refuse. */
function makeClient(): RtdbClient {
	return {
		ref: (path: string) => ({ path }),
		batch: () => ({
			update: () => {},
			commit: async () => {
				if (commitFails) throw new Error('offline')
			}
		})
	} as unknown as RtdbClient
}

const options = () => ({
	client: makeClient(),
	docFileId: 'doc1',
	ownerIdTag: 'me.example',
	mountPath: '/'
})

describe('publishSite — the post-commit freeze', () => {
	it('should report a frozen publish as frozen', async () => {
		commitFails = false
		await expect(publishSite(options())).resolves.toMatchObject({
			containerFileId: 'f1',
			slugsFrozen: true
		})
	})

	it('should still resolve when the freeze write fails, and say so', async () => {
		// The container is already live: throwing here would report a publish that
		// happened as one that did not.
		commitFails = true
		const error = jest.spyOn(console, 'error').mockImplementation(() => {})
		await expect(publishSite(options())).resolves.toMatchObject({
			containerFileId: 'f1',
			slugsFrozen: false
		})
		error.mockRestore()
	})
})

// vim: ts=4

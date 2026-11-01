// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `AppDocBar`'s automatic "View only" chip: shown once the document is ready and the bus
 * reports read access (comment access can still write comments). There is no prop for it.
 */

import type { DocInfo } from '@cloudillo/core'
import { jest } from '@jest/globals'
import { act, render, screen } from '@testing-library/react'

/** The bus's access level; swap per test. */
let access: 'read' | 'comment' | 'write' = 'write'

/** `doc:info` subscribers, so a test can push as the shell would. */
const docInfoHandlers = new Set<(info: DocInfo) => void>()

function pushDocInfo(info: DocInfo) {
	for (const cb of docInfoHandlers) cb(info)
}

/** Same stand-in as `docbar-rename.test.tsx` — see the reasoning there. */
jest.unstable_mockModule('@cloudillo/core', async () => {
	const { docRef, getCrdtUrl, getFileUrl } = await import('../../../core/lib/urls.js')
	const { delay, idHue } = await import('../../../core/lib/utils.js')
	const fileUtils = await import('../../../core/lib/file-utils.js')
	const presence = await import('../../../core/lib/presence.js')
	const bus = {
		resId: '@node.example:doc1',
		ownerTag: '@node.example',
		idTag: '@node.example',
		accessToken: undefined,
		get access() {
			return access
		},
		onIdentityChange: () => () => {},
		onDocInfo: (cb: (info: DocInfo) => void) => {
			docInfoHandlers.add(cb)
			return () => docInfoHandlers.delete(cb)
		}
	}
	const apiRegistry = await import('../../../core/lib/api-registry.js')
	return {
		...presence,
		...fileUtils,
		...apiRegistry,
		delay,
		docRef,
		getCrdtUrl,
		getFileUrl,
		idHue,
		docBaseName: () => undefined,
		decodeBadges: (await import('../../../core/lib/api-types.js')).decodeBadges,
		getAppBus: () => bus,
		parseAppHash: () => ({ isEmbed: false }),
		createApiClient: () => ({ profiles: { getBatch: async () => [] } })
	}
})

jest.unstable_mockModule('../components/Toast/index.js', () => ({
	useToast: () => ({ error: () => 'toast-1', success: () => 'toast-2' })
}))

const { AppDocBar } = await import('../docbar.js')

const INFO: DocInfo = {
	resId: '@node.example:doc1',
	fileId: 'doc1',
	fileName: 'Notes',
	state: 'ready',
	isCrossOwner: false,
	canRename: false,
	canPost: false
}

describe('AppDocBar "View only" chip', () => {
	// jsdom has no matchMedia; `DocBar` asks via `useIsMobile`. All queries stay false.
	beforeEach(() => {
		docInfoHandlers.clear()
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			addEventListener() {},
			removeEventListener() {}
		})) as unknown as typeof window.matchMedia
	})

	afterEach(() => {
		;(window as { matchMedia?: unknown }).matchMedia = undefined
	})

	it('shows "View only" for read access', () => {
		access = 'read'
		render(<AppDocBar />)
		act(() => pushDocInfo(INFO))
		expect(screen.getByText('View only')).toBeTruthy()
	})

	it('shows no chip for comment access', () => {
		access = 'comment'
		render(<AppDocBar />)
		act(() => pushDocInfo(INFO))
		expect(screen.queryByText('View only')).toBeNull()
	})

	it('shows no chip for write access', () => {
		access = 'write'
		render(<AppDocBar />)
		act(() => pushDocInfo(INFO))
		expect(screen.queryByText('View only')).toBeNull()
	})
})

// vim: ts=4

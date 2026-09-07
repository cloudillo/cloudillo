// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `useDocBar`'s optimistic rename.
 *
 * The bar shows the requested name the moment the user hits save, before the
 * shell has answered. Retiring that optimistic name correctly is the whole
 * subtlety: the shell may hand back a DIFFERENT name (a de-duplicating rename
 * turns "Notes" into "Notes (2)"), and a refused rename must put the old one
 * back rather than leave a lie on screen.
 */

import type { DocInfo } from '@cloudillo/core'
import { jest } from '@jest/globals'
import { act, renderHook, waitFor } from '@testing-library/react'

/** Every `error()` toast raised, oldest first. */
const toastErrors: string[] = []

/** Swap in per test to accept, adjust or refuse the rename. */
let renameImpl: (fileName: string) => Promise<{ ok: boolean; fileName?: string; error?: string }>

/** Titles handed to `bus.setTitle`, oldest first. */
const titlesSet: string[] = []

/** `doc:info` subscribers, so a test can push as the shell would. */
const docInfoHandlers = new Set<(info: DocInfo) => void>()

function pushDocInfo(info: DocInfo) {
	for (const cb of docInfoHandlers) cb(info)
}

/**
 * Stand in for `@cloudillo/core`, so the hook runs with no shell behind it.
 *
 * Assembled from core's own submodules rather than by spreading the package
 * index: `@cloudillo/core` and `.../core/lib/index.js` are the same resolved
 * module, so re-importing either one inside this factory hands back the mock and
 * recurses until the heap gives out. The submodules resolve to different files
 * and stay real.
 *
 * These are every core symbol the module graph under test touches at import
 * time — `docbar.tsx` plus the `DocBar` components and `presence.tsx` it pulls in.
 * The roster core is spread in whole rather than listed: `presence.tsx` reaches
 * `@cloudillo/crdt`, which RE-EXPORTS parts of it, and a re-export of a name the
 * mock does not define fails to link.
 */
jest.unstable_mockModule('@cloudillo/core', async () => {
	const { getCrdtUrl, getFileUrl } = await import('../../../core/lib/urls.js')
	// `delay` for `Button`, which the Share action in `AppDocBar` pulls into the graph.
	const { delay, idHue } = await import('../../../core/lib/utils.js')
	const fileUtils = await import('../../../core/lib/file-utils.js')
	const presence = await import('../../../core/lib/presence.js')
	const bus = {
		resId: '@node.example:doc1',
		ownerTag: '@node.example',
		idTag: '@node.example',
		accessToken: undefined,
		onDocInfo: (cb: (info: DocInfo) => void) => {
			docInfoHandlers.add(cb)
			return () => docInfoHandlers.delete(cb)
		},
		renameDocument: (fileName: string) => renameImpl(fileName),
		setTitle: (title: string) => {
			titlesSet.push(title)
		}
	}
	return {
		...presence,
		...fileUtils,
		delay,
		getCrdtUrl,
		getFileUrl,
		idHue,
		getAppBus: () => bus,
		// The bar only renders outside an embed; these tests are never embedded.
		parseAppHash: () => ({ isEmbed: false }),
		createApiClient: () => ({ profiles: { getBatch: async () => [] } })
	}
})

jest.unstable_mockModule('../components/Toast/index.js', () => ({
	useToast: () => ({
		error: (message: string) => {
			toastErrors.push(message)
			return 'toast-1'
		}
	})
}))

const { useDocBar } = await import('../docbar.js')

const INFO: DocInfo = {
	resId: '@node.example:doc1',
	fileId: 'doc1',
	fileName: 'Notes',
	state: 'ready',
	isCrossOwner: false,
	canRename: true,
	canPost: true
}

describe('useDocBar rename', () => {
	beforeEach(() => {
		docInfoHandlers.clear()
		toastErrors.length = 0
		titlesSet.length = 0
		renameImpl = async (fileName) => ({ ok: true, fileName })
	})

	it('shows the requested name immediately and keeps it once confirmed', async () => {
		const { result } = renderHook(() => useDocBar())
		act(() => pushDocInfo(INFO))
		expect(result.current.title).toBe('Notes')

		await act(async () => {
			await result.current.rename('Meeting notes')
		})

		expect(result.current.title).toBe('Meeting notes')
		expect(titlesSet).toEqual(['Meeting notes'])
		expect(toastErrors).toEqual([])

		// The shell's confirming push retires the optimistic name; the displayed
		// name must not flinch when it lands.
		act(() => pushDocInfo({ ...INFO, fileName: 'Meeting notes' }))
		expect(result.current.title).toBe('Meeting notes')
	})

	/**
	 * The regression this test exists for: the resolver de-duplicates, so the
	 * document is really called "Notes (2)". The optimistic "Notes" used to stick
	 * forever, because the retiring push never matched it.
	 */
	it("adopts the server's name when it differs from the requested one", async () => {
		renameImpl = async () => ({ ok: true, fileName: 'Notes (2)' })

		const { result } = renderHook(() => useDocBar())
		act(() => pushDocInfo(INFO))

		await act(async () => {
			await result.current.rename('Notes')
		})

		expect(result.current.title).toBe('Notes (2)')
		// and the tab title follows the real name, not the requested one
		expect(titlesSet).toEqual(['Notes (2)'])

		act(() => pushDocInfo({ ...INFO, fileName: 'Notes (2)' }))
		expect(result.current.title).toBe('Notes (2)')
		expect(result.current.info?.fileName).toBe('Notes (2)')
	})

	it('reverts and raises a toast when the rename is refused', async () => {
		renameImpl = async () => ({ ok: false, error: 'Permission denied' })

		const { result } = renderHook(() => useDocBar())
		act(() => pushDocInfo(INFO))

		await act(async () => {
			await result.current.rename('Meeting notes')
		})

		expect(result.current.title).toBe('Notes')
		expect(toastErrors).toEqual(['Permission denied'])
		// Nothing was renamed, so nothing should have touched the tab title.
		expect(titlesSet).toEqual([])
	})

	it('reverts and raises a toast when the bus throws', async () => {
		renameImpl = async () => {
			throw new Error('Bus not initialized')
		}

		const { result } = renderHook(() => useDocBar())
		act(() => pushDocInfo(INFO))

		await act(async () => {
			await result.current.rename('Meeting notes')
		})

		expect(result.current.title).toBe('Notes')
		expect(toastErrors).toEqual(['Bus not initialized'])
		await waitFor(() => expect(result.current.renaming).toBe(false))
	})

	it('ignores a push aimed at a document we navigated away from', async () => {
		const { result } = renderHook(() => useDocBar())
		act(() => pushDocInfo(INFO))

		act(() => pushDocInfo({ ...INFO, resId: '@node.example:other', fileName: 'Other doc' }))

		expect(result.current.title).toBe('Notes')
	})
})

// vim: ts=4

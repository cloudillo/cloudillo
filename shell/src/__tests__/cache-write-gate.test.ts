// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The offline cache's *write* gate — the counterpart to `may-use-cache.test.ts`,
 * which covers the read gate.
 *
 * Without the `swKey` cookie there is no encryption key, so nothing can be
 * written: `putRecords` encrypts nothing and `evictIfNeeded` rejects on
 * `openDB()`. That is the default session ("Remember me" unchecked), and it used
 * to surface as one `[Cache] Write failed` warning per minute. A keyless session
 * must skip the cache silently — no IndexedDB open, no console noise.
 */

// Not a global in ESM mode, unlike describe/it/expect.
import { jest } from '@jest/globals'

import type { FileView } from '@cloudillo/core'
import type { ActionView } from '@cloudillo/types'

const readSwKeyCookie = jest.fn<() => string | null>()
const cacheFiles = jest.fn<() => Promise<void>>()
const cacheActions = jest.fn<() => Promise<void>>()
const evictIfNeeded = jest.fn<() => Promise<void>>()

jest.unstable_mockModule('../pwa/cookie.js', () => ({
	readSwKeyCookie,
	writeSwKeyCookie: jest.fn(() => true),
	clearSwKeyCookie: jest.fn()
}))

jest.unstable_mockModule('../cache/file-cache.js', () => ({ cacheFiles }))
jest.unstable_mockModule('../cache/action-cache.js', () => ({ cacheActions }))
jest.unstable_mockModule('../cache/encrypted-store.js', () => ({ evictIfNeeded }))

const FILES = [{ fileId: 'f1', owner: { idTag: 'a.example' } } as unknown as FileView]
const ACTIONS = [{ actionId: 'a1', type: 'POST' } as unknown as ActionView]

/**
 * Fresh copy of sync.ts per case: `writeQueue` and `maybeEvict`'s `lastEvictAt`
 * are module-level, so a second case would otherwise be throttled out of its
 * eviction by the first one's.
 */
async function loadSync() {
	jest.resetModules()
	return import('../cache/sync.js')
}

/** Let the microtask-chained write queue drain. */
async function drain(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0))
}

let warn: ReturnType<typeof jest.spyOn>

beforeEach(() => {
	readSwKeyCookie.mockReset()
	cacheFiles.mockReset().mockResolvedValue(undefined)
	cacheActions.mockReset().mockResolvedValue(undefined)
	evictIfNeeded.mockReset().mockResolvedValue(undefined)
	warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
	warn.mockRestore()
})

describe('cache write gate', () => {
	it('writes nothing and says nothing without the key cookie', async () => {
		readSwKeyCookie.mockReturnValue(null)
		const { cacheFilesAsync } = await loadSync()

		cacheFilesAsync('@a.example', FILES)
		await drain()

		expect(cacheFiles).not.toHaveBeenCalled()
		// The rejecting call: `evictIfNeeded` reaches `openDB()`, which has no key.
		expect(evictIfNeeded).not.toHaveBeenCalled()
		expect(warn).not.toHaveBeenCalled()
	})

	it('skips action writes without the key cookie too', async () => {
		readSwKeyCookie.mockReturnValue(null)
		const { cacheActionsAsync } = await loadSync()

		cacheActionsAsync('@a.example', ACTIONS)
		await drain()

		expect(cacheActions).not.toHaveBeenCalled()
		expect(evictIfNeeded).not.toHaveBeenCalled()
		expect(warn).not.toHaveBeenCalled()
	})

	it('writes and evicts when the key cookie is present', async () => {
		readSwKeyCookie.mockReturnValue('a-key')
		const { cacheFilesAsync } = await loadSync()

		cacheFilesAsync('@a.example', FILES)
		await drain()

		expect(cacheFiles).toHaveBeenCalledWith('@a.example', FILES)
		expect(evictIfNeeded).toHaveBeenCalledWith('@a.example')
	})

	it('writes actions when the key cookie is present', async () => {
		readSwKeyCookie.mockReturnValue('a-key')
		const { cacheActionsAsync } = await loadSync()

		cacheActionsAsync('@a.example', ACTIONS)
		await drain()

		expect(cacheActions).toHaveBeenCalledWith('@a.example', ACTIONS)
		expect(evictIfNeeded).toHaveBeenCalledWith('@a.example')
	})

	it('still writes nothing for an empty batch', async () => {
		readSwKeyCookie.mockReturnValue('a-key')
		const { cacheFilesAsync } = await loadSync()

		cacheFilesAsync('@a.example', [])
		await drain()

		expect(cacheFiles).not.toHaveBeenCalled()
		expect(evictIfNeeded).not.toHaveBeenCalled()
	})
})

// vim: ts=4

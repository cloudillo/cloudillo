// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The blob metadata persist debounce, and the handle `evt.waitUntil` holds onto.
 *
 * The debounce timer is nulled *before* the write starts, so a fetch arriving
 * while `setItem` is still in flight schedules a second persist. The first one
 * settling must not clear the pending-promise slot unconditionally: that discards
 * the second's handle, every later fetch finds the slot empty and attaches nothing
 * to `evt.waitUntil`, and an idle-terminated worker loses the write — the
 * orphaned-Cache-Storage case `reconcileBlobMeta` exists to repair.
 *
 * Its own file: `blob-cache.ts` keeps the map, the running total and the timer in
 * module state, and this suite has to start from a clean one.
 */

import { jest } from '@jest/globals'

// Mirrors sw/blob-cache.ts (module-private).
const BLOB_META_PERSIST_INTERVAL = 10_000

/** Resolves the `setItem` call currently in flight, if any. */
let releaseSetItem: (() => void) | null = null

const setItem = jest.fn(
	() =>
		new Promise<void>((resolve) => {
			releaseSetItem = resolve
		})
)

jest.unstable_mockModule('../../sw/secure-store.js', () => ({
	setItem,
	getItem: async () => undefined,
	deleteItem: async () => {}
}))

const { cacheBlobResponse } = await import('../../sw/blob-cache.js')

// Cache Storage has no equivalent in a node test environment; only what the
// module calls is stubbed.
const stored = new Set<string>()
const fakeCache = {
	put: async (req: Request) => {
		stored.add(req.url)
	},
	match: async () => undefined,
	keys: async () => [...stored].map((url) => new Request(url)),
	delete: async (req: Request) => stored.delete(req.url)
}
;(globalThis as unknown as { caches: unknown }).caches = {
	open: async () => fakeCache,
	delete: async () => true
}

/** A response the cache sizes from its Content-Length, without reading a body. */
function blob(size: number): Response {
	return new Response('x', { headers: { 'Content-Length': String(size) } })
}

function fileUrl(name: string): URL {
	return new URL(`https://cl-o.alice.cloudillo.net/api/files/${name}?variant=vis.tn`)
}

beforeEach(() => {
	jest.useFakeTimers()
	setItem.mockClear()
	releaseSetItem = null
})

afterEach(() => {
	jest.useRealTimers()
})

describe('scheduleBlobMetaPersist', () => {
	it('still hands a promise to keepAlive after an in-flight persist settles', async () => {
		await cacheBlobResponse(fileUrl('a'), blob(1024))

		// Fires the debounce; the write itself stays in flight.
		await jest.advanceTimersByTimeAsync(BLOB_META_PERSIST_INTERVAL)
		expect(setItem).toHaveBeenCalledTimes(1)

		// A fetch landing inside that window schedules the next persist, and owns
		// the pending slot from here.
		await cacheBlobResponse(fileUrl('b'), blob(1024))

		releaseSetItem?.()
		await jest.advanceTimersByTimeAsync(0)

		// The settled first persist must not have taken the second one's handle
		// with it — without the identity guard nothing is passed to `waitUntil`
		// here at all, and the worker may die with that write still in memory.
		const keepAlive = jest.fn()
		await cacheBlobResponse(fileUrl('c'), blob(1024), keepAlive)
		expect(keepAlive).toHaveBeenCalledTimes(1)
		expect(keepAlive.mock.calls[0][0]).toBeInstanceOf(Promise)
	})
})

// vim: ts=4

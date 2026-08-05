// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The blob cache's eviction coalescing, and its metadata reconciliation.
 *
 * Two eviction runs can be started independently — `onActivate` fires one
 * unawaited, and every over-budget `cacheBlobResponse` fires another. Each
 * iterates its own snapshot of the metadata map, so without coalescing both
 * subtract the same entries from the running total, drive it negative and
 * silently retire the size cap for the rest of the worker's life.
 *
 * Reconciliation covers the other way the accounting drifts: eviction only ever
 * walks the metadata map, so a Cache Storage entry the map doesn't know about
 * (a worker killed inside the persist debounce) would hold budget forever
 * without ever being counted or evicted.
 */

// Not a global in ESM mode, unlike describe/it/expect.
import { jest } from '@jest/globals'

import {
	cacheBlobResponse,
	clearBlobCache,
	evictBlobCache,
	reconcileBlobMeta
} from '../../sw/blob-cache.js'

// Mirrors sw/blob-cache.ts (both module-private).
const MAX_BLOB_SIZE = 500 * 1024
const BLOB_CACHE_BUDGET = 30 * 1024 * 1024

const deleted: string[] = []

// Cache Storage has no equivalent in a node test environment. Only the methods
// the module actually calls are stubbed; `stored` stands in for the entries.
const stored = new Set<string>()
const fakeCache = {
	put: async (req: Request) => {
		stored.add(req.url)
	},
	match: async () => undefined,
	keys: async () => [...stored].map((url) => new Request(url)),
	delete: async (req: Request) => {
		deleted.push(req.url)
		return stored.delete(req.url)
	}
}
;(globalThis as unknown as { caches: unknown }).caches = {
	open: async () => fakeCache,
	delete: async () => true
}

/** A response the cache sizes from its Content-Length, without reading a body. */
function blob(size: number): Response {
	return new Response('x', { headers: { 'Content-Length': String(size) } })
}

/** Fill the cache to just under the budget — one more entry tips it over. */
async function fillToBudget(): Promise<void> {
	const count = Math.floor(BLOB_CACHE_BUDGET / MAX_BLOB_SIZE) + 1
	for (let i = 0; i < count; i++) {
		const url = new URL(`https://cl-o.alice.cloudillo.net/api/files/f${i}?variant=vis.tn`)
		await cacheBlobResponse(url, blob(MAX_BLOB_SIZE))
	}
}

beforeEach(() => {
	// The metadata persist is a 10s timer; fake timers keep it from firing into
	// an IndexedDB that doesn't exist here.
	jest.useFakeTimers()
	deleted.length = 0
})

afterEach(() => {
	jest.useRealTimers()
})

describe('evictBlobCache', () => {
	it('coalesces concurrent runs into one', async () => {
		await fillToBudget()

		const a = evictBlobCache()
		const b = evictBlobCache()
		expect(b).toBe(a)

		await a
	})

	it('never evicts the same key twice', async () => {
		await fillToBudget()

		await Promise.all([evictBlobCache(), evictBlobCache()])

		expect(deleted.length).toBeGreaterThan(0)
		expect(new Set(deleted).size).toBe(deleted.length)
	})
})

describe('reconcileBlobMeta', () => {
	beforeEach(async () => {
		// Module-level state is shared across tests — start from an empty cache
		// and an empty metadata map.
		stored.clear()
		await clearBlobCache()
		deleted.length = 0
	})

	it('deletes a cached entry that no metadata record tracks', async () => {
		const tracked = new URL('https://cl-o.alice.cloudillo.net/api/files/tracked?variant=vis.tn')
		await cacheBlobResponse(tracked, blob(MAX_BLOB_SIZE))
		// What a worker terminated inside the 10s persist debounce leaves behind:
		// the entry is on disk, but nothing in the map accounts for it, so
		// eviction — which only walks the map — can never reclaim it.
		const orphan = 'https://cl-o.alice.cloudillo.net/api/files/orphan?variant=vis.tn'
		stored.add(orphan)

		await reconcileBlobMeta()

		expect(deleted).toEqual([orphan])
		expect(stored.has(orphan)).toBe(false)
		expect(stored.has(tracked.toString())).toBe(true)
	})

	it('stops counting bytes for entries the cache no longer holds', async () => {
		// A full budget's worth of metadata, then the browser reclaims the cache.
		await fillToBudget()
		await evictBlobCache()
		stored.clear()

		await reconcileBlobMeta()

		// The running total is observable only through eviction: without the
		// recompute the map would still claim a full budget and this one small
		// write would tip it over and evict.
		deleted.length = 0
		await cacheBlobResponse(
			new URL('https://cl-o.alice.cloudillo.net/api/files/fresh?variant=vis.tn'),
			blob(MAX_BLOB_SIZE)
		)
		await evictBlobCache()
		expect(deleted).toEqual([])
	})
})

// vim: ts=4

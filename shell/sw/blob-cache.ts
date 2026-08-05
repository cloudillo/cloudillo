// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A size-bounded Cache Storage layer for image blobs (profile pictures and thumbnails), so a
 * feed or gallery reloads without re-fetching every image.
 *
 * The `getAuthToken()` check in `fetchWithBlobCache` is a SECURITY GATE, not incidental:
 * cache keys are token-stripped so a user's blobs survive token rotation, which means an
 * uncredentialed request must never be served from here. Do not factor it out.
 */

import { debug } from './debug.js'
import { deleteItem, getItem, setItem } from './secure-store.js'
import { getAuthToken } from './state.js'

export const BLOB_CACHE_NAME = 'cloudillo-blobs'
const BLOB_CACHE_BUDGET = 30 * 1024 * 1024 // 30MB
const MAX_BLOB_SIZE = 500 * 1024 // 500KB — reject larger blobs
const CACHEABLE_VARIANTS = new Set(['vis.pf', 'vis.tn', 'vis.sd', 'vis.md'])
const VARIANT_PRIORITY: Record<string, number> = {
	'vis.md': 0, // evicted first
	'vis.sd': 1,
	'vis.tn': 2,
	'vis.pf': 3 // evicted last
}
const BLOB_META_KEY = 'blobMeta'
const BLOB_META_PERSIST_INTERVAL = 10_000 // 10s

interface BlobMeta {
	variant: string
	size: number
	cachedAt: number
	accessedAt: number
}

let blobMetaMap = new Map<string, BlobMeta>()
let blobMetaDirty = false
let blobMetaPersistTimer: ReturnType<typeof setTimeout> | null = null
// The pending debounced persist, handed to `evt.waitUntil` so the worker isn't
// terminated with the map still only in memory.
let blobMetaPersistPending: Promise<void> | null = null
let blobTotalSize = 0

function getBlobCache(): Promise<Cache> {
	return caches.open(BLOB_CACHE_NAME)
}

export function isCacheableBlobRequest(url: URL): string | null {
	if (!url.pathname.startsWith('/api/files/')) return null
	const variant = url.searchParams.get('variant')
	if (!variant || !CACHEABLE_VARIANTS.has(variant)) return null
	return variant
}

function blobCacheKey(url: URL): string {
	// Token-stripped, so a user's blobs survive token rotation. See the module note
	// on why that makes the credential check in fetchWithBlobCache load-bearing.
	const normalized = new URL(url.origin + url.pathname)
	const variant = url.searchParams.get('variant')
	if (variant) normalized.searchParams.set('variant', variant)
	return normalized.toString()
}

export async function cacheBlobResponse(
	url: URL,
	response: Response,
	keepAlive?: (p: Promise<unknown>) => void
): Promise<void> {
	const variant = url.searchParams.get('variant')
	if (!variant) return

	// Clone IMMEDIATELY — the caller returns the original response to the browser,
	// so its body is locked once the first await yields control.
	const cloned = response.clone()

	const contentLength = cloned.headers.get('Content-Length')
	let size = contentLength ? parseInt(contentLength, 10) : NaN

	const key = blobCacheKey(url)
	const cache = await getBlobCache()

	if (!Number.isNaN(size) && size > 0 && size <= MAX_BLOB_SIZE) {
		await cache.put(new Request(key), cloned)
	} else if (Number.isNaN(size)) {
		// Chunked encoding: no Content-Length, so measure by reading the body.
		const body = await cloned.arrayBuffer()
		size = body.byteLength
		if (size === 0 || size > MAX_BLOB_SIZE) return
		await cache.put(
			new Request(key),
			new Response(body, {
				status: cloned.status,
				statusText: cloned.statusText,
				headers: cloned.headers
			})
		)
	} else {
		return // size 0, or over the limit
	}

	// Replacing a tracked entry: drop its size first, or the running total drifts upward on
	// every re-cache (a browser-evicted Cache Storage entry, or a miss forced by
	// fetchWithBlobCache's credential gate) until eviction starts discarding live blobs.
	const previous = blobMetaMap.get(key)
	if (previous) blobTotalSize = Math.max(0, blobTotalSize - previous.size)

	blobMetaMap.set(key, {
		variant,
		size,
		cachedAt: Date.now(),
		accessedAt: Date.now()
	})
	blobTotalSize += size
	scheduleBlobMetaPersist(keepAlive)

	if (blobTotalSize > BLOB_CACHE_BUDGET) {
		evictBlobCache().catch((err) => console.warn('[SW] Blob eviction error:', err))
	}
}

// Coalesces concurrent eviction runs. `onActivate` starts one unawaited and
// `cacheBlobResponse` starts another whenever the budget is exceeded; two runs each
// iterating their own snapshot of `blobMetaMap` would subtract the same keys, drive
// `blobTotalSize` negative and silently retire the 30MB cap for the worker's life.
let evictionInFlight: Promise<void> | null = null

export function evictBlobCache(): Promise<void> {
	if (evictionInFlight) return evictionInFlight

	const run = runEviction().finally(() => {
		// Identity guard: only clear the slot if it still holds *this* run.
		if (evictionInFlight === run) evictionInFlight = null
	})
	evictionInFlight = run
	return run
}

async function runEviction(): Promise<void> {
	if (blobTotalSize <= BLOB_CACHE_BUDGET) return

	const cache = await getBlobCache()

	const entries = [...blobMetaMap.entries()].sort(([, a], [, b]) => {
		const pa = VARIANT_PRIORITY[a.variant] ?? 0
		const pb = VARIANT_PRIORITY[b.variant] ?? 0
		if (pa !== pb) return pa - pb // lower priority number = evicted first
		return a.accessedAt - b.accessedAt // oldest first
	})

	for (const [key, meta] of entries) {
		if (blobTotalSize <= BLOB_CACHE_BUDGET) break
		// The snapshot above is stale after every await: a key already dropped (or
		// re-cached under a new size) must not be subtracted from here.
		if (blobMetaMap.get(key) !== meta) continue

		await cache.delete(new Request(key))
		blobTotalSize = Math.max(0, blobTotalSize - meta.size)
		blobMetaMap.delete(key)
	}
	scheduleBlobMetaPersist()
	debug('Blob eviction complete, total:', Math.round(blobTotalSize / 1024), 'KB')
}

export async function clearBlobCache(): Promise<void> {
	await caches.delete(BLOB_CACHE_NAME)
	blobMetaMap.clear()
	blobTotalSize = 0
	blobMetaDirty = false
	try {
		await deleteItem(BLOB_META_KEY)
	} catch {
		/* ignore */
	}
	debug('Blob cache cleared')
}

/**
 * Debounced persist of the metadata map. `keepAlive` (an `evt.waitUntil` from the fetch
 * handler) holds the worker up across the debounce window: a worker terminated inside it
 * loses the map, and `loadBlobMeta()` then restarts at zero while the Cache Storage entries
 * are still on disk — orphans `runEviction` never sees. `reconcileBlobMeta` covers the times
 * nothing was holding the worker up.
 */
function scheduleBlobMetaPersist(keepAlive?: (p: Promise<unknown>) => void): void {
	blobMetaDirty = true
	if (!blobMetaPersistTimer) {
		const self: Promise<void> = new Promise<void>((resolve) => {
			blobMetaPersistTimer = setTimeout(() => {
				blobMetaPersistTimer = null
				persistBlobMeta()
					.catch((err) => console.warn('[SW] Blob meta persist error:', err))
					.finally(() => {
						// Identity guard: the timer is nulled before the write starts,
						// so a persist scheduled while this one is in flight owns the
						// slot by now. Clearing unconditionally would drop the handle
						// `evt.waitUntil` needs and lose that write.
						if (blobMetaPersistPending === self) blobMetaPersistPending = null
						resolve()
					})
			}, BLOB_META_PERSIST_INTERVAL)
		})
		blobMetaPersistPending = self
	}
	if (keepAlive && blobMetaPersistPending) keepAlive(blobMetaPersistPending)
}

async function persistBlobMeta(): Promise<void> {
	if (!blobMetaDirty) return
	const serialized = JSON.stringify([...blobMetaMap.entries()])
	await setItem(BLOB_META_KEY, serialized)
	blobMetaDirty = false
}

export async function loadBlobMeta(): Promise<void> {
	try {
		const raw = (await getItem(BLOB_META_KEY)) as string | undefined
		if (!raw) return
		const entries: [string, BlobMeta][] = JSON.parse(raw)
		blobMetaMap = new Map(entries)
		blobTotalSize = 0
		for (const [, meta] of blobMetaMap) {
			blobTotalSize += meta.size
		}
		debug(
			'Loaded blob meta:',
			blobMetaMap.size,
			'entries,',
			Math.round(blobTotalSize / 1024),
			'KB'
		)
	} catch (err) {
		console.warn('[SW] Failed to load blob meta:', err)
		blobMetaMap.clear()
		blobTotalSize = 0
	}
}

/**
 * Reconcile the metadata map against what Cache Storage actually holds, and recompute the
 * running total from what survives.
 *
 * Run on activate, because the two can diverge: a worker terminated inside the persist
 * debounce loses metadata for entries already written to the cache, and `runEviction` only
 * ever walks the map — so those orphans would occupy the budget forever, uncounted and
 * unevictable.
 */
export async function reconcileBlobMeta(): Promise<void> {
	const cache = await getBlobCache()
	const cachedKeys = new Set((await cache.keys()).map((req) => req.url))

	// Cached but untracked: nothing can ever evict it, so drop it now.
	let orphans = 0
	for (const key of cachedKeys) {
		if (blobMetaMap.has(key)) continue
		await cache.delete(new Request(key))
		orphans++
	}

	// Tracked but no longer cached (the browser reclaimed it): its size must stop counting
	// against the budget.
	let stale = 0
	for (const key of [...blobMetaMap.keys()]) {
		if (cachedKeys.has(key)) continue
		blobMetaMap.delete(key)
		stale++
	}

	blobTotalSize = 0
	for (const [, meta] of blobMetaMap) {
		blobTotalSize += meta.size
	}

	if (orphans > 0 || stale > 0) {
		scheduleBlobMetaPersist()
		debug(
			'Blob meta reconciled:',
			orphans,
			'orphaned entries deleted,',
			stale,
			'stale records dropped,',
			Math.round(blobTotalSize / 1024),
			'KB'
		)
	}
}

export async function fetchWithBlobCache(request: Request, url: URL): Promise<Response | null> {
	const variant = isCacheableBlobRequest(url)
	if (!variant || request.method !== 'GET') return null

	// Cache keys are token-stripped (see blobCacheKey) so a user's blobs survive token
	// rotation — which also means a session holding no credential at all could replay the
	// previous session's private thumbnails. Require *some* credential before serving: the
	// SW's own token, or one the request carries.
	if (!getAuthToken() && !request.headers.get('Authorization')) return null

	const key = blobCacheKey(url)
	const cache = await getBlobCache()

	const cached = await cache.match(new Request(key))
	if (cached) {
		const meta = blobMetaMap.get(key)
		if (meta) {
			meta.accessedAt = Date.now()
			scheduleBlobMetaPersist()
		}
		debug('BLOB CACHE HIT', variant, url.pathname)
		return cached
	}

	return null
}

/**
 * Run a request with the blob cache in front of it: a hit short-circuits the network, a
 * successful response is cached in the background, and a network failure falls back to the
 * cache before rethrowing.
 *
 * `prepare` builds the outgoing request from `original` — where each caller does its own
 * header work (own-tenant Authorization vs. proxy token + Origin) — and only runs on a miss.
 * `keepAlive` is the fetch event's `waitUntil`, forwarded to the metadata persist so a cache
 * write survives the worker going idle.
 */
export async function fetchThroughBlobCache(
	original: Request,
	url: URL,
	prepare: () => Request | Promise<Request>,
	label: string,
	keepAlive?: (p: Promise<unknown>) => void
): Promise<Response> {
	const cached = await fetchWithBlobCache(original, url)
	if (cached) return cached

	try {
		const res = await fetch(await prepare())
		if (res.ok && isCacheableBlobRequest(url)) {
			cacheBlobResponse(url, res, keepAlive).catch((err) =>
				console.warn(`[SW] ${label} blob cache write error:`, err)
			)
		}
		return res
	} catch (err) {
		debug(`${label} FETCH ERROR`, err)
		// Not necessarily the same answer as the miss above: the credential gate refuses an
		// uncredentialed session, and a `sw:token.set` can land while this fetch is in
		// flight. Nothing else changes between the two lookups.
		const fallback = await fetchWithBlobCache(original, url)
		if (fallback) {
			debug(`${label} BLOB CACHE FALLBACK`, url.pathname)
			return fallback
		}
		throw err
	}
}
// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Write queue for the offline cache — writes are queued so they never block the
 * main rendering path.
 */

import type { FileView } from '@cloudillo/core'
import type { ActionView } from '@cloudillo/types'

import { readSwKeyCookie } from '../pwa/cookie.js'
import { cacheActions } from './action-cache.js'
import { evictIfNeeded } from './encrypted-store.js'
import { cacheFiles } from './file-cache.js'

let writeQueue: Promise<void> = Promise.resolve()

/**
 * Enqueue a cache write operation. Writes run sequentially but never
 * block the caller — errors are logged and swallowed.
 */
function enqueueWrite(fn: () => Promise<void>): void {
	writeQueue = writeQueue.then(fn).catch((err) => {
		console.warn('[Cache] Write failed:', err)
	})
}

/**
 * No `swKey` cookie means no encrypted cache: `putRecords` would encrypt nothing
 * and `evictIfNeeded` would reject on `openDB()`. Bail so a session without
 * "Remember me" — the default — doesn't warn once a minute about a cache it was
 * never going to have.
 */
function cacheWritable(): boolean {
	return !!readSwKeyCookie()
}

/**
 * Cache files in the background (non-blocking).
 *
 * Files are keyed in the cache by the owner's idTag (see file-cache.ts).
 * The `fallbackOwnerIdTag` parameter is used only when an API response
 * comes back without an `owner` field — pass the active viewing context
 * as the fallback for backwards compatibility.
 */
export function cacheFilesAsync(fallbackOwnerIdTag: string, files: FileView[]): void {
	if (files.length === 0 || !cacheWritable()) return
	enqueueWrite(() => cacheFiles(fallbackOwnerIdTag, files))
	maybeEvict(fallbackOwnerIdTag)
}

/**
 * Cache actions in the background (non-blocking).
 */
export function cacheActionsAsync(contextIdTag: string, actions: ActionView[]): void {
	if (actions.length === 0 || !cacheWritable()) return
	enqueueWrite(() => cacheActions(contextIdTag, actions))
	maybeEvict(contextIdTag)
}

// `evictIfNeeded` calls `navigator.storage.estimate()`, which is not free, so a
// fast-scrolling feed must not trigger one per page.
const EVICT_INTERVAL_MS = 60_000
let lastEvictAt = 0

/**
 * Run an eviction check in the background, at most once per
 * `EVICT_INTERVAL_MS`. Queued behind the pending writes so it never sees a
 * half-written batch.
 */
function evictAsync(protectedContext?: string): void {
	enqueueWrite(() => evictIfNeeded(protectedContext))
}

function maybeEvict(protectedContext: string): void {
	const now = Date.now()
	if (now - lastEvictAt < EVICT_INTERVAL_MS) return
	lastEvictAt = now
	evictAsync(protectedContext)
}

// vim: ts=4

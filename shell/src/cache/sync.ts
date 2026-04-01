// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Non-blocking write queue and background sync for the offline cache.
 *
 * Write operations are queued so they never block the main rendering path.
 * Background sync fetches recently changed metadata on app startup.
 */

import type { FileView } from '@cloudillo/core'
import type { ActionView } from '@cloudillo/types'
import { cacheFiles } from './file-cache.js'
import { cacheActions } from './action-cache.js'
import { evictIfNeeded } from './encrypted-store.js'

// ============================================
// NON-BLOCKING WRITE QUEUE
// ============================================

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
 * Cache files in the background (non-blocking).
 */
export function cacheFilesAsync(contextIdTag: string, files: FileView[]): void {
	if (files.length === 0) return
	enqueueWrite(() => cacheFiles(contextIdTag, files))
}

/**
 * Cache actions in the background (non-blocking).
 */
export function cacheActionsAsync(contextIdTag: string, actions: ActionView[]): void {
	if (actions.length === 0) return
	enqueueWrite(() => cacheActions(contextIdTag, actions))
}

/**
 * Run eviction check in the background.
 */
export function evictAsync(protectedContext?: string): void {
	enqueueWrite(() => evictIfNeeded(protectedContext))
}

// vim: ts=4

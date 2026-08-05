// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * React hooks for integrating the offline cache with existing data hooks.
 *
 * The main entry point is `createCachedFetchPage` which wraps a network
 * fetchPage function with transparent cache read/write.
 */

import { FetchError, type FileView, hasApiToken } from '@cloudillo/core'
import type { ActionView } from '@cloudillo/types'

import { queryCachedActions } from './action-cache.js'
import { queryCachedFiles } from './file-cache.js'
import { cacheActionsAsync, cacheFilesAsync } from './sync.js'
import type { CachedFetchResult } from './types.js'

// ============================================
// FILE CACHE INTEGRATION
// ============================================

/**
 * An auth failure is not "offline". The cache is keyed by content *owner*, not
 * by viewer, so falling back on a 401/403 — or for a caller holding no
 * credential for that owner — would show a dead or foreign session the owner's
 * private data.
 *
 * The credential is checked against `contextIdTag` itself, not against the home
 * session: a user whose community membership was revoked has a perfectly valid
 * home token and must still stop reading that community's cached rows. Guest
 * mode and untrusted foreign profiles stop reading too — no token was ever
 * registered for them.
 *
 * Exported for its test — it stays the gate every fallback in this module goes
 * through.
 */
export function mayUseCache(
	err: unknown,
	contextIdTag: string | undefined
): contextIdTag is string {
	if (!contextIdTag || !hasApiToken(contextIdTag)) return false
	if (err instanceof FetchError && (err.httpStatus === 401 || err.httpStatus === 403))
		return false
	return true
}

/**
 * Wraps a file fetchPage function with cache read/write.
 * On network success: returns data and caches in background.
 * On network failure: returns cached data with isOffline flag — but only when a
 * live token for `contextIdTag` is registered, see mayUseCache().
 */
export function createCachedFileFetchPage(
	contextIdTag: string | undefined,
	fetchPage: (cursor: string | null, limit: number) => Promise<CachedFetchResult<FileView>>,
	queryParams: {
		parentId?: string | null
		fileTp?: string
		starred?: boolean
		pinned?: boolean
		contentType?: string
	}
): (cursor: string | null, limit: number) => Promise<CachedFetchResult<FileView>> {
	return async (cursor: string | null, limit: number) => {
		// Try network first
		try {
			const result = await fetchPage(cursor, limit)

			// Cache results in background (non-blocking)
			if (contextIdTag && result.items.length > 0) {
				queueMicrotask(() => cacheFilesAsync(contextIdTag, result.items))
			}

			return result
		} catch (err) {
			// Network failed — fall back to cache
			if (!mayUseCache(err, contextIdTag)) throw err

			try {
				const cached = await queryCachedFiles(contextIdTag, queryParams, limit)
				if (cached.length === 0) throw err // No cache either — propagate original error

				return {
					items: cached,
					nextCursor: null,
					hasMore: false,
					isOffline: true
				}
			} catch {
				throw err // Cache query failed — propagate original error
			}
		}
	}
}

// ============================================
// ACTION CACHE INTEGRATION
// ============================================

/**
 * Wraps an action fetchPage function with cache read/write.
 *
 * The offline fallback is read only when a live token for `contextIdTag` is
 * registered — see mayUseCache().
 */
export function createCachedActionFetchPage(
	contextIdTag: string | undefined,
	fetchPage: (cursor: string | null, limit: number) => Promise<CachedFetchResult<ActionView>>,
	queryParams: {
		type?: string | string[]
		audience?: string
		audienceType?: 'personal' | 'community'
		visibility?: string | string[]
		issuer?: string
	}
): (cursor: string | null, limit: number) => Promise<CachedFetchResult<ActionView>> {
	return async (cursor: string | null, limit: number) => {
		try {
			const result = await fetchPage(cursor, limit)

			if (contextIdTag && result.items.length > 0) {
				queueMicrotask(() => cacheActionsAsync(contextIdTag, result.items))
			}

			return result
		} catch (err) {
			if (!mayUseCache(err, contextIdTag)) throw err

			try {
				const cached = await queryCachedActions(contextIdTag, queryParams, limit)
				if (cached.length === 0) throw err

				return {
					items: cached,
					nextCursor: null,
					hasMore: false,
					isOffline: true
				}
			} catch {
				throw err
			}
		}
	}
}

// vim: ts=4

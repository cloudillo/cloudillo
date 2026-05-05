// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * React hooks for integrating the offline cache with existing data hooks.
 *
 * The main entry point is `createCachedFetchPage` which wraps a network
 * fetchPage function with transparent cache read/write.
 */

import type { FileView } from '@cloudillo/core'
import type { ActionView } from '@cloudillo/types'
import type { CachedFetchResult } from './types.js'
import { queryCachedFiles } from './file-cache.js'
import { queryCachedActions } from './action-cache.js'
import { cacheFilesAsync, cacheActionsAsync } from './sync.js'

// ============================================
// FILE CACHE INTEGRATION
// ============================================

/**
 * Wraps a file fetchPage function with cache read/write.
 * On network success: returns data and caches in background.
 * On network failure: returns cached data with isOffline flag.
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
			if (!contextIdTag) throw err

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
 */
export function createCachedActionFetchPage(
	contextIdTag: string | undefined,
	fetchPage: (cursor: string | null, limit: number) => Promise<CachedFetchResult<ActionView>>,
	queryParams: {
		type?: string
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
			if (!contextIdTag) throw err

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

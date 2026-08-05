// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Type definitions for the encrypted offline data cache.
 */

// Base shape for all cached records
export interface CachedRecordBase {
	_cacheKey: string // "${contextIdTag}:${id}"
	contextIdTag: string
	_encPayload: ArrayBuffer // AES-GCM encrypted full JSON record
	cachedAt: number // Unix timestamp for LRU eviction
}

// Result of a cached fetch — extends normal results with offline flag
export interface CachedFetchResult<T> {
	items: T[]
	nextCursor: string | null
	hasMore: boolean
	isOffline?: boolean
}

// Specification for querying IndexedDB when offline
export interface OfflineQuerySpec {
	indexName: string
	range: IDBKeyRange
	direction?: IDBCursorDirection
}

// Store configuration for database initialization
export interface StoreConfig {
	name: string
	keyPath: string
	indexes: IndexConfig[]
}

export interface IndexConfig {
	name: string
	keyPath: string | string[]
	unique?: boolean
}

// vim: ts=4

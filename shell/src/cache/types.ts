// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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

// File cache record — unencrypted index fields for offline queries
export interface CachedFileRecord extends CachedRecordBase {
	fileId: string
	parentId: string // "__root__" for root-level files
	fileTp: string // "BLOB" | "CRDT" | "RTDB" | "FLDR"
	contentType: string
	starred: number // 0 or 1 (for indexing)
	pinned: number // 0 or 1 (for indexing)
	createdAt: string
}

// Action cache record — unencrypted index fields for offline queries
export interface CachedActionRecord extends CachedRecordBase {
	actionId: string
	type: string // "POST" | "REACT" | "CMNT" | "MSG" | "CONN" | "FLLW" ...
	status: string // "P" | "A" | "D" | "C" | "N" | "R" | "S"
	audienceTag: string // issuer or audience idTag for filtering
	createdAt: string
}

// Profile cache record
export interface CachedProfileRecord extends CachedRecordBase {
	idTag: string
}

// Sync metadata stored in the "meta" store
export interface SyncMeta {
	key: string // "${contextIdTag}:${storeName}"
	lastSyncAt: string // ISO timestamp
	schemaVersion: number
}

// Result of a cached fetch — extends normal results with offline flag
export interface CachedFetchResult<T> {
	items: T[]
	nextCursor: string | null
	hasMore: boolean
	isOffline?: boolean
}

// Options for creating a cached fetch page function
export interface CachedFetchPageOptions<T> {
	storeName: 'files' | 'actions' | 'profiles'
	contextIdTag: string
	fetchPage: (cursor: string | null, limit: number) => Promise<CachedFetchResult<T>>
	extractKey: (item: T) => string
	extractIndexFields: (item: T) => Record<string, unknown>
	buildOfflineQuery?: () => OfflineQuerySpec
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

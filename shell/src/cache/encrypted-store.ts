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
 * Encrypted IndexedDB data store for offline metadata caching.
 *
 * Single database (`cloudillo-data-cache`) with object stores for files,
 * actions, profiles, and sync metadata. Record payloads are AES-GCM
 * encrypted; index fields are stored in the clear for offline queries.
 */

import { encryptJSON, decryptJSON } from './crypto.js'
import type { CachedRecordBase, SyncMeta, StoreConfig, OfflineQuerySpec } from './types.js'

const DB_NAME = 'cloudillo-data-cache'
const DB_VERSION = 1
const MAX_CACHE_SIZE = 50 * 1024 * 1024 // 50MB approximate budget

// Store configurations with their indexes
const STORE_CONFIGS: StoreConfig[] = [
	{
		name: 'files',
		keyPath: '_cacheKey',
		indexes: [
			{ name: 'by-context', keyPath: 'contextIdTag' },
			{ name: 'by-context-parent', keyPath: ['contextIdTag', 'parentId'] },
			{ name: 'by-context-type', keyPath: ['contextIdTag', 'fileTp'] },
			{ name: 'by-context-content-type', keyPath: ['contextIdTag', 'contentType'] },
			{ name: 'by-context-starred', keyPath: ['contextIdTag', 'starred'] },
			{ name: 'by-context-pinned', keyPath: ['contextIdTag', 'pinned'] },
			{ name: 'by-context-created', keyPath: ['contextIdTag', 'createdAt'] },
			{ name: 'by-cachedAt', keyPath: 'cachedAt' }
		]
	},
	{
		name: 'actions',
		keyPath: '_cacheKey',
		indexes: [
			{ name: 'by-context', keyPath: 'contextIdTag' },
			{ name: 'by-context-type', keyPath: ['contextIdTag', 'type'] },
			{ name: 'by-context-type-created', keyPath: ['contextIdTag', 'type', 'createdAt'] },
			{ name: 'by-context-audience', keyPath: ['contextIdTag', 'audienceTag'] },
			{ name: 'by-cachedAt', keyPath: 'cachedAt' }
		]
	},
	{
		name: 'profiles',
		keyPath: '_cacheKey',
		indexes: [
			{ name: 'by-context', keyPath: 'contextIdTag' },
			{ name: 'by-cachedAt', keyPath: 'cachedAt' }
		]
	},
	{
		name: 'meta',
		keyPath: 'key',
		indexes: []
	}
]

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise

	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)

		request.onupgradeneeded = () => {
			const db = request.result

			for (const config of STORE_CONFIGS) {
				if (!db.objectStoreNames.contains(config.name)) {
					const store = db.createObjectStore(config.name, { keyPath: config.keyPath })
					for (const idx of config.indexes) {
						store.createIndex(idx.name, idx.keyPath, { unique: idx.unique ?? false })
					}
				}
			}
		}

		request.onsuccess = () => resolve(request.result)
		request.onerror = () => {
			dbPromise = null
			reject(request.error)
		}
	})

	return dbPromise
}

// ============================================
// GENERIC OPERATIONS
// ============================================

/**
 * Put a record into a store. The payload field of `data` is encrypted
 * before writing; index fields are written in the clear.
 */
export async function putRecord<T>(
	storeName: string,
	indexFields: Record<string, unknown>,
	payload: T,
	cacheKey: string,
	contextIdTag: string
): Promise<void> {
	const encPayload = await encryptJSON(payload)
	if (!encPayload) return // Encryption unavailable — don't store unencrypted

	const record = {
		...indexFields,
		_cacheKey: cacheKey,
		contextIdTag,
		_encPayload: encPayload,
		cachedAt: Date.now()
	}

	const db = await openDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readwrite')
		tx.objectStore(storeName).put(record)
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
	})
}

/**
 * Put multiple records in a single transaction.
 */
export async function putRecords<T>(
	storeName: string,
	items: Array<{
		indexFields: Record<string, unknown>
		payload: T
		cacheKey: string
		contextIdTag: string
	}>
): Promise<void> {
	const records = await Promise.all(
		items.map(async ({ indexFields, payload, cacheKey, contextIdTag }) => {
			const encPayload = await encryptJSON(payload)
			if (!encPayload) return null

			return {
				...indexFields,
				_cacheKey: cacheKey,
				contextIdTag,
				_encPayload: encPayload,
				cachedAt: Date.now()
			}
		})
	)

	const validRecords = records.filter((r) => r !== null)
	if (validRecords.length === 0) return

	const db = await openDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readwrite')
		const store = tx.objectStore(storeName)
		for (const record of validRecords) {
			store.put(record)
		}
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
	})
}

/**
 * Get a single record by cache key and decrypt its payload.
 */
export async function getRecord<T>(storeName: string, cacheKey: string): Promise<T | null> {
	const db = await openDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readonly')
		const request = tx.objectStore(storeName).get(cacheKey)
		request.onsuccess = async () => {
			const record = request.result as CachedRecordBase | undefined
			if (!record?._encPayload) {
				resolve(null)
				return
			}
			const payload = await decryptJSON<T>(record._encPayload)
			resolve(payload)
		}
		request.onerror = () => reject(request.error)
	})
}

/**
 * Query records using an index. Returns decrypted payloads.
 */
export async function queryRecords<T>(
	storeName: string,
	query: OfflineQuerySpec,
	limit?: number
): Promise<T[]> {
	const db = await openDB()

	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readonly')
		const store = tx.objectStore(storeName)
		const index = store.index(query.indexName)
		const request = index.openCursor(query.range, query.direction ?? 'prev')

		const records: CachedRecordBase[] = []

		request.onsuccess = () => {
			const cursor = request.result
			if (cursor && (!limit || records.length < limit)) {
				records.push(cursor.value as CachedRecordBase)
				cursor.continue()
			} else {
				// Decrypt all payloads in parallel
				Promise.all(records.map((r) => decryptJSON<T>(r._encPayload)))
					.then((payloads) => resolve(payloads.filter((p) => p !== null)))
					.catch(reject)
			}
		}
		request.onerror = () => reject(request.error)
	})
}

/**
 * Delete a single record by cache key.
 */
export async function deleteRecord(storeName: string, cacheKey: string): Promise<void> {
	const db = await openDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readwrite')
		tx.objectStore(storeName).delete(cacheKey)
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
	})
}

/**
 * Delete all records for a given context in a store.
 */
export async function deleteByContext(storeName: string, contextIdTag: string): Promise<void> {
	const db = await openDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readwrite')
		const store = tx.objectStore(storeName)
		const index = store.index('by-context')
		const request = index.openCursor(IDBKeyRange.only(contextIdTag))

		request.onsuccess = () => {
			const cursor = request.result
			if (cursor) {
				cursor.delete()
				cursor.continue()
			}
		}
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
	})
}

// ============================================
// SYNC METADATA
// ============================================

export async function getSyncMeta(key: string): Promise<SyncMeta | null> {
	const db = await openDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction('meta', 'readonly')
		const request = tx.objectStore('meta').get(key)
		request.onsuccess = () => resolve((request.result as SyncMeta) ?? null)
		request.onerror = () => reject(request.error)
	})
}

export async function putSyncMeta(meta: SyncMeta): Promise<void> {
	const db = await openDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction('meta', 'readwrite')
		tx.objectStore('meta').put(meta)
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
	})
}

// ============================================
// EVICTION
// ============================================

// Live document types that should be prioritized during eviction
const LIVE_DOC_TYPES = new Set(['CRDT', 'RTDB'])

/**
 * Evict oldest records across all data stores until cache is under budget.
 * Skips records belonging to `protectedContext` (the active context).
 * Prioritizes keeping live documents (CRDT/RTDB) — they are evicted last.
 */
export async function evictIfNeeded(protectedContext?: string): Promise<void> {
	const estimate = await navigator.storage?.estimate?.()
	if (!estimate?.usage || !estimate?.quota) return

	const usage = estimate.usage
	const budget = Math.min(MAX_CACHE_SIZE, estimate.quota * 0.8)

	if (usage < budget) return

	const db = await openDB()
	const storeNames = ['files', 'actions', 'profiles']

	// First pass: evict non-live-doc records (oldest first)
	for (const storeName of storeNames) {
		const tx = db.transaction(storeName, 'readwrite')
		const store = tx.objectStore(storeName)
		const index = store.index('by-cachedAt')
		const request = index.openCursor(null, 'next') // Oldest first

		await new Promise<void>((resolve) => {
			request.onsuccess = () => {
				const cursor = request.result
				if (!cursor) {
					resolve()
					return
				}

				const record = cursor.value as CachedRecordBase & { fileTp?: string }

				// Skip active context
				if (protectedContext && record.contextIdTag === protectedContext) {
					cursor.continue()
					return
				}

				// Skip live documents (CRDT/RTDB) in first pass
				if (storeName === 'files' && LIVE_DOC_TYPES.has(record.fileTp ?? '')) {
					cursor.continue()
					return
				}

				cursor.delete()
				cursor.continue()
			}
			tx.oncomplete = () => resolve()
		})
	}

	// Check if we freed enough space
	const afterEstimate = await navigator.storage?.estimate?.()
	if (!afterEstimate?.usage || afterEstimate.usage < budget) return

	// Second pass: evict live docs too if still over budget
	const tx = db.transaction('files', 'readwrite')
	const store = tx.objectStore('files')
	const index = store.index('by-cachedAt')
	const request = index.openCursor(null, 'next')

	await new Promise<void>((resolve) => {
		request.onsuccess = () => {
			const cursor = request.result
			if (!cursor) {
				resolve()
				return
			}

			const record = cursor.value as CachedRecordBase
			if (protectedContext && record.contextIdTag === protectedContext) {
				cursor.continue()
				return
			}

			cursor.delete()
			cursor.continue()
		}
		tx.oncomplete = () => resolve()
	})
}

/**
 * Clear all cached data. Used on logout or encryption key reset.
 */
export async function clearAll(): Promise<void> {
	const db = await openDB()
	const storeNames = ['files', 'actions', 'profiles', 'meta']

	for (const storeName of storeNames) {
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(storeName, 'readwrite')
			tx.objectStore(storeName).clear()
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
		})
	}
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Encrypted IndexedDB data store for offline metadata caching.
 *
 * Single database (`cloudillo-data-cache`) with object stores for files and
 * actions. Record payloads are AES-GCM encrypted; index fields are stored in
 * the clear for offline queries.
 */

import { DATA_CACHE_DB, openDb, openedDb } from '../../shared/idb.js'
import { reportKeyUnavailable } from '../auth/key-signal.js'
import { readSwKeyCookie } from '../pwa/cookie.js'
import { decryptJSON, encryptJSON } from './crypto.js'
import type { CachedRecordBase, OfflineQuerySpec, StoreConfig } from './types.js'

const DB_NAME = DATA_CACHE_DB
// v2: `files` moved from viewer-context keying to owner keying (store dropped and recreated,
// metadata regenerated on the first list call). v3: unused `profiles`/`meta` stores dropped.
const DB_VERSION = 3

// Fraction of the origin's *quota* above which eviction switches to its aggressive target.
// Relative, not an absolute byte ceiling: most of the origin's bytes are the SW blob cache and
// the CRDT database, neither of which this module can delete, so a fixed ceiling would read as
// permanent pressure on any device with a healthy quota and a large blob cache.
const PRESSURE_RATIO = 0.8

// Records each data store may hold. This — not a byte figure — is what eviction controls, so
// it is what terminates the walk. Metadata records are small, so a few thousand per store is
// modest and still far more history than any offline session browses.
const MAX_RECORDS_PER_STORE = 5000

// The target under origin-wide storage pressure, where a smaller offline cache is the better
// trade.
const PRESSURE_RECORDS_PER_STORE = 1000

const STORE_CONFIGS: StoreConfig[] = [
	{
		name: 'files',
		keyPath: '_cacheKey',
		indexes: [
			{ name: 'by-owner', keyPath: 'ownerIdTag' },
			{ name: 'by-owner-parent', keyPath: ['ownerIdTag', 'parentId'] },
			{ name: 'by-owner-type', keyPath: ['ownerIdTag', 'fileTp'] },
			{ name: 'by-owner-content-type', keyPath: ['ownerIdTag', 'contentType'] },
			{ name: 'by-owner-starred', keyPath: ['ownerIdTag', 'starred'] },
			{ name: 'by-owner-pinned', keyPath: ['ownerIdTag', 'pinned'] },
			{ name: 'by-owner-created', keyPath: ['ownerIdTag', 'createdAt'] },
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
	}
]

// The stores eviction walks, and the only ones anything writes.
const DATA_STORES = ['files', 'actions']

function openDB(): Promise<IDBDatabase> {
	const open = openedDb(DB_NAME)
	if (open) return open

	// Refuse to create the database before the encryption key is available, or pre-auth code
	// paths materialise an empty `cloudillo-data-cache` holding nothing but an unusable schema.
	if (!readSwKeyCookie()) {
		reportKeyUnavailable()
		return Promise.reject(new Error('Encrypted store unavailable: no encryption key'))
	}

	return openDb(DB_NAME, DB_VERSION, (db, oldVersion) => {
		// v1 → v2: index keypaths and the cache-key prefix changed with the rekey, so drop
		// and recreate. The cache repopulates on the next list call.
		if (oldVersion < 2 && db.objectStoreNames.contains('files')) {
			db.deleteObjectStore('files')
		}

		// v2 → v3: `profiles` and `meta` never had a writer that survived (profile-cache.ts
		// is gone); drop the dead schema.
		if (oldVersion < 3) {
			for (const dead of ['profiles', 'meta']) {
				if (db.objectStoreNames.contains(dead)) db.deleteObjectStore(dead)
			}
		}

		for (const config of STORE_CONFIGS) {
			if (!db.objectStoreNames.contains(config.name)) {
				const store = db.createObjectStore(config.name, { keyPath: config.keyPath })
				for (const idx of config.indexes) {
					store.createIndex(idx.name, idx.keyPath, { unique: idx.unique ?? false })
				}
			}
		}
	})
}

// ============================================
// GENERIC OPERATIONS
// ============================================

/**
 * Put multiple records in a single transaction. Payloads are encrypted before writing; index
 * fields are written in the clear. The caller must include the scoping field (`contextIdTag`
 * for the action store, `ownerIdTag` for the file store) in indexFields.
 */
export async function putRecords<T>(
	storeName: string,
	items: Array<{
		indexFields: Record<string, unknown>
		payload: T
		cacheKey: string
	}>
): Promise<void> {
	const records = await Promise.all(
		items.map(async ({ indexFields, payload, cacheKey }) => {
			const encPayload = await encryptJSON(payload)
			if (!encPayload) return null

			return {
				...indexFields,
				_cacheKey: cacheKey,
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
 * Drop records whose payloads no longer decrypt with the current key. Fire-and-forget
 * self-heal so a stale entry (e.g. from a previous swKey) doesn't keep failing on every
 * query; the next online fetch repopulates fresh ciphertext.
 */
async function purgeUndecryptable(storeName: string, cacheKeys: string[]): Promise<void> {
	if (cacheKeys.length === 0) return
	try {
		const db = await openDB()
		await new Promise<void>((resolve) => {
			const tx = db.transaction(storeName, 'readwrite')
			const store = tx.objectStore(storeName)
			for (const key of cacheKeys) store.delete(key)
			tx.oncomplete = () => resolve()
			tx.onerror = () => resolve()
		})
		console.warn(
			`[Cache] Purged ${cacheKeys.length} undecryptable record(s) from "${storeName}"`
		)
	} catch (err) {
		console.warn('[Cache] Failed to purge undecryptable records:', err)
	}
}

/**
 * Get a single record by cache key and decrypt its payload.
 */
export async function getRecord<T>(storeName: string, cacheKey: string): Promise<T | null> {
	let db: IDBDatabase
	try {
		db = await openDB()
	} catch {
		return null
	}
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
			if (payload === null) {
				void purgeUndecryptable(storeName, [cacheKey])
			}
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
	let db: IDBDatabase
	try {
		db = await openDB()
	} catch {
		return []
	}

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
				// Drop and purge payloads that fail to decrypt (stale ciphertext from a
				// previous swKey — the next fetch repopulates them).
				Promise.all(records.map((r) => decryptJSON<T>(r._encPayload)))
					.then((payloads) => {
						const result: T[] = []
						const badKeys: string[] = []
						for (let i = 0; i < payloads.length; i++) {
							const p = payloads[i]
							if (p === null) badKeys.push(records[i]._cacheKey)
							else result.push(p)
						}
						if (badKeys.length > 0) void purgeUndecryptable(storeName, badKeys)
						resolve(result)
					})
					.catch(reject)
			}
		}
		request.onerror = () => reject(request.error)
	})
}

/**
 * Clear all cached data. Used on logout or encryption key reset.
 */
export async function clearAll(): Promise<void> {
	const db = await openDB()

	for (const storeName of DATA_STORES) {
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(storeName, 'readwrite')
			tx.objectStore(storeName).clear()
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
		})
	}
}

// ============================================
// EVICTION
// ============================================

const LIVE_DOC_TYPES = new Set(['CRDT', 'RTDB'])

/**
 * Trim `storeName` back to `target` records, oldest first.
 *
 * The count and the walk share ONE readwrite transaction: counted separately, a write landing
 * in between leaves the budget off by that much.
 *
 * `skip` vetoes a record (active context, and live docs in the first pass); a vetoed record
 * does not count as deleted, so the walk keeps going — but it always stops once the budget
 * (`count - target`) is spent, and never runs to the end of the index. Running to the end
 * would make this destructive: with a termination condition eviction cannot influence, every
 * run empties the cache outside the active context.
 */
function trimStore(
	db: IDBDatabase,
	storeName: string,
	target: number,
	skip: (record: CachedRecordBase & { fileTp?: string; ownerIdTag?: string }) => boolean
): Promise<void> {
	return new Promise<void>((resolve) => {
		const tx = db.transaction(storeName, 'readwrite')
		const store = tx.objectStore(storeName)
		const countRequest = store.count()

		countRequest.onsuccess = () => {
			const budget = countRequest.result - target
			// Already under target: commit the (empty) transaction and stop.
			if (budget <= 0) return

			const request = store.index('by-cachedAt').openCursor(null, 'next') // Oldest first
			let deleted = 0

			request.onsuccess = () => {
				const cursor = request.result
				// Stop walking and let the transaction commit the deletes issued so far.
				if (!cursor) return

				const record = cursor.value as CachedRecordBase & {
					fileTp?: string
					ownerIdTag?: string
				}
				if (!skip(record)) {
					cursor.delete()
					deleted++
					if (deleted >= budget) return
				}
				cursor.continue()
			}
		}
		tx.oncomplete = () => resolve()
		tx.onabort = () => resolve()
		tx.onerror = () => resolve()
	})
}

/**
 * Trim each data store back to a bounded record count, oldest first. Records belonging to
 * `protectedContext` (the active context) are never evicted, and live documents (CRDT/RTDB)
 * survive the first pass — their absence is the most visible offline.
 *
 * The origin's `storage.estimate()` is only a pressure hint: usage past `PRESSURE_RATIO` of the
 * quota selects the aggressive target and enables the live-doc pass. Deliberately *not* the
 * termination condition — this function can only delete `files`/`actions` metadata, while the
 * origin's bytes live mostly in the SW blob cache and the CRDT database, so "keep deleting
 * until the origin is under budget" never terminates and simply empties the cache every run.
 *
 * Needed at all because `pwa/registration.ts` asks for persistent storage, which is what stops
 * the browser reclaiming this origin on its own.
 */
export async function evictIfNeeded(protectedContext?: string): Promise<void> {
	// Nothing to evict without a key — the store either doesn't exist or holds records this
	// session can't read. Bail before `openDB()`, whose rejection would otherwise be the only
	// unguarded one here. A DB opened earlier in the session still evicts, so a mid-session
	// cookie loss doesn't strand its records.
	if (!readSwKeyCookie() && !openedDb(DB_NAME)) return

	const estimate = await navigator.storage?.estimate?.()
	// Unknown usage or quota (estimate unsupported or blocked) reads as no pressure, so the
	// count-based trim below still runs.
	const underPressure =
		!!estimate?.usage && !!estimate?.quota && estimate.usage >= estimate.quota * PRESSURE_RATIO
	const target = underPressure ? PRESSURE_RECORDS_PER_STORE : MAX_RECORDS_PER_STORE

	const db = await openDB()

	// First pass: non-live-doc records, oldest first.
	for (const storeName of DATA_STORES) {
		await trimStore(db, storeName, target, (record) => {
			// Skip the active context. `files` is owner-keyed, which covers both personal
			// files in the personal context and community files in theirs; the other
			// stores stay viewer-scoped.
			const scopeId = storeName === 'files' ? record.ownerIdTag : record.contextIdTag
			if (protectedContext && scopeId === protectedContext) return true
			// Live documents (CRDT/RTDB) are held back for the second pass.
			return storeName === 'files' && LIVE_DOC_TYPES.has(record.fileTp ?? '')
		})
	}

	// Second pass: only under origin pressure, and only for the live docs the first pass held
	// back. A last resort — if the first pass already brought `files` under target there is
	// nothing worth sacrificing them for.
	if (!underPressure) return

	await trimStore(
		db,
		'files',
		target,
		(record) => !!protectedContext && record.ownerIdTag === protectedContext
	)
}

// vim: ts=4

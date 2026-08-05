// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Storage Message Handlers for Shell
 *
 * Handles storage operations from sandboxed apps via postMessage.
 * Apps in sandboxed iframes cannot access IndexedDB directly,
 * so we proxy their requests through the shell.
 *
 * Values are AES-GCM encrypted under the `swKey` cookie, and the database is
 * never opened without it — the same rule the other two client-side stores
 * follow (`cache/encrypted-store.ts`, `message-bus/handlers/crdt.ts`). A session
 * with no stored API key ("remember me" off) has no cookie, and must leave
 * nothing user-owned on disk.
 */

import type { StorageOpReq } from '@cloudillo/core'

import { APP_STORAGE_DB, closeDb, openDb, openedDb } from '../../../shared/idb.js'
import { decryptJSON, encryptJSON } from '../../cache/crypto.js'
import { readSwKeyCookie } from '../../pwa/cookie.js'
import type { ShellMessageBus } from '../shell-bus.js'

// ============================================
// INDEXEDDB STORAGE
// ============================================

const DB_NAME = APP_STORAGE_DB
// Bumped to 2 when values became encrypted. The v1 rows are plaintext app data
// written before the cookie gate existed, so the upgrade drops the store rather
// than carrying them across.
const DB_VERSION = 2
const STORE_NAME = 'data'

// The envelope every record is stored in. `decryptJSON` reports a failure as
// `null`, so a bare value would make an app's stored `null` indistinguishable
// from a record that no longer decrypts — and get it deleted.
interface StoredValue {
	v: unknown
}

/**
 * Open the IndexedDB database
 */
async function openDatabase(): Promise<IDBDatabase> {
	const open = openedDb(DB_NAME)
	if (open) return open

	// Refuse to create the database before the encryption key is available. Every
	// value written here is app data belonging to the signed-in user, so without a
	// key there is nothing we may write — and materialising the database at all
	// would leave an empty schema behind for the next visitor.
	if (!readSwKeyCookie()) {
		return Promise.reject(new Error('App storage unavailable: no encryption key'))
	}

	return openDb(DB_NAME, DB_VERSION, (database, oldVersion) => {
		// v1 → v2: the existing rows are plaintext; they must not survive.
		if (oldVersion < 2 && database.objectStoreNames.contains(STORE_NAME)) {
			database.deleteObjectStore(STORE_NAME)
		}
		if (!database.objectStoreNames.contains(STORE_NAME)) {
			database.createObjectStore(STORE_NAME)
		}
	})
}

/**
 * Close the module's connection so a `deleteDatabase(APP_STORAGE_DB)` can run.
 * An open connection defers the delete (`onblocked`), which is exactly what the
 * logout and dead-session wipes must not hit.
 */
export function closeAppStorage(): void {
	closeDb(DB_NAME)
}

/**
 * Get a value from storage, decrypted. A record that no longer decrypts (written
 * under a previous swKey) reads as `undefined` and is dropped in passing, so the
 * store self-heals — same "drop the record, never escalate" contract as
 * `shared/aes.ts` `aesDecrypt`.
 */
async function storageGet(key: string): Promise<unknown> {
	const database = await openDatabase()
	const encrypted = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
		const tx = database.transaction(STORE_NAME, 'readonly')
		const store = tx.objectStore(STORE_NAME)
		const request = store.get(key)

		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve(request.result as ArrayBuffer | undefined)
	})
	if (encrypted === undefined) return undefined

	const record = await decryptJSON<StoredValue>(encrypted)
	if (record === null) {
		await storageDelete(key).catch(() => {})
		return undefined
	}
	return record.v
}

/**
 * Set a value in storage, encrypted.
 */
async function storageSet(key: string, value: unknown): Promise<void> {
	const encrypted = await encryptJSON({ v: value } satisfies StoredValue)
	// No key, no write — never fall back to plaintext (same rule as
	// `shell/sw/secure-store.ts` setSecureItem).
	if (!encrypted) throw new Error('App storage unavailable: no encryption key')

	const database = await openDatabase()
	return new Promise((resolve, reject) => {
		const tx = database.transaction(STORE_NAME, 'readwrite')
		const store = tx.objectStore(STORE_NAME)
		const request = store.put(encrypted, key)

		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve()
	})
}

/**
 * Delete a key from storage
 */
async function storageDelete(key: string): Promise<void> {
	const database = await openDatabase()
	return new Promise((resolve, reject) => {
		const tx = database.transaction(STORE_NAME, 'readwrite')
		const store = tx.objectStore(STORE_NAME)
		const request = store.delete(key)

		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve()
	})
}

/**
 * List keys in storage with optional prefix filter
 */
async function storageList(prefix?: string): Promise<string[]> {
	const database = await openDatabase()
	return new Promise((resolve, reject) => {
		const tx = database.transaction(STORE_NAME, 'readonly')
		const store = tx.objectStore(STORE_NAME)
		const request = store.getAllKeys()

		request.onerror = () => reject(request.error)
		request.onsuccess = () => {
			let keys = request.result as string[]
			if (prefix) {
				keys = keys.filter((k) => k.startsWith(prefix))
			}
			resolve(keys)
		}
	})
}

/**
 * Clear all keys with a given prefix (namespace)
 */
async function storageClear(prefix: string): Promise<void> {
	const keys = await storageList(prefix)
	for (const key of keys) {
		await storageDelete(key)
	}
}

// ============================================
// QUOTA TRACKING
// ============================================

const DEFAULT_QUOTA_LIMIT = 50 * 1024 * 1024 // 50MB per namespace

// Sizes below are deliberately measured on the *plaintext* value, so the limit an
// app sees does not move with the cipher's per-record overhead.

/**
 * Per-namespace quota tracking with incremental updates
 * Tracks both total size and per-key sizes to avoid recalculating on every operation
 */
interface NamespaceQuota {
	totalSize: number
	keySizes: Map<string, number>
	initialized: boolean
}

const namespaceQuotas = new Map<string, NamespaceQuota>()

/**
 * Get or create quota tracking for a namespace
 */
function getOrCreateQuota(ns: string): NamespaceQuota {
	let quota = namespaceQuotas.get(ns)
	if (!quota) {
		quota = { totalSize: 0, keySizes: new Map(), initialized: false }
		namespaceQuotas.set(ns, quota)
	}
	return quota
}

/**
 * Initialize quota tracking for a namespace by scanning existing keys
 * Only called once per namespace on first access
 */
async function initializeQuota(ns: string): Promise<NamespaceQuota> {
	const quota = getOrCreateQuota(ns)
	if (quota.initialized) return quota

	const prefix = `${ns}:`
	const keys = await storageList(prefix)

	quota.totalSize = 0
	quota.keySizes.clear()

	for (const key of keys) {
		const value = await storageGet(key)
		if (value !== undefined) {
			const size = JSON.stringify(value).length
			quota.keySizes.set(key, size)
			quota.totalSize += size
		}
	}

	quota.initialized = true
	return quota
}

/**
 * Get quota usage for a namespace (lazy-initialized)
 */
async function getQuotaUsage(ns: string): Promise<{ limit: number; used: number }> {
	const quota = await initializeQuota(ns)
	return { limit: DEFAULT_QUOTA_LIMIT, used: quota.totalSize }
}

/**
 * Check if a set operation would exceed quota
 * Uses incremental tracking to avoid recalculating all keys
 */
async function checkQuota(ns: string, fullKey: string, value: unknown): Promise<boolean> {
	const quota = await initializeQuota(ns)
	const newSize = JSON.stringify(value).length
	const existingSize = quota.keySizes.get(fullKey) || 0
	const deltaSize = newSize - existingSize
	return quota.totalSize + deltaSize <= DEFAULT_QUOTA_LIMIT
}

/**
 * Update quota after a successful set operation
 */
function updateQuotaOnSet(ns: string, fullKey: string, value: unknown): void {
	const quota = namespaceQuotas.get(ns)
	if (!quota?.initialized) return

	const newSize = JSON.stringify(value).length
	const existingSize = quota.keySizes.get(fullKey) || 0
	quota.totalSize += newSize - existingSize
	quota.keySizes.set(fullKey, newSize)
}

/**
 * Update quota after a successful delete operation
 */
function updateQuotaOnDelete(ns: string, fullKey: string): void {
	const quota = namespaceQuotas.get(ns)
	if (!quota?.initialized) return

	const existingSize = quota.keySizes.get(fullKey) || 0
	quota.totalSize -= existingSize
	quota.keySizes.delete(fullKey)
}

/**
 * Clear quota tracking for a namespace (used after clear operation)
 */
function clearQuotaForNamespace(ns: string): void {
	const quota = namespaceQuotas.get(ns)
	if (!quota) return

	quota.totalSize = 0
	quota.keySizes.clear()
}

// ============================================
// HANDLER
// ============================================

/**
 * Initialize storage message handlers on the shell bus
 */
export function initStorageHandlers(bus: ShellMessageBus): void {
	bus.on('storage:op.req', async (msg: StorageOpReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[Storage] Request with no source window')
			return
		}

		// Validate app is initialized
		const connection = bus.getAppTracker().validateSource(source, true)
		if (!connection) {
			console.warn('[Storage] Request from uninitialized/unknown app')
			bus.sendResponse(
				appWindow,
				'storage:op.res',
				msg.id,
				false,
				undefined,
				'App not initialized'
			)
			return
		}

		const { op, key, value, prefix } = msg.payload

		// Namespace isolation - derive namespace from verified connection, not from app payload
		const ns = connection.appName || connection.resId?.split(':').pop() || 'unknown'
		const fullKey = key ? `${ns}:${key}` : undefined
		const fullPrefix = prefix ? `${ns}:${prefix}` : `${ns}:`

		try {
			let result: unknown

			switch (op) {
				case 'get':
					if (!fullKey) {
						throw new Error('Key required for get operation')
					}
					result = await storageGet(fullKey)
					break

				case 'set':
					if (!fullKey) {
						throw new Error('Key required for set operation')
					}
					// Check quota with incremental tracking
					if (!(await checkQuota(ns, fullKey, value))) {
						throw new Error('Quota exceeded')
					}
					await storageSet(fullKey, value)
					// Update quota tracking after successful write
					updateQuotaOnSet(ns, fullKey, value)
					result = undefined
					break

				case 'delete':
					if (!fullKey) {
						throw new Error('Key required for delete operation')
					}
					await storageDelete(fullKey)
					// Update quota tracking after successful delete
					updateQuotaOnDelete(ns, fullKey)
					result = undefined
					break

				case 'list': {
					const keys = await storageList(fullPrefix)
					// Remove namespace prefix from returned keys
					result = keys.map((k) => k.slice(ns.length + 1))
					break
				}

				case 'clear':
					await storageClear(fullPrefix)
					// Clear quota tracking for this namespace
					clearQuotaForNamespace(ns)
					result = undefined
					break

				case 'quota':
					result = await getQuotaUsage(ns)
					break

				default:
					throw new Error(`Unknown operation: ${op}`)
			}

			bus.sendResponse(appWindow, 'storage:op.res', msg.id, true, result)
		} catch (err) {
			console.error('[Storage] Operation failed:', op, err)
			bus.sendResponse(
				appWindow,
				'storage:op.res',
				msg.id,
				false,
				undefined,
				(err as Error).message || 'Storage operation failed'
			)
		}
	})
}

// vim: ts=4

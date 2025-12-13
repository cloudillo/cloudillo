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
 * Storage Message Handlers for Shell
 *
 * Handles storage operations from sandboxed apps via postMessage.
 * Apps in sandboxed iframes cannot access IndexedDB directly,
 * so we proxy their requests through the shell.
 */

import type { ShellMessageBus } from '../shell-bus.js'
import type { StorageOpReq, StorageOp } from '@cloudillo/base'

// ============================================
// INDEXEDDB STORAGE
// ============================================

const DB_NAME = 'cloudillo-app-storage'
const DB_VERSION = 1
const STORE_NAME = 'data'

let db: IDBDatabase | null = null

/**
 * Open the IndexedDB database
 */
async function openDatabase(): Promise<IDBDatabase> {
	if (db) return db

	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)

		request.onerror = () => reject(request.error)
		request.onsuccess = () => {
			db = request.result
			resolve(db)
		}

		request.onupgradeneeded = (event) => {
			const database = (event.target as IDBOpenDBRequest).result
			if (!database.objectStoreNames.contains(STORE_NAME)) {
				database.createObjectStore(STORE_NAME)
			}
		}
	})
}

/**
 * Get a value from storage
 */
async function storageGet(key: string): Promise<unknown> {
	const database = await openDatabase()
	return new Promise((resolve, reject) => {
		const tx = database.transaction(STORE_NAME, 'readonly')
		const store = tx.objectStore(STORE_NAME)
		const request = store.get(key)

		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve(request.result)
	})
}

/**
 * Set a value in storage
 */
async function storageSet(key: string, value: unknown): Promise<void> {
	const database = await openDatabase()
	return new Promise((resolve, reject) => {
		const tx = database.transaction(STORE_NAME, 'readwrite')
		const store = tx.objectStore(STORE_NAME)
		const request = store.put(value, key)

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

// Per-namespace quota tracking (in-memory, refreshed on list)
const quotaUsage = new Map<string, number>()
const DEFAULT_QUOTA_LIMIT = 50 * 1024 * 1024 // 50MB per namespace

/**
 * Get quota usage for a namespace
 */
async function getQuotaUsage(ns: string): Promise<{ limit: number; used: number }> {
	const prefix = `${ns}:`
	const keys = await storageList(prefix)

	let totalSize = 0
	for (const key of keys) {
		const value = await storageGet(key)
		if (value !== undefined) {
			totalSize += JSON.stringify(value).length
		}
	}

	quotaUsage.set(ns, totalSize)
	return { limit: DEFAULT_QUOTA_LIMIT, used: totalSize }
}

/**
 * Check if a set operation would exceed quota
 */
async function checkQuota(ns: string, value: unknown): Promise<boolean> {
	const quota = await getQuotaUsage(ns)
	const valueSize = JSON.stringify(value).length
	return quota.used + valueSize <= quota.limit
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

		const { op, ns, key, value, prefix } = msg.payload

		// Namespace isolation - prefix all keys with namespace
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
					// Check quota
					if (!(await checkQuota(ns, value))) {
						throw new Error('Quota exceeded')
					}
					await storageSet(fullKey, value)
					result = undefined
					break

				case 'delete':
					if (!fullKey) {
						throw new Error('Key required for delete operation')
					}
					await storageDelete(fullKey)
					result = undefined
					break

				case 'list':
					const keys = await storageList(fullPrefix)
					// Remove namespace prefix from returned keys
					result = keys.map((k) => k.slice(ns.length + 1))
					break

				case 'clear':
					await storageClear(fullPrefix)
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

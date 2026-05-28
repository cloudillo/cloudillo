// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * CRDT Message Handlers for Shell
 *
 * Manages Yjs clientId reuse and encrypted document cache in a unified
 * IndexedDB database (`cloudillo-crdt`).
 *
 * Architecture:
 * - Per-document clientId records with clocks
 * - Web Locks ensure no two tabs use the same clientId for the same document
 * - Encrypted CRDT update logs for offline persistence
 * - Apps communicate via the message bus (they run in opaque-origin iframes)
 */

import type { ShellMessageBus } from '../shell-bus.js'
import type {
	CrdtClientIdReq,
	CrdtCacheAppendReq,
	CrdtCacheReadReq,
	CrdtCacheCompactReq
} from '@cloudillo/core'
import {
	encryptBinary,
	decryptBinary,
	getSwKeyFromCookie,
	maybeSignalKeyMissing
} from '../../cache/crypto.js'
import { hadEncryptedData } from '../../pwa.js'

// ============================================
// CONSTANTS
// ============================================

const DB_NAME = 'cloudillo-crdt'
const DB_VERSION = 2
const CLIENTIDS_STORE = 'clientids'
const CACHE_STORE = 'cache'

// Old database names to clean up
const OLD_DB_NAMES = ['cloudillo-yjs-clientids', 'cloudillo-crdt-cache']

// ============================================
// WEB LOCK HELPERS
// ============================================

interface AcquiredLock {
	release: () => void
}

/**
 * Try to acquire an exclusive Web Lock without blocking.
 * Returns { release } if acquired, or null if the lock is held by another context.
 */
function tryAcquireLock(name: string): Promise<AcquiredLock | null> {
	if (!navigator.locks) return Promise.resolve(null)

	return new Promise((resolveAcquire) => {
		navigator.locks.request(name, { ifAvailable: true }, (lock) => {
			if (!lock) {
				resolveAcquire(null)
				return undefined
			}
			return new Promise<void>((resolveHold) => {
				resolveAcquire({ release: () => resolveHold(undefined) })
			})
		})
	})
}

// ============================================
// UNIFIED INDEXEDDB
// ============================================

let db: IDBDatabase | null = null

async function crdtDbExists(): Promise<boolean> {
	if (typeof indexedDB.databases !== 'function') return false
	try {
		const dbs = await indexedDB.databases()
		return dbs.some((d) => d.name === DB_NAME)
	} catch {
		return false
	}
}

async function openDB(): Promise<IDBDatabase | null> {
	if (db) return db

	// Local persistence is optional — it only enables offline support.
	// Without an encryption key, return null so callers can degrade:
	// allocate a random clientId, skip cache reads/writes, etc. The
	// app continues to work via the WebSocket. We still avoid creating
	// the IDB when no key exists (phantom-DB guard: SW boot probe at
	// shell/sw/index.ts:hasEncryptedData uses `indexedDB.databases()`
	// to detect prior encrypted state).
	if (!getSwKeyFromCookie()) {
		const dbExists = (await crdtDbExists()) || hadEncryptedData()
		if (!dbExists) return null
		// Cookie lost but DB exists on disk — surface recovery dialog
		// and try to open. Encrypt/decrypt will fail individually.
		maybeSignalKeyMissing()
	}

	return new Promise<IDBDatabase | null>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)
		request.onupgradeneeded = (event) => {
			const database = request.result
			const oldVersion = event.oldVersion

			// Create stores if they don't exist
			if (!database.objectStoreNames.contains(CLIENTIDS_STORE)) {
				database.createObjectStore(CLIENTIDS_STORE)
			}
			if (!database.objectStoreNames.contains(CACHE_STORE)) {
				database.createObjectStore(CACHE_STORE)
			}

			// v1→v2: clear stale data (key format changed)
			if (oldVersion < 2) {
				const tx = (event.target as IDBOpenDBRequest).transaction!
				tx.objectStore(CLIENTIDS_STORE).clear()
				tx.objectStore(CACHE_STORE).clear()
			}
		}
		request.onsuccess = () => {
			db = request.result
			db.onclose = () => {
				db = null
			}
			db.onversionchange = () => {
				db?.close()
				db = null
			}
			resolve(db)
		}
		request.onerror = () => reject(request.error)
	})
}

// ============================================
// CLIENT ID MANAGEMENT
// ============================================

function randomClientId(): number {
	const arr = new Uint32Array(1)
	crypto.getRandomValues(arr)
	return arr[0] || 1
}

// Map: appWindow → Map<docId, release function>
const allocations = new Map<Window, Map<string, () => void>>()

function trackAllocation(appWindow: Window, docId: string, release: () => void): void {
	let windowMap = allocations.get(appWindow)
	if (!windowMap) {
		windowMap = new Map()
		allocations.set(appWindow, windowMap)
	}
	const prev = windowMap.get(docId)
	if (prev) prev()
	windowMap.set(docId, release)
}

/**
 * Release all clientId locks held by a specific app window.
 * Called when the MicrofrontendContainer unmounts.
 */
export function releaseClientIdsForWindow(appWindow: Window): void {
	const windowMap = allocations.get(appWindow)
	if (!windowMap) return

	for (const [, release] of windowMap) {
		release()
	}
	allocations.delete(appWindow)
}

async function allocateClientId(appWindow: Window, docId: string): Promise<number> {
	const database = await openDB()
	// No local persistence — return a random clientId, no reuse, no lock.
	if (!database) return randomClientId()

	// Query all clientId records for this docId
	const keys = await new Promise<string[]>((resolve, reject) => {
		const tx = database.transaction(CLIENTIDS_STORE, 'readonly')
		const store = tx.objectStore(CLIENTIDS_STORE)
		const range = IDBKeyRange.bound(`${docId}:`, `${docId}:\uffff`)
		const request = store.getAllKeys(range)
		request.onsuccess = () => resolve(request.result as string[])
		request.onerror = () => reject(request.error)
	})

	// Try to lock each existing clientId
	for (const key of keys) {
		const clientId = Number(key.slice(docId.length + 1))
		if (!clientId) continue
		const lock = await tryAcquireLock(`yjs:${docId}:${clientId}`)
		if (lock) {
			trackAllocation(appWindow, docId, lock.release)
			return clientId
		}
	}

	// All locked or none exist — create new
	const newClientId = randomClientId()

	// Acquire lock BEFORE writing to IDB to prevent another tab from
	// finding and locking the same clientId between write and lock.
	const lock = await tryAcquireLock(`yjs:${docId}:${newClientId}`)
	if (lock) {
		await new Promise<void>((resolve, reject) => {
			const tx = database.transaction(CLIENTIDS_STORE, 'readwrite')
			const store = tx.objectStore(CLIENTIDS_STORE)
			const request = store.put(0, `${docId}:${newClientId}`)
			request.onsuccess = () => resolve()
			request.onerror = () => reject(request.error)
		})
		trackAllocation(appWindow, docId, lock.release)
	}
	return newClientId
}

// ============================================
// CACHE OPERATIONS
// ============================================

function randomBase64url(len: number): string {
	const bytes = crypto.getRandomValues(new Uint8Array(len))
	let s = ''
	for (const b of bytes) {
		s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]
	}
	return s
}

async function cacheAppend(
	docId: string,
	update: Uint8Array,
	clientId: number,
	clock: number,
	offline: boolean
): Promise<void> {
	const database = await openDB()
	// No local persistence — silently no-op (WebSocket sync handles delivery).
	if (!database) return

	const encrypted = await encryptBinary(update)
	if (!encrypted) throw new Error('Encryption unavailable')

	// Retry with a new random key on collision (add() throws ConstraintError on duplicate)
	for (let attempt = 0; attempt < 3; attempt++) {
		const key = `${docId}:log:${randomBase64url(6)}`
		try {
			await new Promise<void>((resolve, reject) => {
				const tx = database.transaction([CACHE_STORE, CLIENTIDS_STORE], 'readwrite')

				tx.objectStore(CACHE_STORE).add(encrypted, key)
				tx.objectStore(CLIENTIDS_STORE).put(clock, `${docId}:${clientId}`)
				// Only flag dirty when the update was produced while the WS
				// was not synced; online updates are already on the server.
				// Edge case: a brief network blip that drops an update before
				// ACK but within a single frame (no 'status' → 'disconnected'
				// event) escapes this flag. y-websocket's sync handshake
				// resends on reconnect, so the dirty marker isn't strictly
				// comprehensive — it's a logout-safety net, not the wire-level
				// guarantee.
				if (offline) {
					tx.objectStore(CACHE_STORE).put(true, `${docId}:dirty`)
				}

				tx.oncomplete = () => resolve()
				tx.onerror = () => reject(tx.error)
			})
			return
		} catch (err) {
			if (err instanceof DOMException && err.name === 'ConstraintError' && attempt < 2) {
				continue
			}
			throw err
		}
	}
}

async function cacheRead(docId: string): Promise<Uint8Array[]> {
	const database = await openDB()
	const results: Uint8Array[] = []
	// No local persistence — nothing cached to read.
	if (!database) return results

	// Read compacted state + all log entries in one transaction
	const { state, logEntries } = await new Promise<{
		state: ArrayBuffer | undefined
		logEntries: ArrayBuffer[]
	}>((resolve, reject) => {
		const tx = database.transaction(CACHE_STORE, 'readonly')
		const store = tx.objectStore(CACHE_STORE)

		let stateResult: ArrayBuffer | undefined
		let logResult: ArrayBuffer[] = []

		const stateReq = store.get(`${docId}:state`)
		stateReq.onsuccess = () => {
			stateResult = stateReq.result as ArrayBuffer | undefined
		}

		const logRange = IDBKeyRange.bound(`${docId}:log:`, `${docId}:log:\uffff`)
		const logReq = store.getAll(logRange)
		logReq.onsuccess = () => {
			logResult = logReq.result as ArrayBuffer[]
		}

		tx.oncomplete = () => resolve({ state: stateResult, logEntries: logResult })
		tx.onerror = () => reject(tx.error)
	})

	if (state) {
		const decrypted = await decryptBinary(state)
		if (decrypted) results.push(decrypted)
	}

	for (const entry of logEntries) {
		const decrypted = await decryptBinary(entry)
		if (decrypted) results.push(decrypted)
	}

	return results
}

async function cacheCompact(docId: string, state: Uint8Array, clearDirty?: boolean): Promise<void> {
	const database = await openDB()
	// No local persistence — nothing to compact.
	if (!database) return

	const encrypted = await encryptBinary(state)
	if (!encrypted) throw new Error('Encryption unavailable')

	// Get all log keys to delete
	const logKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
		const tx = database.transaction(CACHE_STORE, 'readonly')
		const store = tx.objectStore(CACHE_STORE)
		const range = IDBKeyRange.bound(`${docId}:log:`, `${docId}:log:\uffff`)
		const request = store.getAllKeys(range)
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})

	return new Promise((resolve, reject) => {
		const tx = database.transaction(CACHE_STORE, 'readwrite')
		const store = tx.objectStore(CACHE_STORE)

		// Write compacted state
		store.put(encrypted, `${docId}:state`)

		// Delete all individual log entries
		for (const key of logKeys) {
			store.delete(key)
		}

		// Clear dirty flag after post-sync recompact
		if (clearDirty) {
			store.delete(`${docId}:dirty`)
		}

		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
	})
}

// ============================================
// DIRTY FLAG QUERIES
// ============================================

/**
 * Get document IDs that have unsynced local edits.
 * Returns docIds (format: "ownerTag:fileId") with dirty flag set.
 */
export async function getDirtyDocIds(): Promise<Set<string>> {
	const dirty = new Set<string>()
	try {
		const database = await openDB()
		if (!database) return dirty
		const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
			const tx = database.transaction(CACHE_STORE, 'readonly')
			const store = tx.objectStore(CACHE_STORE)
			const request = store.getAllKeys()
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		for (const key of keys) {
			const k = String(key)
			if (k.endsWith(':dirty')) {
				dirty.add(k.slice(0, -6)) // Remove ':dirty' suffix
			}
		}
	} catch {
		// Ignore errors (DB may not be open yet)
	}
	return dirty
}

// ============================================
// OLD DATABASE CLEANUP
// ============================================

function deleteOldDatabases(): void {
	for (const name of OLD_DB_NAMES) {
		const req = indexedDB.deleteDatabase(name)
		req.onerror = () => {} // Intentionally ignored
	}
}

// ============================================
// MESSAGE HANDLERS
// ============================================

export function initCrdtHandlers(bus: ShellMessageBus): void {
	// Clean up old databases
	deleteOldDatabases()

	// ClientId allocation
	bus.on('crdt:clientid.req', async (msg: CrdtClientIdReq, source) => {
		const appWindow = source as Window
		if (!appWindow) return

		const { docId } = msg.payload

		try {
			if (!navigator.locks || !indexedDB) {
				const clientId = randomClientId()
				bus.sendResponse(appWindow, 'crdt:clientid.res', msg.id, true, { clientId })
				return
			}

			const clientId = await allocateClientId(appWindow, docId)
			console.log('[CRDT] Allocated clientId:', clientId, 'for doc:', docId)
			bus.sendResponse(appWindow, 'crdt:clientid.res', msg.id, true, { clientId })
		} catch (err) {
			console.error('[CRDT] Failed to allocate clientId:', err)
			const clientId = randomClientId()
			bus.sendResponse(appWindow, 'crdt:clientid.res', msg.id, true, { clientId })
		}
	})

	// Cache: append update
	bus.on('crdt:cache.append.req', async (msg: CrdtCacheAppendReq, source) => {
		const appWindow = source as Window
		if (!appWindow) return

		try {
			const { docId, update, clientId, clock, offline } = msg.payload
			if (!(update instanceof Uint8Array)) {
				bus.sendResponse(
					appWindow,
					'crdt:cache.res',
					msg.id,
					false,
					undefined,
					'invalid update type'
				)
				return
			}
			// Older apps that predate the offline flag default to false so
			// their edits don't permanently flag docs as dirty.
			await cacheAppend(docId, update, clientId, clock, offline ?? false)
			bus.sendResponse(appWindow, 'crdt:cache.res', msg.id, true)
		} catch (err) {
			bus.sendResponse(
				appWindow,
				'crdt:cache.res',
				msg.id,
				false,
				undefined,
				(err as Error).message
			)
		}
	})

	// Cache: read
	bus.on('crdt:cache.read.req', async (msg: CrdtCacheReadReq, source) => {
		const appWindow = source as Window
		if (!appWindow) return

		try {
			const updates = await cacheRead(msg.payload.docId)
			bus.sendResponse(appWindow, 'crdt:cache.res', msg.id, true, updates)
		} catch (err) {
			bus.sendResponse(
				appWindow,
				'crdt:cache.res',
				msg.id,
				false,
				undefined,
				(err as Error).message
			)
		}
	})

	// Cache: compact
	bus.on('crdt:cache.compact.req', async (msg: CrdtCacheCompactReq, source) => {
		const appWindow = source as Window
		if (!appWindow) return

		try {
			const { docId, state, clearDirty } = msg.payload
			if (!(state instanceof Uint8Array)) {
				bus.sendResponse(
					appWindow,
					'crdt:cache.res',
					msg.id,
					false,
					undefined,
					'invalid state type'
				)
				return
			}
			await cacheCompact(docId, state, clearDirty)
			bus.sendResponse(appWindow, 'crdt:cache.res', msg.id, true)
		} catch (err) {
			bus.sendResponse(
				appWindow,
				'crdt:cache.res',
				msg.id,
				false,
				undefined,
				(err as Error).message
			)
		}
	})
}

// vim: ts=4

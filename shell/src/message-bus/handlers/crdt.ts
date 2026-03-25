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

function openDB(): Promise<IDBDatabase> {
	if (db) return Promise.resolve(db)

	return new Promise((resolve, reject) => {
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
// AES-GCM ENCRYPTION
// ============================================

let cryptoKey: CryptoKey | null = null

function getSwKeyFromCookie(): string | null {
	const match = document.cookie.match(/(?:^|;\s*)swKey=([^;]+)/)
	return match ? match[1] : null
}

async function initCryptoKey(): Promise<CryptoKey | null> {
	if (cryptoKey) return cryptoKey

	const keyString = getSwKeyFromCookie()
	if (!keyString) return null

	try {
		const padding = '='.repeat((4 - (keyString.length % 4)) % 4)
		const base64 = (keyString + padding).replace(/-/g, '+').replace(/_/g, '/')
		const keyData = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
		cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, [
			'encrypt',
			'decrypt'
		])
		return cryptoKey
	} catch (err) {
		console.error('[CRDT] Failed to import encryption key:', err)
		return null
	}
}

async function encryptBinary(data: Uint8Array): Promise<ArrayBuffer | null> {
	const key = await initCryptoKey()
	if (!key) return null

	const iv = crypto.getRandomValues(new Uint8Array(12))
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		data as ArrayBufferView<ArrayBuffer>
	)
	const combined = new ArrayBuffer(iv.length + ciphertext.byteLength)
	const view = new Uint8Array(combined)
	view.set(iv)
	view.set(new Uint8Array(ciphertext), iv.length)
	return combined
}

async function decryptBinary(encrypted: ArrayBuffer): Promise<Uint8Array | null> {
	const key = await initCryptoKey()
	if (!key) return null

	try {
		const view = new Uint8Array(encrypted)
		const iv = view.slice(0, 12)
		const ciphertext = view.slice(12)
		const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
		return new Uint8Array(decrypted)
	} catch (err) {
		console.error('[CRDT] Decryption failed:', err)
		return null
	}
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
	clock: number
): Promise<void> {
	const encrypted = await encryptBinary(update)
	if (!encrypted) throw new Error('Encryption unavailable')

	const database = await openDB()

	// Retry with a new random key on collision (add() throws ConstraintError on duplicate)
	for (let attempt = 0; attempt < 3; attempt++) {
		const key = `${docId}:log:${randomBase64url(6)}`
		try {
			await new Promise<void>((resolve, reject) => {
				const tx = database.transaction([CACHE_STORE, CLIENTIDS_STORE], 'readwrite')

				tx.objectStore(CACHE_STORE).add(encrypted, key)
				tx.objectStore(CLIENTIDS_STORE).put(clock, `${docId}:${clientId}`)

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

async function cacheCompact(docId: string, state: Uint8Array): Promise<void> {
	const encrypted = await encryptBinary(state)
	if (!encrypted) throw new Error('Encryption unavailable')

	const database = await openDB()

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

		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
	})
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
			const { docId, update, clientId, clock } = msg.payload
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
			await cacheAppend(docId, update, clientId, clock)
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
			const { docId, state } = msg.payload
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
			await cacheCompact(docId, state)
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

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
 * Manages Yjs clientId reuse to prevent unbounded state vector growth.
 *
 * Architecture:
 * - IndexedDB stores a pool of clientIds (shared across all documents)
 * - Web Locks ensure no two tabs use the same clientId for the same document
 * - Apps request clientIds via the message bus (they run in opaque-origin iframes)
 *
 * Safety guarantees:
 * - Web Locks are auto-released on tab crash/close
 * - Same clientId can be used for different documents (separate CRDT namespaces)
 * - Falls back to random clientId if Web Locks or IndexedDB are unavailable
 */

import type { ShellMessageBus } from '../shell-bus.js'
import type { CrdtClientIdReq } from '@cloudillo/core'

// ============================================
// CONSTANTS
// ============================================

const DB_NAME = 'cloudillo-yjs-clientids'
const DB_VERSION = 1
const STORE_NAME = 'pool'
const POOL_KEY = 'clientids'

// ============================================
// WEB LOCK HELPERS
// ============================================

interface AcquiredLock {
	release: () => void
}

/**
 * Try to acquire an exclusive Web Lock without blocking.
 * Returns { release } if acquired, or null if the lock is held by another context.
 *
 * The lock is held until release() is called or the page unloads.
 */
function tryAcquireLock(name: string): Promise<AcquiredLock | null> {
	if (!navigator.locks) return Promise.resolve(null)

	return new Promise((resolveAcquire) => {
		navigator.locks.request(name, { ifAvailable: true }, (lock) => {
			if (!lock) {
				resolveAcquire(null)
				return undefined // Release immediately (no lock acquired)
			}
			// Lock acquired — hold it by returning a Promise that resolves on release()
			return new Promise<void>((resolveHold) => {
				resolveAcquire({ release: () => resolveHold(undefined) })
			})
		})
	})
}

// ============================================
// INDEXEDDB HELPERS
// ============================================

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)
		request.onupgradeneeded = () => {
			const db = request.result
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME)
			}
		}
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

async function readPool(): Promise<number[]> {
	const db = await openDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly')
		const store = tx.objectStore(STORE_NAME)
		const request = store.get(POOL_KEY)
		request.onsuccess = () => {
			db.close()
			resolve(Array.isArray(request.result) ? request.result : [])
		}
		request.onerror = () => {
			db.close()
			reject(request.error)
		}
	})
}

async function writePool(pool: number[]): Promise<void> {
	const db = await openDB()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite')
		const store = tx.objectStore(STORE_NAME)
		const request = store.put(pool, POOL_KEY)
		request.onsuccess = () => {
			db.close()
			resolve()
		}
		request.onerror = () => {
			db.close()
			reject(request.error)
		}
	})
}

// ============================================
// CLIENT ID GENERATION
// ============================================

/**
 * Generate a random 32-bit unsigned integer for use as a Yjs clientId.
 * Avoids 0 which Yjs uses internally.
 */
function randomClientId(): number {
	const arr = new Uint32Array(1)
	crypto.getRandomValues(arr)
	return arr[0] || 1
}

// ============================================
// ALLOCATION TRACKING
// ============================================

// Map: appWindow → Map<docId, release function>
const allocations = new Map<Window, Map<string, () => void>>()

function trackAllocation(appWindow: Window, docId: string, release: () => void): void {
	let windowMap = allocations.get(appWindow)
	if (!windowMap) {
		windowMap = new Map()
		allocations.set(appWindow, windowMap)
	}
	// Release previous lock for same window+doc if any (shouldn't happen normally)
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

// ============================================
// ALLOCATION ALGORITHM
// ============================================

async function allocateClientId(appWindow: Window, docId: string): Promise<number> {
	let pool = await readPool()

	if (pool.length === 0) {
		pool = [randomClientId()]
		await writePool(pool)
	}

	// Try each existing clientId in the pool
	for (const clientId of pool) {
		const lock = await tryAcquireLock(`yjs:${docId}:${clientId}`)
		if (lock) {
			trackAllocation(appWindow, docId, lock.release)
			return clientId
		}
	}

	// All pool entries locked for this docId — create a new one
	const newClientId = randomClientId()
	pool.push(newClientId)
	await writePool(pool)

	const lock = await tryAcquireLock(`yjs:${docId}:${newClientId}`)
	if (lock) {
		trackAllocation(appWindow, docId, lock.release)
	}
	return newClientId
}

// ============================================
// MESSAGE HANDLER
// ============================================

/**
 * Initialize CRDT message handlers on the shell bus
 */
export function initCrdtHandlers(bus: ShellMessageBus): void {
	bus.on('crdt:clientid.req', async (msg: CrdtClientIdReq, source) => {
		const appWindow = source as Window
		if (!appWindow) {
			console.error('[CRDT] ClientId request with no source window')
			return
		}

		const { docId } = msg.payload

		try {
			// Check if Web Locks and IndexedDB are available
			if (!navigator.locks || !indexedDB) {
				// Fallback: generate a random clientId (no reuse guarantee)
				const clientId = randomClientId()
				// TEMP DEBUG
				console.log(
					'[CRDT] Fallback (no Web Locks/IDB), generated random clientId:',
					clientId,
					'for doc:',
					docId
				)
				bus.sendResponse(appWindow, 'crdt:clientid.res', msg.id, true, { clientId })
				return
			}

			const clientId = await allocateClientId(appWindow, docId)
			// TEMP DEBUG
			console.log('[CRDT] Allocated clientId:', clientId, 'for doc:', docId)
			bus.sendResponse(appWindow, 'crdt:clientid.res', msg.id, true, { clientId })
		} catch (err) {
			console.error('[CRDT] Failed to allocate clientId:', err)
			// Fallback: generate a random clientId
			const clientId = randomClientId()
			bus.sendResponse(appWindow, 'crdt:clientid.res', msg.id, true, { clientId })
		}
	})
}

// vim: ts=4

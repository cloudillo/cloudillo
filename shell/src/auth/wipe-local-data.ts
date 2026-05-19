// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { resetEncryptionState, cleanupEncryptionCookie } from '../pwa.js'
import { clearCache, getCachedFile } from '../cache/index.js'
import { getDirtyDocIds } from '../message-bus/handlers/crdt.js'

function deleteDb(name: string): Promise<void> {
	return new Promise((resolve) => {
		const req = indexedDB.deleteDatabase(name)
		req.onsuccess = () => resolve()
		req.onerror = () => resolve()
		req.onblocked = () => resolve()
	})
}

function clearLocalStorageKeys(): void {
	localStorage.removeItem('cloudillo:guestName')
	localStorage.removeItem('notify.local')
	for (const key of Object.keys(localStorage)) {
		if (key.startsWith('form.')) localStorage.removeItem(key)
	}
}

/**
 * Delete every piece of account-bound state from this device:
 * - SW-managed encrypted credential stores (authToken, apiKey, blob metadata)
 * - The `cloudillo-crdt` and `cloudillo-data-cache` IndexedDB databases
 * - The blob CacheStorage
 * - The `cloudillo-app-storage` IndexedDB (apps' sandboxed storage)
 * - Account-bound localStorage keys
 * - The `swKey` encryption cookie and its tracking flag
 *
 * Must be called BEFORE the page navigates away so the SW message channel
 * and IndexedDB connections are still alive.
 */
export async function wipeLocalData(): Promise<void> {
	// Tear down SW-owned encrypted state and the in-page cache. Both can
	// trigger encrypted IDB writes during teardown, which re-set the
	// `cloudillo-had-encrypted-data` localStorage flag — so we defer the
	// flag/cookie cleanup to the very end.
	// resetEncryptionState() also clears the page-lifetime key-error latch
	// (via resetKeyErrorState in pwa.tsx) — no need to repeat it below.
	try {
		await resetEncryptionState()
	} catch (err) {
		console.error('[Logout] resetEncryptionState failed:', err)
	}

	try {
		await clearCache()
	} catch (err) {
		console.error('[Logout] clearCache failed:', err)
	}

	// Belt-and-braces: the SW's sw:auth.reset handler also wipes these, but
	// a dead/uninstalled/uncontrolled SW silently drops the message. Direct
	// IDB deletes guarantee no encrypted blobs survive into the next session.
	await deleteDb('cloudillo-crdt')
	await deleteDb('cloudillo-data-cache')
	await deleteDb('cloudillo-app-storage')

	// Final step: clear localStorage keys and the encryption cookie/flag
	// only after all encrypted data is gone. cleanupEncryptionCookie clears
	// the `cloudillo-had-encrypted-data` flag, so if anything wrote
	// encrypted data above and re-set the flag, this run wipes it.
	clearLocalStorageKeys()
	cleanupEncryptionCookie()
}

export interface DirtyDocSummary {
	docId: string
	name: string
}

/**
 * Resolve every locally-dirty CRDT doc to a human-readable name by looking
 * up the file metadata in the encrypted file cache. Falls back to the raw
 * fileId when no cache entry is available.
 */
export async function listDirtyDocs(): Promise<DirtyDocSummary[]> {
	const dirty = await getDirtyDocIds()
	if (dirty.size === 0) return []

	const out: DirtyDocSummary[] = []
	for (const docId of dirty) {
		// docId format: `<ownerTag>:<fileId>` (see openYDoc in
		// libs/react/src/hooks.tsx). The file cache is owner-keyed, so the
		// docId prefix is the right lookup key.
		const colon = docId.indexOf(':')
		const ownerIdTag = colon > 0 ? docId.slice(0, colon) : ''
		const fileId = colon > 0 ? docId.slice(colon + 1) : docId
		let name = fileId
		if (ownerIdTag) {
			try {
				const file = await getCachedFile(ownerIdTag, fileId)
				if (file?.fileName) name = file.fileName
			} catch {
				// Best-effort; fall back to fileId.
			}
		}
		out.push({ docId, name })
	}
	return out
}

// vim: ts=4

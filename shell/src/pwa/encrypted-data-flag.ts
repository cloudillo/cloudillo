// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * "Has anything ever been written under the swKey?", as a localStorage flag.
 *
 * A leaf on purpose: the low-level cache and CRDT modules need this answer, and
 * routing them through `pwa.tsx` (which imports the cache right back) would put
 * them in an import cycle. Depends on `localStorage` and nothing else.
 */

const HAD_ENCRYPTED_DATA_KEY = 'cloudillo-had-encrypted-data'

// Purely the fallback for browsers without `indexedDB.databases()` (see shared/idb.ts
// `databaseExists` returning `'unknown'`) — it gates nothing else.
export function markHadEncryptedData(): void {
	localStorage.setItem(HAD_ENCRYPTED_DATA_KEY, '1')
}

export function hadEncryptedData(): boolean {
	return localStorage.getItem(HAD_ENCRYPTED_DATA_KEY) === '1'
}

/** Forget the flag — the encrypted data it stood for is gone. */
export function clearHadEncryptedData(): void {
	localStorage.removeItem(HAD_ENCRYPTED_DATA_KEY)
}

// vim: ts=4

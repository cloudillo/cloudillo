// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The worker's IndexedDB key/value store, in two layers.
 *
 * `setSecureItem`/`getSecureItemResult` apply AES-GCM on the way in and out and are
 * the only way a secret is ever written — if no key is available the write is
 * skipped rather than falling back to plaintext.
 *
 * `setItem`/`getItem`/`deleteItem` are the raw layer underneath, for two uses only:
 * the blob cache's size/LRU bookkeeping (blob-cache.ts), and deleting a record by
 * key (including the legacy encrypted `authToken` record index.ts drops). Deletion
 * needs no key, and the bookkeeping record holds cache-key URLs — file ids, no
 * contents, no credentials — in the clear deliberately, because it is read during
 * `activate`, before the encryption key is reliably available. Nothing may *read a
 * secret* through this layer; that is what the secure layer above is for.
 */

import { aesDecryptString, aesEncryptString } from '../shared/aes.js'
import { openDb } from '../shared/idb.js'
import { importAesKey } from '../shared/sw-key.js'
import { debug } from './debug.js'
import { getKeyFromCookie } from './key-cookie.js'
import { getCachedKey, getCryptoKey, setCryptoKey } from './state.js'

const DB_NAME = 'db'
const STORE_NAME = 'secrets'

function initDB(): Promise<IDBDatabase> {
	return openDb(DB_NAME, 1, (db) => {
		if (!db.objectStoreNames.contains(STORE_NAME)) {
			db.createObjectStore(STORE_NAME)
		}
	})
}

export async function setItem(key: string, value: string) {
	const db = await initDB()
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readwrite')
		const store = transaction.objectStore(STORE_NAME)

		const request = store.put(value, key)

		request.onsuccess = () => resolve(true)
		request.onerror = (evt) => reject((evt.target as IDBRequest).error)
	})
}

export async function getItem(key: string) {
	const db = await initDB()
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readonly')
		const store = transaction.objectStore(STORE_NAME)

		const request = store.get(key)

		request.onsuccess = (evt) => resolve((evt.target as IDBRequest).result)
		request.onerror = (evt) => reject((evt.target as IDBRequest).error)
	})
}

export async function deleteItem(key: string) {
	const db = await initDB()
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readwrite')
		const store = transaction.objectStore(STORE_NAME)

		const request = store.delete(key)

		request.onsuccess = () => resolve(true)
		request.onerror = (evt) => reject((evt.target as IDBRequest).error)
	})
}

// Concurrent message handlers (a `sw:apikey.set` racing a `sw:apikey.get.req`) both
// find a null cached key, so the import is memoized while in flight.
//
// Nulling that memo is not enough on its own: an import that started before a key
// change is still running and would install the *old* key afterwards. So
// `resetCryptoKeyInit()` also bumps a generation counter, and a stale run discards
// its result — otherwise everything written right after a `sw:key.reset` is
// encrypted under the discarded key and unreadable on the next worker start.
let cryptoKeyInit: Promise<CryptoKey | null> | null = null
let cryptoKeyGeneration = 0

export async function initCryptoKey(): Promise<CryptoKey | null> {
	const existing = getCryptoKey()
	if (existing) return existing
	if (cryptoKeyInit) return cryptoKeyInit

	const generation = cryptoKeyGeneration
	const run = (async () => {
		// Read the key, never mint one: minting without the page-side assessment
		// masks a key loss and silently discards everything encrypted under the
		// key that went missing (see shell/src/auth/key-loss.ts). Cookie first
		// (Chrome/Edge), then the key the page relayed (Firefox/Safari).
		const keyString = (await getKeyFromCookie()) || getCachedKey()
		if (generation !== cryptoKeyGeneration) return null

		if (!keyString) {
			debug('No encryption key available')
			return null
		}

		const key = await importAesKey(keyString)
		// The key changed while this import was in flight — installing it now
		// would resurrect a discarded key.
		if (generation !== cryptoKeyGeneration) return null
		setCryptoKey(key)
		return key
	})()

	cryptoKeyInit = run
	try {
		return await run
	} finally {
		if (cryptoKeyInit === run) cryptoKeyInit = null
	}
}

/**
 * Drop an in-flight key import, so the next `initCryptoKey()` re-reads the key.
 * Also invalidates any import still running, which must not install its result.
 */
export function resetCryptoKeyInit(): void {
	cryptoKeyInit = null
	cryptoKeyGeneration++
}

async function encryptData(plaintext: string): Promise<string | null> {
	const key = await initCryptoKey()
	if (!key) {
		console.error('[SW] Cannot encrypt: no encryption key - skipping storage')
		return null
	}
	return aesEncryptString(key, plaintext)
}

async function decryptData(encrypted: string): Promise<string | null> {
	const key = await initCryptoKey()
	if (!key) {
		// Expected whenever the swKey cookie is gone — the page assesses whether
		// that matters (see shell/src/auth/key-loss.ts). Not an error here.
		debug('Cannot decrypt: no encryption key')
		return null
	}
	// aesDecryptString rejects anything without the 'enc:' prefix and returns
	// null on a bad key rather than escalating — a failed decrypt is a dropped
	// record, never a destructive key-error dialog.
	return aesDecryptString(key, encrypted)
}

/**
 * Encrypt and store `value`. Returns whether it was actually written — a missing
 * encryption key skips the write, and there is no unencrypted fallback. A caller
 * reporting that skip as a success leaves the page believing the record exists:
 * `setApiKey` in shell/src/pwa.tsx is that caller, and the next boot reads
 * "nothing stored" as an unrecoverable session — forced logout plus a wipe.
 */
export async function setSecureItem(key: string, value: string): Promise<boolean> {
	const encrypted = await encryptData(value)
	if (!encrypted) return false
	await setItem(key, encrypted)
	return true
}

/**
 * A secure read that keeps "nothing is stored" and "something is stored but we
 * cannot read it" apart. The page treats a definitive "nothing stored" as an
 * unrecoverable session (forced logout + local wipe, see `declareDead` in
 * shell/src/auth/useTokenRenewal.ts) — exactly the wrong answer after the swKey
 * cookie is evicted, which shell/src/auth/key-loss.ts recovers from.
 */
export async function getSecureItemResult(
	key: string
): Promise<{ status: 'ok'; value?: string } | { status: 'undecryptable' }> {
	const encrypted = (await getItem(key)) as string | undefined
	if (!encrypted) return { status: 'ok' }
	const value = await decryptData(encrypted)
	// No key, or a key that no longer matches this record. Either way the record
	// exists, so the caller must not conclude the user never stored one.
	if (value === null) return { status: 'undecryptable' }
	return { status: 'ok', value }
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shared AES-GCM encryption utilities for IndexedDB data stores.
 *
 * Reads the encryption key from the `swKey` cookie (same key used by the
 * ServiceWorker and CRDT persistence). Provides binary and JSON
 * encrypt/decrypt helpers.
 */

import { aesDecrypt, aesEncrypt } from '../../shared/aes.js'
import { importAesKey } from '../../shared/sw-key.js'
import { reportKeyUnavailable } from '../auth/key-signal.js'
import { readSwKeyCookie } from '../pwa/cookie.js'
import { markHadEncryptedData } from '../pwa/encrypted-data-flag.js'

let cryptoKey: CryptoKey | null = null

/**
 * Drop the cached CryptoKey so the next call re-reads the cookie. Called after
 * a logout/wipe or a key reset, where the cookie is replaced underneath us.
 */
export function resetKeyErrorState(): void {
	cryptoKey = null
}

export async function initCryptoKey(): Promise<CryptoKey | null> {
	if (cryptoKey) return cryptoKey

	const keyString = readSwKeyCookie()
	if (!keyString) {
		// No key: every caller degrades to "no local cache". Report it so the
		// user is warned if — and only if — unsynced work is at stake.
		reportKeyUnavailable()
		return null
	}

	cryptoKey = await importAesKey(keyString)
	return cryptoKey
}

export async function encryptBinary(data: Uint8Array): Promise<ArrayBuffer | null> {
	const key = await initCryptoKey()
	if (!key) return null

	const combined = await aesEncrypt(key, data)
	// Track that real encrypted data exists, so a future missing-cookie
	// episode is recognized as a true error rather than fresh-state noise.
	markHadEncryptedData()
	return combined.buffer
}

export async function decryptBinary(encrypted: ArrayBuffer): Promise<Uint8Array | null> {
	const key = await initCryptoKey()
	if (!key) return null
	// aesDecrypt returns null rather than throwing or escalating — see its
	// JSDoc for why a bad cache record must never surface the key-error dialog.
	return aesDecrypt(key, new Uint8Array(encrypted))
}

export async function encryptJSON(data: unknown): Promise<ArrayBuffer | null> {
	const json = JSON.stringify(data)
	const bytes = new TextEncoder().encode(json)
	return encryptBinary(bytes)
}

export async function decryptJSON<T = unknown>(encrypted: ArrayBuffer): Promise<T | null> {
	const bytes = await decryptBinary(encrypted)
	if (!bytes) return null

	try {
		const json = new TextDecoder().decode(bytes)
		return JSON.parse(json) as T
	} catch (err) {
		console.error('[Cache] JSON parse failed after decryption:', err)
		return null
	}
}

// vim: ts=4

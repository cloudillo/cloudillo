// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * AES-GCM-256 encryption for data at rest — one implementation shared by the
 * SW's secrets store and the page's encrypted IndexedDB caches. A 12-byte
 * random IV is generated per record and prepended to the ciphertext; the key is
 * non-extractable and used raw (no KDF). DOM-free: bundled into both contexts.
 */

import { base64ToBytes, bytesToBase64 } from '@cloudillo/core/base64'

const IV_BYTES = 12

/** On-disk marker for the SW's string-encoded records. */
const ENC_PREFIX = 'enc:'

export async function aesEncrypt(
	key: CryptoKey,
	plaintext: Uint8Array
): Promise<Uint8Array<ArrayBuffer>> {
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		plaintext as ArrayBufferView<ArrayBuffer>
	)
	const combined = new Uint8Array(IV_BYTES + ciphertext.byteLength)
	combined.set(iv)
	combined.set(new Uint8Array(ciphertext), IV_BYTES)
	return combined
}

/**
 * Decrypt an `iv || ciphertext` blob. Returns null on any failure — this
 * function never throws and never escalates.
 *
 * A failure means one record is unreadable, most likely a stale record from a
 * previous swKey that the cache-first/SWR path would normally overwrite (while
 * offline nothing replaces it). The cache is a recoverable optimization — the
 * server is the source of truth — so the caller self-heals by dropping the
 * record. It must NOT escalate to a key-error signal: that raises the
 * destructive "Encryption Key Error" dialog, which can wipe the CRDT database
 * and unflushed work.
 */
export async function aesDecrypt(key: CryptoKey, blob: Uint8Array): Promise<Uint8Array | null> {
	try {
		const iv = blob.slice(0, IV_BYTES)
		const ciphertext = blob.slice(IV_BYTES)
		const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
		return new Uint8Array(decrypted)
	} catch (err) {
		console.warn('[Crypto] Decryption failed (stale record will be purged):', err)
		return null
	}
}

export async function aesEncryptString(key: CryptoKey, s: string): Promise<string> {
	const blob = await aesEncrypt(key, new TextEncoder().encode(s))
	return ENC_PREFIX + bytesToBase64(blob)
}

/**
 * Null on failure, and for input lacking the `enc:` prefix — we never store
 * plaintext, so an unprefixed value is legacy data that must not be trusted.
 */
export async function aesDecryptString(key: CryptoKey, s: string): Promise<string | null> {
	if (!s.startsWith(ENC_PREFIX)) return null
	let blob: Uint8Array
	try {
		blob = base64ToBytes(s.slice(ENC_PREFIX.length))
	} catch {
		return null
	}
	const decrypted = await aesDecrypt(key, blob)
	return decrypted ? new TextDecoder().decode(decrypted) : null
}

// vim: ts=4

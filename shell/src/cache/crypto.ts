// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shared AES-GCM encryption utilities for IndexedDB data stores.
 *
 * Reads the encryption key from the `swKey` cookie (same key used by the
 * ServiceWorker and CRDT persistence). Provides binary and JSON
 * encrypt/decrypt helpers.
 */

import { hadEncryptedData, markHadEncryptedData, signalKeyError } from '../pwa.js'

let cryptoKey: CryptoKey | null = null
let keyMissingSignaled = false

// Fire the global key-access error signal at most once per page load.
// Suppressed when we have no record of prior encrypted writes — otherwise
// boot/login windows where the cookie hasn't been minted yet would trigger
// a spurious dialog (and loop, since the dialog's reset path goes through
// the same code on reload). The guard keeps the hot encrypt/decrypt
// paths cheap.
function maybeSignalKeyMissing(): void {
	if (keyMissingSignaled) return
	if (!hadEncryptedData()) return
	keyMissingSignaled = true
	signalKeyError('key_missing')
}

/**
 * Reset the page-lifetime latches that suppress the KeyAccessError dialog.
 * Called after a successful logout/wipe so a later sign-in that loses its
 * swKey cookie can still surface the dialog (without this, the dialog only
 * fires on the very first lost-key event per page load).
 */
export function resetKeyErrorState(): void {
	keyMissingSignaled = false
	cryptoKey = null
}

export function getSwKeyFromCookie(): string | null {
	const match = document.cookie.match(/(?:^|;\s*)swKey=([^;]+)/)
	return match ? match[1] : null
}

export async function initCryptoKey(): Promise<CryptoKey | null> {
	if (cryptoKey) return cryptoKey

	const keyString = getSwKeyFromCookie()
	if (!keyString) {
		maybeSignalKeyMissing()
		return null
	}

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
		console.error('[Cache] Failed to import encryption key:', err)
		return null
	}
}

export async function encryptBinary(data: Uint8Array): Promise<ArrayBuffer | null> {
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
	// Track that real encrypted data exists, so a future missing-cookie
	// episode is recognized as a true error rather than fresh-state noise.
	markHadEncryptedData()
	return combined
}

export async function decryptBinary(encrypted: ArrayBuffer): Promise<Uint8Array | null> {
	const key = await initCryptoKey()
	if (!key) return null

	try {
		const view = new Uint8Array(encrypted)
		const iv = view.slice(0, 12)
		const ciphertext = view.slice(12)
		const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
		return new Uint8Array(decrypted)
	} catch (err) {
		console.error('[Cache] Decryption failed:', err)
		// Only treat as a key error if the ciphertext is well-formed; malformed
		// bytes (truncation, old-format records) shouldn't latch the global
		// dialog and disable encrypted I/O for the rest of the page lifetime.
		// AES-GCM requires at least the 12-byte IV plus a 16-byte auth tag.
		const wellFormed = encrypted.byteLength >= 28
		if (wellFormed && !keyMissingSignaled) {
			keyMissingSignaled = true
			signalKeyError('key_mismatch')
		}
		return null
	}
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

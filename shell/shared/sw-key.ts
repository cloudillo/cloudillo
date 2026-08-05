// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The `swKey` encryption key: generation and import.
 *
 * The key material itself lives in the `swKey` cookie (app-bound encryption on
 * Chrome). Reading/writing that cookie is browser-context-specific and lives in
 * `shell/src/pwa/cookie.ts` (page) and the Cookie Store helpers in
 * `shell/sw/key-cookie.ts` (worker); only these two context-free operations are
 * shared.
 */

import { base64UrlToBytes, bytesToBase64Url } from '@cloudillo/core/base64'

/** Generate a random 256-bit key as unpadded base64url. */
export function generateSwKey(): string {
	return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

/** Import a base64url key as a non-extractable AES-GCM CryptoKey; null if invalid. */
export async function importAesKey(keyString: string): Promise<CryptoKey | null> {
	try {
		return await crypto.subtle.importKey(
			'raw',
			base64UrlToBytes(keyString),
			{ name: 'AES-GCM' },
			false,
			['encrypt', 'decrypt']
		)
	} catch (err) {
		console.error('[Crypto] Failed to import encryption key:', err)
		return null
	}
}

// vim: ts=4

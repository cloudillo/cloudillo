// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Base64 / base64url <-> byte conversions. DOM-free: page and ServiceWorker. */

// btoa() takes a binary string, and String.fromCharCode(...bytes) spreads the whole
// array onto the call stack — which throws on large inputs. Build it in chunks.
const CHUNK_SIZE = 0x8000

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = ''
	for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE))
	}
	return btoa(binary)
}

export function base64ToBytes(s: string): Uint8Array<ArrayBuffer> {
	const binary = atob(s)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	return bytes
}

export function bytesToBase64Url(bytes: Uint8Array): string {
	return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Decode base64url (`-`/`_`, padding optional). Standard base64 is accepted
 * unchanged, so this is safe for inputs whose alphabet isn't known up front.
 */
export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
	const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
	return base64ToBytes(padded.replace(/-/g, '+').replace(/_/g, '/'))
}

// vim: ts=4

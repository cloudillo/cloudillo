// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { aesDecrypt, aesDecryptString, aesEncrypt, aesEncryptString } from '../../shared/aes.js'

// Runs against the real WebCrypto: Node exposes it as the global `crypto`,
// which is the same API the page and the ServiceWorker use.
function makeKey(): Promise<CryptoKey> {
	return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
		'encrypt',
		'decrypt'
	]) as Promise<CryptoKey>
}

describe('aesEncrypt / aesDecrypt', () => {
	it('round-trips a payload', async () => {
		const key = await makeKey()
		const plaintext = new TextEncoder().encode('hello cloudillo')
		const blob = await aesEncrypt(key, plaintext)
		expect(await aesDecrypt(key, blob)).toEqual(plaintext)
	})

	it('prepends a fresh 12-byte IV, so the same plaintext encrypts differently', async () => {
		const key = await makeKey()
		const plaintext = new TextEncoder().encode('same input')
		const a = await aesEncrypt(key, plaintext)
		const b = await aesEncrypt(key, plaintext)
		expect(a.slice(0, 12)).not.toEqual(b.slice(0, 12))
		expect(await aesDecrypt(key, b)).toEqual(plaintext)
	})

	it('round-trips the empty payload', async () => {
		const key = await makeKey()
		const empty = new Uint8Array(0)
		expect(await aesDecrypt(key, await aesEncrypt(key, empty))).toEqual(empty)
	})

	it('returns null (never throws) for a blob encrypted under another key', async () => {
		// The contract the caches rely on: a stale record from a previous swKey
		// is dropped and refetched, never escalated into a key-error signal.
		const key = await makeKey()
		const other = await makeKey()
		const blob = await aesEncrypt(other, new TextEncoder().encode('secret'))
		await expect(aesDecrypt(key, blob)).resolves.toBeNull()
	})

	it('returns null for a truncated or garbage blob', async () => {
		const key = await makeKey()
		await expect(aesDecrypt(key, new Uint8Array(4))).resolves.toBeNull()
		await expect(aesDecrypt(key, new Uint8Array(64))).resolves.toBeNull()
	})
})

describe('aesEncryptString / aesDecryptString', () => {
	it('round-trips a string', async () => {
		const key = await makeKey()
		const enc = await aesEncryptString(key, 'api-key-value')
		expect(await aesDecryptString(key, enc)).toBe('api-key-value')
	})

	it('round-trips non-ASCII text', async () => {
		const key = await makeKey()
		const s = 'Szilárd — ünnepi ☕'
		expect(await aesDecryptString(key, await aesEncryptString(key, s))).toBe(s)
	})

	it('marks its output with the enc: prefix', async () => {
		const key = await makeKey()
		expect(await aesEncryptString(key, 'x')).toMatch(/^enc:/)
	})

	it('returns null for input lacking the enc: prefix', async () => {
		// Unprefixed means legacy plaintext — we never store that, so it must
		// not be trusted.
		const key = await makeKey()
		await expect(aesDecryptString(key, 'plain-value')).resolves.toBeNull()
		await expect(aesDecryptString(key, '')).resolves.toBeNull()
	})

	it('returns null for non-base64 input behind the prefix', async () => {
		const key = await makeKey()
		await expect(aesDecryptString(key, 'enc:not base64!!')).resolves.toBeNull()
	})

	it('returns null for a string encrypted under another key', async () => {
		const key = await makeKey()
		const other = await makeKey()
		const enc = await aesEncryptString(other, 'secret')
		await expect(aesDecryptString(key, enc)).resolves.toBeNull()
	})
})

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The worker's three-way answer about a stored secret.
 *
 * The load-bearing case is the last one: a record that exists but cannot be
 * decrypted must NOT read as "nothing stored". The page ends the session for
 * good on "nothing stored" (`declareDead` in shell/src/auth/useTokenRenewal.ts:
 * forced logout, cache wipe, app-storage delete, swKey cookie removal), and an
 * evicted swKey cookie is precisely the situation shell/src/auth/key-loss.ts
 * exists to recover from gracefully.
 */

import { generateSwKey } from '../../shared/sw-key.js'
import { invalidateCryptoKey, setCachedKey } from '../../sw/state.js'
import { getSecureItemResult, resetCryptoKeyInit, setSecureItem } from '../../sw/secure-store.js'

// Static imports are safe despite the globals stubbed below: none of those
// modules touch `self` or `indexedDB` at import time, only inside their
// functions — which run once the stubs are in place.

// The worker's key reader does `'cookieStore' in self`; there is no `self` in a
// node test environment, and no Cookie Store API either — which is the
// Firefox/Safari shape, where the key arrives via `setCachedKey`.
;(globalThis as unknown as { self: unknown }).self = globalThis

// IndexedDB has no equivalent here. Only the shape secure-store.ts uses: open
// with an upgrade pass, then single-store readonly/readwrite transactions.
const records = new Map<string, string>()

function request<T>(result: T) {
	const req: Record<string, unknown> = { result }
	// The module reads `evt.target.result`, so the event carries the request.
	queueMicrotask(() => (req.onsuccess as ((e: unknown) => void) | undefined)?.({ target: req }))
	return req
}

;(globalThis as unknown as { indexedDB: unknown }).indexedDB = {
	open: () => {
		const db = {
			objectStoreNames: { contains: () => true },
			createObjectStore: () => {},
			transaction: () => ({
				objectStore: () => ({
					put: (value: string, key: string) => {
						records.set(key, value)
						return request(true)
					},
					get: (key: string) => request(records.get(key)),
					delete: (key: string) => {
						records.delete(key)
						return request(true)
					}
				})
			})
		}
		return request(db)
	}
}

/** Make `keyString` (or no key at all) the worker's current encryption key. */
function useKey(keyString: string | null): void {
	setCachedKey(keyString)
	invalidateCryptoKey()
	resetCryptoKeyInit()
}

beforeEach(() => {
	records.clear()
	useKey(generateSwKey())
})

describe('getSecureItemResult', () => {
	it("reports 'ok' with no value when nothing is stored", async () => {
		expect(await getSecureItemResult('apiKey')).toEqual({ status: 'ok' })
	})

	it("reports 'ok' with the value when the record decrypts", async () => {
		await setSecureItem('apiKey', 'secret-key')
		expect(await getSecureItemResult('apiKey')).toEqual({ status: 'ok', value: 'secret-key' })
	})

	it('stores the value encrypted, never in the clear', async () => {
		await setSecureItem('apiKey', 'secret-key')
		expect(records.get('apiKey')).toMatch(/^enc:/)
		expect(records.get('apiKey')).not.toContain('secret-key')
	})

	it("reports 'undecryptable' when the encryption key is gone", async () => {
		await setSecureItem('apiKey', 'secret-key')
		useKey(null) // the swKey cookie was evicted
		expect(await getSecureItemResult('apiKey')).toEqual({ status: 'undecryptable' })
	})

	it("reports 'undecryptable' when the encryption key no longer matches", async () => {
		await setSecureItem('apiKey', 'secret-key')
		useKey(generateSwKey()) // key rotated under the record
		expect(await getSecureItemResult('apiKey')).toEqual({ status: 'undecryptable' })
	})

	it('writes nothing at all when there is no key to encrypt with', async () => {
		useKey(null)
		await setSecureItem('apiKey', 'secret-key')
		// A plaintext fallback would be worse than losing the record.
		expect(records.has('apiKey')).toBe(false)
	})
})

// vim: ts=4

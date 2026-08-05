// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The `swKey` encryption-key cookie, from the page's side. The cookie is the
 * key store — the only copy that survives a reload, and on Chrome bound to the
 * app. See `shared/sw-key.ts` for why the worker reads it separately.
 */

const KEY_COOKIE_NAME = 'swKey'

// ~68 years — the maximum a cookie Max-Age can express.
const MAX_AGE = 2147483647
const COOKIE_ATTRS = `Secure; SameSite=Strict; Path=/; Max-Age=${MAX_AGE}`

/**
 * Read the raw cookie value, preserving any `=` in the body. `.split('=')[1]`
 * would truncate at the first `=` — `generateSwKey` strips padding so that
 * cannot happen today, but a key from another generator could contain one, and
 * silent truncation would break decryption.
 */
export function readSwKeyCookie(): string | null {
	const prefix = `${KEY_COOKIE_NAME}=`
	const row = document.cookie.split('; ').find((r) => r.startsWith(prefix))
	return row ? row.slice(prefix.length) : null
}

/**
 * Write the key cookie and return whether it read back. Brave private mode and
 * ITP can silently drop the write, and encrypting under a key that didn't
 * survive would produce unrecoverable records — so the caller must be told.
 */
export function writeSwKeyCookie(key: string): boolean {
	document.cookie = `${KEY_COOKIE_NAME}=${key}; ${COOKIE_ATTRS}`
	return readSwKeyCookie() === key
}

export function clearSwKeyCookie(): void {
	document.cookie = `${KEY_COOKIE_NAME}=; Secure; SameSite=Strict; Path=/; Max-Age=0`
}

// vim: ts=4

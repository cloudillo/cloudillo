// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The `swKey` encryption-key cookie from the worker's side, via the Cookie
 * Store API. Absent on Firefox/Safari, where the page relays the key instead
 * (see `shell/src/pwa/cookie.ts` for the page-side reader).
 *
 * Read-only with respect to the key material: the worker never mints a key.
 * The page-side key-loss assessment keys off cookie *presence*
 * (`shell/src/auth/key-loss.ts`), so a key minted here would mask a loss the
 * user had to be warned about and silently discard every record encrypted
 * under the old key. Generation belongs to `setApiKey` (login) and
 * `recoverFromKeyLoss` (after an assessed loss), and nowhere else.
 */

declare const self: ServiceWorkerGlobalScope

const KEY_COOKIE_NAME = 'swKey'

export async function getKeyFromCookie(): Promise<string | null> {
	if (!('cookieStore' in self)) return null
	try {
		const cookie = await self.cookieStore.get(KEY_COOKIE_NAME)
		return cookie?.value || null
	} catch {
		return null
	}
}

/**
 * Delete the key cookie (Chrome/Edge). Without this a `sw:key.reset` would wipe
 * everything encrypted under the key and then read the very same key back on
 * the next `getKeyFromCookie()`. No-op on Firefox/Safari, where the page owns
 * the cookie and clears it itself.
 */
export async function clearKeyCookie(): Promise<void> {
	if (!('cookieStore' in self)) return
	try {
		await self.cookieStore.delete(KEY_COOKIE_NAME)
	} catch (err) {
		console.error('[SW] clearKeyCookie failed:', err)
	}
}
// vim: ts=4

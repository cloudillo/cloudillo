// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Per-tab cache of the session bearer token.
 *
 * A "don't remember me" session holds no API key, so nothing can re-mint its
 * token after a reload — the token itself has to survive. Not in ServiceWorker
 * memory: that makes the SW a second owner, leaking the token across tabs (SW
 * memory is shared) and dying on SW eviction rather than at session end.
 *
 * `sessionStorage` is same-origin, per-tab, never sent to a server, and dies
 * with the tab. The sandboxed app iframes have opaque origins (no
 * `allow-same-origin`) and cannot read it, and the token already lives in page
 * memory as `auth.token` — so any XSS that could read this already had it.
 */

const KEY = 'cloudillo:session-token'

export function getSessionToken(): string | undefined {
	try {
		return sessionStorage.getItem(KEY) ?? undefined
	} catch {
		// Private-mode / storage-disabled browsers: degrade to "no session".
		return undefined
	}
}

export function setSessionToken(token: string | undefined): void {
	try {
		if (token) sessionStorage.setItem(KEY, token)
		else sessionStorage.removeItem(KEY)
	} catch {
		// Non-fatal: the session simply won't survive a reload.
	}
}

// vim: ts=4

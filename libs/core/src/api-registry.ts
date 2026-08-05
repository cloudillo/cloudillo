// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The process-wide `ApiClient` cache, one client per idTag.
 *
 * Client identity is stable for the process lifetime; the token rotates in
 * place. That matters because `useEffect`/`useMemo` deps all over the shell key
 * off the api object — a new client per rotation would refetch everything.
 *
 * The registry owns *client identity per idTag* and nothing else — the token and
 * its expiry live in the `ApiClient` alone, so there is no second copy to drift.
 * Callers that need a client the registry cannot own (scoped/ref/embed tokens,
 * deliberately anonymous clients, boot-time clients built before any identity
 * exists) must keep calling `createApiClient` directly.
 *
 * Two owners write tokens, and never coexist in one JS context: the shell's
 * boot/auth/context flow (the shell is never iframed), and the app bus
 * (`getAppBus`) inside a sandboxed app iframe (which has no shell code).
 *
 * Write the token HERE FIRST, before `setAuth` or any atom that mirrors it. The
 * gates that read `hasApiToken` (`useApi().authenticated`, `mayUseCache`) run
 * during the render `setAuth` triggers, before any effect could flush a deferred
 * write — until then the entry still carries the old, by-now-expired token and
 * every request goes out anonymous. Same rule for renewals: a cached client that
 * never got the new token keeps sending the previous one until it expires
 * server-side, and a foreign client cannot self-heal from the resulting 401
 * (`setAuthErrorHandler` only recovers the home idTag).
 *
 * No eviction: an `ApiClient` holds only `{ idTag, authToken }`, and a session
 * visits tens of distinct idTags at most.
 */

import { type ApiClient, createApiClient } from './api-client.js'

const registry = new Map<string, ApiClient>()

/** The client for this idTag, created on first use. */
export function getApiClient(idTag: string): ApiClient {
	let client = registry.get(idTag)
	if (!client) {
		client = createApiClient({ idTag })
		registry.set(idTag, client)
	}
	return client
}

/**
 * Install a token on this idTag's client. `expiresAt` defaults to the token's
 * own `exp` claim; pass one only where a different rule applies. `undefined`
 * makes the client anonymous.
 */
export function setApiToken(idTag: string, token: string | undefined, expiresAt?: Date): void {
	getApiClient(idTag).setAuthToken(token, expiresAt)
}

/**
 * True when this idTag's client holds a non-expired token. Never creates a
 * client — an unknown idTag is simply unauthenticated, and this runs on every
 * render of the hooks that gate on it.
 */
export function hasApiToken(idTag: string): boolean {
	return registry.get(idTag)?.hasValidToken() ?? false
}

/** Test-only. */
export function resetApiRegistry(): void {
	registry.clear()
}

// vim: ts=4

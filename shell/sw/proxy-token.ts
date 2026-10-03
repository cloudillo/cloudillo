// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Proxy tokens: the credential the worker uses when a request targets another
 * tenant. Minted by exchanging our own token at `/api/auth/proxy-token`.
 */

import { jwtRemainingSeconds } from '@cloudillo/core/jwt'
import LRU from 'quick-lru'

import { PROTOCOL_VERSION } from '../shared/sw-protocol.js'
import { debug } from './debug.js'
import { getAuthToken, getIdTag } from './state.js'

declare const self: ServiceWorkerGlobalScope

// Proxy tokens, keyed by the tenant they authorise against. The LRU's maxAge is
// only a backstop for tokens we can't parse — the real bound is the token's own
// `exp`, checked on every read, so a token is never served past its lifetime.
export const proxyTokenCache = new LRU<string, string>({ maxSize: 100, maxAge: 1000 * 60 * 60 })

// Don't hand out a token that expires mid-request.
const PROXY_TOKEN_MIN_REMAINING_MS = 5000

// The worn hat's token, keyed by the client id of the tab wearing it: each tab wears at
// most one hat (its active context's), and a hat must never leak into another tab's
// requests. Pushed by the page, which owns the three-node hatted handshake and its renewal.
// ponytail: entries of closed tabs linger until the worker restarts; prune via clients.matchAll if it ever matters
const hatTokens = new Map<string, { idTag: string; hat?: string; token: string }>()

// How long a request waits for the page to re-push an expired hat token.
const HAT_TOKEN_WAIT_MS = 1500

// After a renewal round the page did not answer, requests fail fast for this long.
const HAT_RETRY_MS = 10_000
const hatRetryAt = new Map<string, number>()

// Requests parked on an expired hat token, per client id; one request in flight per tab.
const hatWaiters = new Map<string, Array<(ok: boolean) => void>>()

/** Mirror tab `clientId`'s hatted token for `idTag` (worn as `hat`); undefined clears it. */
export function setHatToken(
	clientId: string,
	idTag: string,
	token: string | undefined,
	hat?: string
): void {
	const waiters = hatWaiters.get(clientId)
	hatWaiters.delete(clientId)
	for (const settle of waiters ?? []) settle(!!token)
	if (token) {
		hatTokens.set(clientId, { idTag, hat, token })
		hatRetryAt.delete(clientId)
		// A stale bare entry must not win once the hat comes off again.
		proxyTokenCache.delete(idTag)
	} else if (hatTokens.get(clientId)?.idTag === idTag) {
		hatTokens.delete(clientId)
	}
}

export function clearHatTokens(): void {
	hatTokens.clear()
}

/** Ask tab `clientId` for a fresh hat token for `idTag`; resolves once it answers or times out. */
async function requestHatToken(clientId: string, idTag: string): Promise<void> {
	let waiters = hatWaiters.get(clientId)
	const first = !waiters
	if (!waiters) {
		waiters = []
		hatWaiters.set(clientId, waiters)
	}
	const answered = new Promise<boolean>((resolve) => {
		waiters.push(resolve)
		setTimeout(() => resolve(false), HAT_TOKEN_WAIT_MS)
	})
	if (first) {
		const client = await self.clients.get(clientId)
		if (client) {
			client.postMessage({
				cloudillo: true,
				v: PROTOCOL_VERSION,
				type: 'sw:hattoken.request',
				payload: { idTag }
			})
			debug('sw:hattoken.request sent to', clientId)
		} else {
			// The tab is gone: nobody will answer
			for (const settle of waiters) settle(false)
		}
	}
	await answered
	// A timed-out round must not block the next request
	if (hatWaiters.get(clientId) === waiters) hatWaiters.delete(clientId)
}

function hasTimeLeft(token: string): boolean {
	const remaining = jwtRemainingSeconds(token)
	return remaining !== undefined && remaining * 1000 >= PROXY_TOKEN_MIN_REMAINING_MS
}

export function getProxyToken(targetTag: string): string | undefined {
	const token = proxyTokenCache.get(targetTag)
	if (!token) return undefined
	if (!hasTimeLeft(token)) {
		proxyTokenCache.delete(targetTag)
		return undefined
	}
	return token
}

/**
 * The proxy token authorising us against `targetTag`, minting and caching one
 * on a miss. Returns undefined when there is no own token to exchange, and when
 * the exchange answers with an error status or a non-JSON body. A transport
 * failure still throws, so callers choose between falling back to the blob cache
 * (the federated API branch) and proceeding unauthenticated (downloads).
 *
 * `wantedHat` is for navigations (no client id): it picks the tab already holding that
 * hat's token for `targetTag`, and with none the request goes unauthenticated — a hatted
 * request never falls back to a bare mint.
 */
export async function ensureProxyToken(
	targetTag: string,
	clientId?: string,
	wantedHat?: string
): Promise<string | undefined> {
	const idTag = getIdTag()
	const authToken = getAuthToken()
	if (!idTag || !authToken) return undefined

	if (!clientId && wantedHat) {
		for (const [id, h] of hatTokens) {
			if (h.idTag === targetTag && h.hat === wantedHat) clientId = id
		}
		if (!clientId) return undefined
	}

	// While the requesting tab wears a hat for `targetTag`, never fall back to a bare mint:
	// that silent downgrade is what turned hatted requests into 403s.
	// An expired one is renewed by the page on request, never replaced by a bare mint.
	const hat = clientId ? hatTokens.get(clientId) : undefined
	if (clientId && hat?.idTag === targetTag) {
		if (hasTimeLeft(hat.token)) return hat.token
		// The last renewal round went unanswered: fail fast instead of stalling every request.
		if (Date.now() < (hatRetryAt.get(clientId) ?? 0)) return undefined
		await requestHatToken(clientId, targetTag)
		const fresh = hatTokens.get(clientId)
		if (fresh?.idTag === targetTag && hasTimeLeft(fresh.token)) {
			hatRetryAt.delete(clientId)
			return fresh.token
		}
		hatRetryAt.set(clientId, Date.now() + HAT_RETRY_MS)
		return undefined
	}

	const cached = getProxyToken(targetTag)
	if (cached) {
		debug('PROXY TOKEN cached', idTag, targetTag)
		return cached
	}

	debug('PROXY TOKEN miss', idTag, targetTag)
	const res = await fetch(`https://cl-o.${idTag}/api/auth/proxy-token?idTag=${targetTag}`, {
		credentials: 'include',
		headers: { Authorization: `Bearer ${authToken}` }
	})
	// Log the status only — never the body (see the LOGGING RULE in shell/sw/index.ts).
	if (!res.ok) {
		debug('PROXY TOKEN rejected', res.status)
		return undefined
	}
	let token: string | undefined
	try {
		token = (await res.json())?.data?.token
	} catch {
		// A 200 that is not JSON is a proxy/CDN error page, not a token.
		return undefined
	}
	if (token) proxyTokenCache.set(targetTag, token)
	return token
}
// vim: ts=4

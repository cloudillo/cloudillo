// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Proxy tokens: the credential the worker uses when a request targets another
 * tenant. Minted by exchanging our own token at `/api/auth/proxy-token`.
 */

import LRU from 'quick-lru'

import { jwtRemainingSeconds } from '@cloudillo/core/jwt'
import { debug } from './debug.js'
import { getAuthToken, getIdTag } from './state.js'

// Proxy tokens, keyed by the tenant they authorise against. The LRU's maxAge is
// only a backstop for tokens we can't parse — the real bound is the token's own
// `exp`, checked on every read, so a token is never served past its lifetime.
export const proxyTokenCache = new LRU<string, string>({ maxSize: 100, maxAge: 1000 * 60 * 60 })

// Don't hand out a token that expires mid-request.
const PROXY_TOKEN_MIN_REMAINING_MS = 5000

export function getProxyToken(targetTag: string): string | undefined {
	const token = proxyTokenCache.get(targetTag)
	if (!token) return undefined
	const remaining = jwtRemainingSeconds(token)
	if (remaining === undefined || remaining * 1000 < PROXY_TOKEN_MIN_REMAINING_MS) {
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
 */
export async function ensureProxyToken(targetTag: string): Promise<string | undefined> {
	const idTag = getIdTag()
	const authToken = getAuthToken()
	if (!idTag || !authToken) return undefined

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

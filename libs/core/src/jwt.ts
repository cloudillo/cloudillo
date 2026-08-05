// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * JWT claim inspection and the canonical token-renewal schedule. Payloads are
 * decoded, never verified — the server is the only authority on validity.
 * DOM-free, dependency-free: bundled into the page, the apps and the shell's
 * ServiceWorker, which imports it as the `@cloudillo/core/jwt` leaf subpath
 * rather than through the barrel (see `shell/shared/sw-protocol.ts`).
 */

import { base64UrlToBytes } from './base64.js'

/** Renew at 80% of the token's lifetime. */
const RENEWAL_THRESHOLD = 0.8

export interface JwtTimes {
	/** `exp` claim as epoch milliseconds. */
	exp: number
	/** `iat` claim as epoch milliseconds; null when the token omits it. */
	iat: number | null
}

/**
 * Decode a JWT's payload; null for anything unparseable. Payloads are
 * base64url, so plain `atob` mangles any containing `-` or `_`.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
	try {
		const [, payload] = token.split('.')
		if (!payload) return null
		const decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)))
		return decoded && typeof decoded === 'object' ? (decoded as Record<string, unknown>) : null
	} catch {
		return null
	}
}

/** Extract `exp`/`iat` as epoch ms. Null when the token carries no usable `exp`. */
export function getJwtTimes(token: string): JwtTimes | null {
	const payload = decodeJwtPayload(token)
	if (!payload) return null
	const { exp, iat } = payload
	if (typeof exp !== 'number' || !exp) return null
	return { exp: exp * 1000, iat: typeof iat === 'number' && iat ? iat * 1000 : null }
}

/** Milliseconds until expiry (negative once expired); null if undeterminable. */
export function jwtRemainingMs(token: string, now = Date.now()): number | null {
	const times = getJwtTimes(token)
	return times ? times.exp - now : null
}

/**
 * The token's `exp` as a Date; undefined for a missing or unparseable token,
 * which callers read as "this token never expires on its own" (the server will
 * still reject it). `setApiToken`/`ApiClient.setAuthToken` derive the same value
 * when no expiry is passed, so call this only for a different rule or to do your
 * own scheduling.
 */
export function jwtExpiryDate(token: string | undefined): Date | undefined {
	if (!token) return undefined
	const times = getJwtTimes(token)
	return times ? new Date(times.exp) : undefined
}

/** Remaining lifetime in whole seconds, floored at 0; undefined if undeterminable. */
export function jwtRemainingSeconds(token: string): number | undefined {
	const remaining = jwtRemainingMs(token)
	return remaining === null ? undefined : Math.max(0, Math.floor(remaining / 1000))
}

/** Spread a delay by ±`jitter` (a fraction, e.g. 0.05 for ±5%). */
export function applyJitter(delayMs: number, jitter: number): number {
	return jitter ? delayMs * (1 + (Math.random() * 2 - 1) * jitter) : delayMs
}

/**
 * How long to wait before renewing `token`. Null when the token can't be parsed
 * or has already expired — the caller must handle both as "don't arm a timer".
 *
 * With `iat` present the delay anchors to `iat + lifetime * threshold`, a fixed
 * point in the token's life, so the safety margin stays constant across
 * mid-session mounts; anchoring to *remaining* time would shrink it on every
 * page reload. Tokens without `iat` fall back to a fraction of the remaining time.
 *
 * A token past its threshold yields 0 — an immediate renewal, which is what a
 * mid-session mount wants. `opts.min` floors that for callers whose success path
 * re-arms from the token they just received: an issuer that keeps returning
 * tokens carrying the original `iat` would otherwise produce an unbounded stream
 * of mint requests. Never applied to `null` — "don't arm a timer" must not turn
 * into a timer.
 */
export function renewalDelayMs(
	token: string,
	opts: { threshold?: number; jitter?: number; min?: number } = {}
): number | null {
	const { threshold = RENEWAL_THRESHOLD, jitter = 0, min = 0 } = opts
	const times = getJwtTimes(token)
	if (!times) return null

	const now = Date.now()
	const remaining = times.exp - now
	if (remaining <= 0) return null

	const delay =
		times.iat !== null
			? Math.max(0, times.iat + (times.exp - times.iat) * threshold - now)
			: remaining * threshold
	// Floor last: jitter applied after it could push the delay back under the floor.
	return Math.max(min, applyJitter(delay, jitter))
}

// vim: ts=4

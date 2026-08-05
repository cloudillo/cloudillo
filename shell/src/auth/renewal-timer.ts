// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The one proactive token-renewal schedule, shared by the home session
 * (`useTokenRenewal`), the app iframes (`useAppToken`) and the per-context proxy
 * tokens (`useContextTokenRenewal`). Plain module, no React: the callers hold it
 * in a ref precisely so renewal never re-renders anything.
 */

import { jwtRemainingSeconds, renewalDelayMs } from '@cloudillo/core/jwt'

// Floor for the normal (non-retry) delay — the `min` option of `renewalDelayMs`.
// The success path re-arms from the token that just came back, so a reissue
// carrying the original `iat` would schedule at 0 forever. Short enough to stay
// effectively immediate, long enough that such a stream can't become a loop.
const RENEWAL_MIN_MS = 5_000

// A renewal that fails (offline, or a 401 no recovery path could rescue) must not
// end the chain: without a retry nothing ever re-arms the timer and the session,
// iframe or context silently de-authenticates at `exp`.
const RENEWAL_RETRY_MS = 30_000
const RENEWAL_RETRY_MAX_MS = 5 * 60_000

// Floor between two `renewNow()` mints. A caller that keeps judging its token
// expired — an unparseable or absent `exp`, or a client clock running ahead —
// would otherwise be an unthrottled request loop for as long as the page is open.
const RENEW_NOW_MIN_INTERVAL_MS = 10_000

export interface Renewer {
	/** (Re-)arm from this token. Replaces any pending timer. */
	schedule(token: string): void
	/**
	 * Renew immediately, for a token that is already dead — `schedule` cannot
	 * help there, because `renewalDelayMs` answers null and arms nothing. On
	 * success the proactive timer is armed from the token that came back, so the
	 * chain continues without the caller re-entering. Throttled by
	 * RENEW_NOW_MIN_INTERVAL_MS and retried on the same backoff as `schedule`.
	 */
	renewNow(): void
	cancel(): void
}

/**
 * `renew` returns the new token, or undefined on failure.
 * `onToken` (optional) receives each successfully renewed token — the app-iframe
 * caller uses it to push the token over the message bus.
 */
export function createRenewer(
	renew: () => Promise<string | undefined>,
	opts: { jitter?: number; onToken?: (token: string) => void } = {}
): Renewer {
	const { jitter = 0, onToken } = opts
	let handle: number | undefined
	// Consecutive failed renewals, driving the retry backoff. Reset on success.
	let failures = 0
	// Bumped by every arm and every cancel, so a fire already awaiting `renew`
	// when the caller cancels or re-schedules cannot re-arm behind its back.
	let generation = 0
	// `renewNow` throttle and re-entrancy guard.
	let lastRenewNow = 0
	let renewNowInFlight = false

	function arm(token: string, delayMs: number) {
		if (handle !== undefined) clearTimeout(handle)
		const gen = ++generation
		handle = window.setTimeout(async () => {
			// A `renew` that throws must be indistinguishable from one answering
			// undefined: either way the chain has to re-arm, or the session, iframe
			// or context silently de-authenticates at `exp`. An uncaught rejection
			// would also escape — this callback is nobody's awaited promise.
			let newToken: string | undefined
			try {
				newToken = await renew()
			} catch (err) {
				console.error('[Renewal] Renewal threw:', err)
			}
			if (gen !== generation) return
			if (newToken) {
				failures = 0
				onToken?.(newToken)
				// The callers re-arm from their own state too, but a byte-identical
				// reissue changes no React dependency — re-arm explicitly.
				schedule(newToken)
				return
			}
			// Retry only while the current token still has life left; once it is
			// dead, recovery belongs to the 401 path, not to a renewal loop.
			if ((jwtRemainingSeconds(token) ?? 0) <= 0) {
				console.warn('[Renewal] Renewal failed and the token has expired')
				return
			}
			arm(token, Math.min(RENEWAL_RETRY_MS * 2 ** failures++, RENEWAL_RETRY_MAX_MS))
		}, delayMs)
	}

	function renewNow() {
		if (renewNowInFlight) return
		const now = Date.now()
		if (lastRenewNow && now - lastRenewNow < RENEW_NOW_MIN_INTERVAL_MS) return
		renewNowInFlight = true
		lastRenewNow = now
		// Same generation discipline as `arm`: a `cancel()` or a `schedule()` while
		// the mint is in flight must win over its late resolution.
		const gen = ++generation
		void (async () => {
			let newToken: string | undefined
			try {
				newToken = await renew()
			} catch (err) {
				console.error('[Renewal] Immediate renewal threw:', err)
			}
			renewNowInFlight = false
			if (gen !== generation) return
			if (newToken) {
				failures = 0
				onToken?.(newToken)
				// Hand the fresh token to the proactive schedule, so the chain
				// continues without anything re-entering here.
				schedule(newToken)
				return
			}
			// The token is already dead, so `arm`'s "retry only while the token has
			// life left" rule cannot apply — retry here or the caller stays anonymous
			// for the rest of the session. Through `renewNow`, keeping the throttle
			// and in-flight guard in one place; the delay always exceeds
			// RENEW_NOW_MIN_INTERVAL_MS, so the throttle never swallows a retry.
			if (handle !== undefined) clearTimeout(handle)
			handle = window.setTimeout(
				() => {
					handle = undefined
					renewNow()
				},
				Math.min(RENEWAL_RETRY_MS * 2 ** failures++, RENEWAL_RETRY_MAX_MS)
			)
		})()
	}

	function cancel() {
		generation++
		if (handle !== undefined) {
			clearTimeout(handle)
			handle = undefined
		}
	}

	function schedule(token: string) {
		const delay = renewalDelayMs(token, { min: RENEWAL_MIN_MS, jitter })
		if (delay === null) {
			console.warn('[Renewal] Token unparseable or already expired')
			cancel()
			return
		}
		arm(token, delay)
	}

	return { schedule, renewNow, cancel }
}

// vim: ts=4

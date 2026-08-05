// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The in-flight home-token renewal, as process-wide state.
 *
 * There is exactly one home session per page, and `setAuthErrorHandler`
 * (libs/core/src/api-client.ts) is already a process-wide single slot — so only
 * one `useTokenRenewal` may ever mount. Keeping the renewal promise in module
 * scope rather than in that hook's refs lets code outside React *join* a renewal
 * instead of guessing how long one takes.
 *
 * Two semantically different operations share the slot, so it is tagged with a
 * kind and a recovery is never *satisfied* by a refresh:
 *
 * - `'refresh'` — the proactive 80%-of-lifetime `getLoginToken()` call. Runs on
 *   the live session and cannot revive a dead one (issued with `skipAuthRecovery`).
 * - `'recover'` — the 401 path, which re-exchanges the stored API key and, when
 *   that fails, declares the session dead (toast + redirect to `/login`).
 *
 * Aliasing the two would let a 401 be answered by the refresh's `undefined`, with
 * no API-key exchange and no dead-session handling — stranding the user on a
 * session nothing will repair. A `'recover'` arriving behind a `'refresh'`
 * therefore *chains*: it takes the refresh's token if there is one (the session
 * was merely stale) and otherwise runs the real recovery. The chain claims the
 * slot the moment it is built, so a second `'recover'` behind the same refresh
 * joins it instead of running the API-key exchange twice.
 */

type RenewalKind = 'refresh' | 'recover'

let inFlight: { kind: RenewalKind; promise: Promise<string | undefined> } | null = null

/**
 * Run `fn` as the renewal, deduplicated: concurrent callers of the same kind
 * share one run. See the module docstring for the cross-kind rules.
 */
export function runRenewal(
	kind: RenewalKind,
	fn: () => Promise<string | undefined>
): Promise<string | undefined> {
	// Same kind, or a refresh that a running recovery already subsumes.
	if (inFlight && (inFlight.kind === kind || kind === 'refresh')) return inFlight.promise

	// A recovery behind a refresh: wait for the refresh's answer before deciding
	// whether recovery is still needed.
	if (inFlight) {
		const pending = inFlight.promise
		const chained: Promise<string | undefined> = pending.then(
			(token) => (token ? token : takeSlot('recover', chained, fn)),
			() => takeSlot('recover', chained, fn)
		)
		// Claim the slot now, so a second recovery behind the same refresh joins
		// this chain. Replacing the refresh's entry is safe: `takeSlot` only
		// releases the slot it still owns by identity.
		const entry = { kind: 'recover' as const, promise: chained }
		inFlight = entry
		// The chain can finish without ever reaching `takeSlot` (the refresh
		// produced a token), and then nothing else would release this entry.
		void chained
			.finally(() => {
				if (inFlight === entry) inFlight = null
			})
			.catch(() => {})
		return chained
	}

	return takeSlot(kind, undefined, fn)
}

/**
 * Install `fn`'s run as the slot's occupant and release the slot on settle.
 *
 * `self` is the promise callers already hold on the chained path — by the time
 * the chain reaches here the refresh may or may not have cleared the slot, so
 * ownership is claimed unconditionally and given up only under the usual
 * identity guard.
 */
function takeSlot(
	kind: RenewalKind,
	self: Promise<string | undefined> | undefined,
	fn: () => Promise<string | undefined>
): Promise<string | undefined> {
	const run = fn()
	const entry = { kind, promise: self ?? run }
	inFlight = entry
	return run.finally(() => {
		if (inFlight === entry) inFlight = null
	})
}

/**
 * Wait for a renewal that is already under way. Resolves immediately when none
 * is running — the caller's token failure was not a renewal race. Bounded, so a
 * renewal hanging on a dead network can't stall the caller indefinitely.
 */
export function awaitTokenRenewal(timeoutMs = 5000): Promise<string | undefined> {
	const pending = inFlight?.promise
	if (!pending) return Promise.resolve(undefined)
	// Cleared on settle: the renewal usually wins the race, and every unclaimed
	// timer would otherwise sit out its full timeout — once per failed mint, per
	// app iframe.
	let timer: ReturnType<typeof setTimeout> | undefined
	return Promise.race([
		// The slot holds the raw run, so a rejected renewal (an offline
		// `getLoginToken`) would reject here too — and `useAppToken`'s `await
		// awaitTokenRenewal()` is uncaught, so its renewer would never re-arm and
		// the iframe would die at `exp`. A failed renewal is just "no token".
		pending.catch(() => undefined),
		new Promise<undefined>((resolve) => {
			timer = setTimeout(() => resolve(undefined), timeoutMs)
		})
	]).finally(() => clearTimeout(timer))
}

// vim: ts=4

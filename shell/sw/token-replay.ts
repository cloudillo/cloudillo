// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Token replay: after an SW restart the worker holds no session token, so it
 * broadcasts `sw:token.request` and gives in-flight requests a bounded window
 * to pick up the `sw:token.set` a window client answers with. The page-side
 * listener lives in `shell/src/pwa.tsx`.
 */

import { PROTOCOL_VERSION } from '../shared/sw-protocol.js'
import { debug } from './debug.js'
import { getAuthToken } from './state.js'

declare const self: ServiceWorkerGlobalScope

// Requests parked on the bounded wait described above, resolved with whether a token arrived.
let tokenWaiters: Array<(ok: boolean) => void> = []

// After a `sw:token.none` answer, stay quiet for a while: a logged-out visitor
// would otherwise re-broadcast (and re-wait) on every single request. Cleared
// as soon as a `sw:token.set` arrives, so a login is picked up immediately.
const NO_TOKEN_QUIET_MS = 5000
let noTokenUntil = 0

function settleWaiters(ok: boolean): void {
	if (tokenWaiters.length === 0) return
	const waiters = tokenWaiters
	tokenWaiters = []
	for (const resolve of waiters) resolve(ok)
}

export function notifyTokenReceived(): void {
	noTokenUntil = 0
	settleWaiters(true)
}

/**
 * The page answered `sw:token.none` — it has no token to give. Release the
 * waiters immediately instead of burning the full timeout on every request an
 * unauthenticated visitor makes.
 */
export function notifyNoToken(): void {
	noTokenUntil = Date.now() + NO_TOKEN_QUIET_MS
	settleWaiters(false)
}

export async function waitForToken(timeoutMs: number): Promise<boolean> {
	// Single-threaded JS: the early-return and tokenWaiters.push() below cannot
	// race with a sw:token.set handler — the handler can only run at the next
	// await boundary, by which point we've either returned or registered.
	if (getAuthToken()) return true
	// The page said "no token" moments ago and `requestTokenOnce` is staying
	// quiet, so nobody would answer this wait — don't burn the timeout.
	if (Date.now() < noTokenUntil) return false
	return await new Promise<boolean>((resolve) => {
		const onResolve = (ok: boolean) => {
			clearTimeout(t)
			resolve(ok)
		}
		const t = setTimeout(() => {
			tokenWaiters = tokenWaiters.filter((r) => r !== onResolve)
			resolve(false)
		}, timeoutMs)
		tokenWaiters.push(onResolve)
	})
}

async function requestTokenFromClients(): Promise<void> {
	// `includeUncontrolled` matters: a client the worker has not claimed yet can
	// still answer, and without it nobody replies `sw:token.none` — so a guest's
	// every cl-o.* request burns the full `waitForToken` timeout.
	const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
	if (clients.length === 0) return
	for (const client of clients) {
		client.postMessage({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'sw:token.request'
		})
	}
	debug('sw:token.request broadcast to', clients.length, 'clients')
}

// Coalesce concurrent token requests behind a single in-flight broadcast so
// N parallel cl-o.* fetches after an SW restart don't trigger N postMessages
// to each window client.
let tokenRequestInFlight: Promise<void> | undefined
export function requestTokenOnce(): Promise<void> {
	if (Date.now() < noTokenUntil) return Promise.resolve()
	if (!tokenRequestInFlight) {
		tokenRequestInFlight = requestTokenFromClients().finally(() => {
			tokenRequestInFlight = undefined
		})
	}
	return tokenRequestInFlight
}
// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * ServiceWorker registration, memoized.
 *
 * Registration is expensive (register → await activation → claim → persist) and idempotent, so
 * it runs at most once per page: concurrent callers share one in-flight promise, later callers
 * get the settled one.
 */

import { PROTOCOL_VERSION } from '../../shared/sw-protocol.js'
import { readSwKeyCookie, writeSwKeyCookie } from './cookie.js'
import { swNotify } from './sw-rpc.js'

// Version-stamped so a release presents the browser a new script and triggers an
// install→activate cycle. Must be the *only* path the shell ever registers: two URLs on one
// scope fight over the registration, each forcing a redundant install.
const SW_PATH = `/sw-${process.env.CLOUDILLO_VERSION}.js`

// Well over the observed claim latency; exists so a dropped claim can't wedge boot.
const CLAIM_TIMEOUT_MS = 5000

// Boot awaits `ensureServiceWorker()`, so an install that neither activates nor goes redundant
// would otherwise wedge the whole app.
const ACTIVATION_TIMEOUT_MS = 5000

let swReady: Promise<ServiceWorkerRegistration | undefined> | undefined

/**
 * Migrate the encryption key from the legacy URL-based registration
 * (`/sw.js?key=…`) to the cookie, for users whose last visit predates it.
 */
async function migrateKeyFromUrl(): Promise<void> {
	const existingReg = await navigator.serviceWorker.getRegistration()
	if (!existingReg?.active) return

	const keyMatch = existingReg.active.scriptURL.match(/[?&]key=([^&]+)/)
	if (!keyMatch) return

	console.log('[PWA] Migrating key from URL to cookie')
	writeSwKeyCookie(keyMatch[1])

	await existingReg.unregister()
	console.log('[PWA] Old SW unregistered, key migrated to cookie')
}

/**
 * Relay the encryption key to the worker on Firefox/Safari, which have no Cookie Store API
 * there and would sit keyless until the next full page load — a mid-session worker restart
 * then makes every stored secret look missing (see `getApiKey`).
 *
 * Idempotent and cheap (a no-op on Chrome/Edge and when there is no cookie), so it is safe to
 * call before every operation needing the worker to encrypt or decrypt. Never generates a key
 * — only login (`setApiKey`) does, so unauthenticated visitors never get an `swKey` cookie.
 */
export async function ensureKeyRelayed(): Promise<void> {
	// Chrome/Edge: the SW reads the cookie directly.
	if ('cookieStore' in window) return

	// No key yet is expected pre-login — `setApiKey` mints it at sign-in.
	const existing = readSwKeyCookie()
	if (!existing) return

	await swNotify('sw:key.set', { key: existing })
}

/**
 * Refresh the encryption key cookie's lifetime, then relay it.
 *
 * Brave caps cookie Max-Age to 6 months, so the cookie is re-written on every page load, on
 * all browsers, since only the main thread runs reliably every time. That part stays
 * once-per-load; only the relay is repeatable.
 */
async function refreshEncryptionKey(): Promise<void> {
	const existing = readSwKeyCookie()
	if (existing && !writeSwKeyCookie(existing)) {
		console.warn('[PWA] swKey refresh did not persist')
	}

	await ensureKeyRelayed()
	if (existing && !('cookieStore' in window)) {
		console.log('[PWA] Encryption key relayed to service worker')
	}
}

/**
 * Wait for a freshly registered worker to reach the `activated` state.
 *
 * `redundant` and the timeout settle it too: a failed install (offline first load, a precache
 * URL missing from the deploy) never reaches `activated`, and boot awaits this — so "no
 * worker" has to be an outcome, not a hang.
 */
function awaitActivation(worker: ServiceWorker): Promise<void> {
	return new Promise<void>((resolve) => {
		let settled = false
		const finish = () => {
			if (settled) return
			settled = true
			worker.removeEventListener('statechange', onStateChange)
			clearTimeout(timeoutId)
			resolve()
		}
		function onStateChange() {
			if (worker.state === 'activated') {
				finish()
			} else if (worker.state === 'redundant') {
				console.warn('[PWA] SW install failed (redundant); continuing without a worker')
				finish()
			}
		}
		worker.addEventListener('statechange', onStateChange)

		const timeoutId = setTimeout(() => {
			console.warn('[PWA] Timed out waiting for SW activation; continuing')
			finish()
		}, ACTIVATION_TIMEOUT_MS)

		// The state may already be terminal — check after wiring up, so a transition
		// during setup can't be missed.
		if (worker.state === 'activated' || worker.state === 'redundant') onStateChange()
	})
}

/**
 * Ask the worker to claim this page and wait until it controls us. On a hard reload
 * (Ctrl+Shift+R) the SW is active but not controlling, so it would not intercept API requests
 * until the next navigation.
 */
function awaitControl(worker: ServiceWorker): Promise<void> {
	return new Promise<void>((resolve) => {
		let settled = false
		const finish = () => {
			if (settled) return
			settled = true
			navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
			clearTimeout(timeoutId)
			resolve()
		}
		const onControllerChange = () => {
			console.log('[PWA] SW is now controlling the page')
			finish()
		}
		navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

		const timeoutId = setTimeout(() => {
			console.warn('[PWA] Timed out waiting for SW controllerchange; continuing')
			finish()
		}, CLAIM_TIMEOUT_MS)

		// Posted to this specific worker, not `navigator.serviceWorker.controller` (there
		// isn't one yet), so `swNotify` cannot serve it. The version still has to come from
		// the shared constant, or a bump leaves the claim silently rejected and every boot
		// burning CLAIM_TIMEOUT_MS.
		worker.postMessage({ cloudillo: true, v: PROTOCOL_VERSION, type: 'sw:claim' })

		// The controller may have arrived while we were setting this up.
		if (navigator.serviceWorker.controller) finish()
	})
}

async function register(): Promise<ServiceWorkerRegistration | undefined> {
	if (!('serviceWorker' in navigator)) return undefined

	await migrateKeyFromUrl()

	try {
		console.log('[PWA] Registering service worker:', SW_PATH)
		const reg = await navigator.serviceWorker.register(SW_PATH)

		let activeWorker = reg.active
		if (!activeWorker) {
			const installing = reg.installing || reg.waiting
			if (installing) {
				await awaitActivation(installing)
				// Only a worker that actually activated can be claimed — a redundant or
				// still-installing one would just burn CLAIM_TIMEOUT_MS below.
				if (installing.state === 'activated') activeWorker = installing
			}
		}

		if (!navigator.serviceWorker.controller) {
			if (activeWorker) {
				console.log('[PWA] Waiting for SW to become controller...')
				await awaitControl(activeWorker)
			} else {
				// Nothing to send `sw:claim` to and nothing to drive a controllerchange
				// event — bail out instead of hanging boot on a promise that never resolves.
				console.warn('[PWA] No active SW after registration; skipping claim wait')
			}
		}

		// In Chrome persistence protects IndexedDB and Cache Storage *only* — cookies (swKey
		// included) can still be evicted under storage pressure or after long inactivity,
		// which is exactly how the key is lost while the data encrypted under it outlives it.
		if (navigator.storage?.persist) {
			if (await navigator.storage.persist()) console.log('[PWA] Storage marked as persistent')
		}

		await refreshEncryptionKey()

		console.log('[PWA] Service worker ready')
		return reg
	} catch (err) {
		console.error('[PWA] SW registration failed:', err)
		return undefined
	}
}

/** Register the SW, claim the page and hand it the key. Cheap to call anywhere. */
export function ensureServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
	if (!swReady) swReady = register()
	return swReady
}

/** Hand a freshly-obtained auth token to the SW. Cheap after the first call. */
export async function postTokenToSw(token: string): Promise<void> {
	await ensureServiceWorker()
	await swNotify('sw:token.set', { token })
}

// vim: ts=4

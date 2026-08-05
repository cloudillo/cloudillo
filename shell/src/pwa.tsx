// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import React from 'react'

import { base64UrlToBytes } from '@cloudillo/core/base64'

import { generateSwKey } from '../shared/sw-key.js'
import { clearSwKeyCookie, readSwKeyCookie, writeSwKeyCookie } from './pwa/cookie.js'
import { clearHadEncryptedData, markHadEncryptedData } from './pwa/encrypted-data-flag.js'
import { ensureKeyRelayed, ensureServiceWorker, postTokenToSw } from './pwa/registration.js'
import { getSessionToken, setSessionToken } from './pwa/session-token.js'
import { onSwMessage, swNotify, swRequestResult } from './pwa/sw-rpc.js'

// Barrel re-exports so the rest of the shell keeps importing from `pwa.js`.
export { hadEncryptedData, markHadEncryptedData } from './pwa/encrypted-data-flag.js'
export { ensureServiceWorker } from './pwa/registration.js'
export { getSessionToken, setSessionToken } from './pwa/session-token.js'

/**
 * Wipe the SW's encrypted stores and the localStorage flag so a fresh key can be
 * generated. The cache layer's cached CryptoKey is not ours: `auth/wipe-local-data.ts`
 * orders that teardown and calls `resetKeyErrorState()` right after this.
 *
 * Returns whether the worker acknowledged. False means the SW-side stores may still
 * hold encrypted data — a dead or uncontrolled worker drops the message silently — so
 * a caller that promised a wipe must not report an unverified success.
 */
export async function resetEncryptionState(): Promise<boolean> {
	clearHadEncryptedData()

	// `swRequestResult` never rejects; it reports the failure, and the three failure
	// modes read differently in a bug report.
	const ack = await swRequestResult('sw:key.reset')
	if (ack.status === 'ok') {
		console.log('[PWA] Encryption state reset')
		return true
	}
	if (ack.status === 'error') {
		console.warn('[PWA] sw:key.reset failed in the worker:', ack.error)
	} else {
		console.warn(`[PWA] sw:key.reset was not acknowledged (${ack.status})`)
	}
	return false
}

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>
	readonly userChoice: Promise<{
		outcome: 'accepted' | 'dismissed'
		platform: string
	}>
}

interface PWAConfig {
	vapidPublicKey?: string
}

export interface UsePWA {
	doInstall?: () => void
	askNotify?: (vapidPublicKey: string) => Promise<PushSubscription | undefined>
	doNotify?: (title: string, body: string, data: object) => void
}

// Last token handed to the SW, possibly a *scoped* share-link guest token installed by
// `useInstalledToken`. Deliberately separate from `currentAuthToken`, the page's session
// credential, which is persisted to `sessionStorage` — a scoped token must never get there.
let lastInstalledSwToken: string | undefined

// Serializes every write of the SW's token. `useInstalledToken` releases the old scoped
// token in one effect cleanup and installs the next in the effect right after; both are
// async, so unqueued the postMessages could arrive in either order and leave the worker
// holding the wrong one for the rest of the session.
let swTokenQueue: Promise<void> = Promise.resolve()

function queueSwTokenWrite(op: () => Promise<void>): Promise<void> {
	const next = swTokenQueue.then(op, op)
	// The chain must survive a failed write — the caller still sees the rejection.
	swTokenQueue = next.catch(() => {})
	return next
}

/**
 * Install a freshly-obtained auth token into the ServiceWorker.
 *
 * Cheap and safe on every login and renewal: one postMessage, plus remembering the token
 * so a restarted SW can be answered with whatever it last held. Registration, the
 * controller claim and the key relay happen once per page in `ensureServiceWorker()`.
 *
 * Session ownership is NOT part of this: `setCurrentAuthToken()` writes the session token
 * from the `Layout` auth effect, and a scoped token installed here must not overwrite it.
 */
export async function installToken(token: string): Promise<void> {
	lastInstalledSwToken = token
	await queueSwTokenWrite(() => postTokenToSw(token))
}

// Mirror of the in-memory auth token, kept in sync by the shell layout effect and replayed
// to a restarted SW that asks via `sw:token.request`. Module-level rather than React state,
// because the SW message listener runs outside React. Seeded from `sessionStorage` at module
// eval so a reload can answer before React has rendered anything; boot clears it again if
// the server no longer honours the token.
let currentAuthToken: string | undefined = getSessionToken()

export function setCurrentAuthToken(token: string | undefined): void {
	currentAuthToken = token
	// `sessionStorage` is what carries a "don't remember me" session across a reload
	// (see pwa/session-token.ts).
	setSessionToken(token)
	// Tell the worker up front there is nothing to hand over rather than making it wait out
	// the first request's timeout. The guard mirrors the `sw:token.request` reply below: a
	// `/s/...` share-link guest has no session token but *does* hold a scoped installed one,
	// and arming the quiet period would make a restarted worker send its file requests
	// unauthenticated.
	if (!token && !lastInstalledSwToken) void swNotify('sw:token.none')
}

// Replay the in-memory token when the SW requests it after a restart. The SW
// gets back exactly what it last held — a scoped share-link token stays scoped.
onSwMessage('sw:token.request', () => {
	const token = lastInstalledSwToken ?? currentAuthToken
	if (!token) {
		// Answer explicitly, or every unauthenticated cl-o.* request pays the SW's full wait.
		console.log('[PWA] SW requested token but none is available')
		void swNotify('sw:token.none')
		return
	}
	// A restarted SW on Firefox/Safari also lost its cached key (no Cookie Store API there)
	// and would sit keyless until the next full page load. postMessage ordering is
	// per-channel, so sending the key first guarantees the SW has it before it decrypts.
	if (!('cookieStore' in window)) {
		const key = readSwKeyCookie()
		if (key) void swNotify('sw:key.set', { key })
	}
	void swNotify('sw:token.set', { token }).then(() => {
		console.log('[PWA] Replayed auth token to SW on request')
	})
})

/**
 * Store API key in SW encrypted storage.
 *
 * The single entry point for `swKey` cookie generation at login, on every browser: the
 * worker only ever *reads* the key, since a key minted there would mask a key loss the page
 * has to assess (see `shell/sw/key-cookie.ts`). Unauthenticated visitors reach no minting
 * path, so they still never get a cookie. The mint must precede `sw:apikey.set`, or the
 * worker finds no key and skips the write. `recoverFromKeyLoss` in `auth/key-loss.ts` is
 * the only other minter.
 */
export async function setApiKey(apiKey: string): Promise<void> {
	if (!('serviceWorker' in navigator)) return

	// As in `getApiKeyResult`: on an uncontrolled page (first install, hard reload) the
	// messages below are dropped silently, and a remember-me key that was never stored
	// surfaces one boot later as a forced logout.
	await ensureServiceWorker()

	let key = readSwKeyCookie()
	if (!key) {
		key = generateSwKey()
		if (!writeSwKeyCookie(key)) {
			console.error('[PWA] swKey cookie did not persist — encrypted storage unavailable')
			throw new Error('Failed to persist encryption key cookie')
		}
		console.log('[PWA] Generated new encryption key (login)')
	}

	// Firefox/Safari have no Cookie Store API in the worker — relay the key
	// there. Chrome/Edge read the cookie the write above just made.
	if (!('cookieStore' in window)) {
		await swNotify('sw:key.set', { key })
	}

	markHadEncryptedData()

	// Acked rather than fire-and-forget: the worker skips the write when it holds no
	// encryption key, and `swNotify` no-ops without a controller. Either way login would
	// report remember-me as saved, and the next boot would read the missing key as a
	// definitive "nothing stored" — forced logout plus local wipe. Fail at login instead.
	const ack = await swRequestResult('sw:apikey.set', { apiKey })
	if (ack.status !== 'ok') {
		const detail = ack.status === 'error' ? ack.error || 'error' : ack.status
		console.error('[PWA] API key was not stored by the service worker:', detail)
		throw new Error(`Failed to store API key (${detail})`)
	}
	console.log('[PWA] API key stored by the service worker')
}

/**
 * Outcome of an API-key lookup. `'ok'` with no `apiKey` is a definitive "nothing stored" and
 * the caller may treat the session as unrecoverable. `'error'` is a worker/storage failure
 * and says nothing about whether a key exists, so it must never end a session on its own: a
 * record the worker holds but cannot decrypt (evicted or rotated swKey) answers `'error'`
 * with `error: 'undecryptable'` — see `getSecureItemResult` in shell/sw/secure-store.ts. So
 * does a page no controller could answer for.
 */
export type ApiKeyLookup = { status: 'ok'; apiKey?: string } | { status: 'error'; error?: string }

/**
 * Retrieve the API key from SW encrypted storage, keeping "no key stored" and
 * "the worker could not answer" apart.
 *
 * Only a browser without ServiceWorker support counts as a definitive "no key": nowhere a
 * key could have been stored in the first place. Every other failure — a timeout, an
 * explicit failure reply, or an uncontrolled page — is transient, and reading it as "no
 * remember-me key" forces a logout and a data wipe on a live device.
 */
export async function getApiKeyResult(): Promise<ApiKeyLookup> {
	// Let the worker claim this page first: an uncontrolled page is the common shape right
	// after a hard reload and is indistinguishable from "no worker" at the postMessage
	// layer. Memoized.
	await ensureServiceWorker()
	// A restarted worker on Firefox/Safari has lost the relayed key and would answer
	// "no key" for a record it simply cannot decrypt.
	await ensureKeyRelayed()
	const reply = await swRequestResult<{ apiKey?: string }>('sw:apikey.get.req')
	switch (reply.status) {
		case 'ok':
			return { status: 'ok', apiKey: reply.data?.apiKey }
		case 'unavailable':
			return 'serviceWorker' in navigator
				? { status: 'error', error: 'no-controller' }
				: { status: 'ok', apiKey: undefined }
		case 'error':
			return { status: 'error', error: reply.error }
		default:
			return { status: 'error', error: 'timeout' }
	}
}

/**
 * Retrieve API key from SW encrypted storage
 * Returns undefined if no SW, no controller, no stored key, or on failure —
 * use `getApiKeyResult` where a failure must not read as "no key".
 */
export async function getApiKey(): Promise<string | undefined> {
	const res = await getApiKeyResult()
	return res.status === 'ok' ? res.apiKey : undefined
}

/**
 * Delete API key from SW encrypted storage
 */
export async function deleteApiKey(): Promise<void> {
	await swNotify('sw:apikey.del')
	console.log('[PWA] API key deletion requested')
}

/**
 * Clean up encryption cookie when no encrypted data remains (temporary session logout)
 */
export function cleanupEncryptionCookie(): void {
	clearSwKeyCookie()
	clearHadEncryptedData()
}

/**
 * Clear the auth token from the SW (logout).
 *
 * Dropping the replay memo is part of the contract: a later SW restart broadcasts
 * `sw:token.request`, and a memo still holding the just-invalidated bearer would hand it
 * straight back, resuming injection until its `exp`.
 */
export async function clearAuthToken(): Promise<void> {
	lastInstalledSwToken = undefined
	await queueSwTokenWrite(() => swNotify('sw:token.clear'))
	console.log('[PWA] Auth token cleared')
}

/**
 * Give back a scoped token installed by `useInstalledToken`: forget the replay memo and
 * restore the tab's session token in the worker (or clear it when there is no session).
 * Without this a share-link token outranks the session token for the page's life.
 */
export async function releaseInstalledToken(): Promise<void> {
	lastInstalledSwToken = undefined
	// `currentAuthToken` is read when the write runs, not when queued, so a login that
	// lands in between is not undone.
	await queueSwTokenWrite(async () => {
		if (currentAuthToken) await postTokenToSw(currentAuthToken)
		else await swNotify('sw:token.clear')
	})
}

/**
 * Reset app cache: unregister all service workers, clear Cache Storage, and reload.
 * Auth tokens, cookies, localStorage, and IndexedDB are preserved.
 */
export async function resetAppCache(): Promise<void> {
	// Unregister all service workers
	if ('serviceWorker' in navigator) {
		const registrations = await navigator.serviceWorker.getRegistrations()
		await Promise.all(registrations.map((r) => r.unregister()))
	}

	// Delete all Cache Storage entries
	if ('caches' in window) {
		const keys = await caches.keys()
		await Promise.all(keys.map((k) => caches.delete(k)))
	}

	// Hard reload
	location.reload()
}

export default function usePWA(_config: PWAConfig = {}): UsePWA {
	const [_notify, setNotify] = React.useState(false)
	const [installEvt, setInstallEvt] = React.useState<BeforeInstallPromptEvent | undefined>()

	const askNotify = React.useCallback(async function askNotify(
		vapidPublicKey: string
	): Promise<PushSubscription | undefined> {
		// Notification permission
		if (vapidPublicKey && 'Notification' in window) {
			const stat = await Notification.requestPermission()
			console.log('Notification permission status:', stat)
			if (stat === 'granted') {
				setNotify(true)
				// Push notifications
				const reg = await ensureServiceWorker()
				if (!reg) return
				let sub = await reg.pushManager.getSubscription()
				if (sub) {
					console.log('Subscription object: ', JSON.stringify(sub))
					return sub
				} else {
					// Not subscribed yet
					try {
						sub = await reg.pushManager.subscribe({
							userVisibleOnly: true,
							applicationServerKey: base64UrlToBytes(vapidPublicKey)
						})
						console.log('subscription: ', sub)
						//console.log('subscription: ', JSON.stringify(sub))
						return sub
					} catch (err) {
						if (Notification.permission === 'denied') {
							console.warn('Permission for notifications was denied')
						} else {
							console.error('Unable to subscribe to push', err)
						}
						return
					}
				}
			} else {
				setNotify(false)
				return
			}
		} else return
	}, [])

	function handleBeforeInstallPrompt(evt: BeforeInstallPromptEvent) {
		//console.log('beforeinstallprompt')
		//evt.preventDefault()
		setInstallEvt(evt)
	}

	React.useEffect(function onMount() {
		// Memoized — the Header boot effect awaits this very promise.
		ensureServiceWorker().catch((err) => console.error('[PWA] startup failed:', err))

		// Install Prompt handler
		window.addEventListener(
			'beforeinstallprompt' as keyof WindowEventMap,
			handleBeforeInstallPrompt as unknown as EventListener
		)
		return function onUnmount() {
			window.removeEventListener(
				'beforeinstallprompt' as keyof WindowEventMap,
				handleBeforeInstallPrompt as unknown as EventListener
			)
		}
	}, [])

	async function doInstall() {
		if (!installEvt) throw new Error('Can not install!')
		installEvt.prompt()
		const choice = await installEvt.userChoice
		if (choice.outcome === 'accepted') {
			console.log('User accepted the A2HS prompt')
		} else {
			console.log('User dismissed the A2HS prompt')
		}
		setInstallEvt(undefined)
	}

	async function doNotify(title: string, body: string, data: object) {
		const reg = await navigator.serviceWorker.getRegistration()
		if (reg) reg.showNotification(title, { icon: undefined, body, data })
	}

	return {
		doInstall: installEvt ? doInstall : undefined,
		askNotify:
			'Notification' in window && Notification.permission != 'denied' ? askNotify : undefined,
		doNotify
	}
}

// vim: ts=4

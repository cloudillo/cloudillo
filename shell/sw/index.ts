// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Cloudillo ServiceWorker: the request pipeline, the lifecycle handlers and the
 * page<->worker message protocol. The subsystems it drives live in siblings
 * (blob-cache, secure-store, key-cookie, proxy-token, token-replay, download, push,
 * cache-strategy), their shared mutable state in state.ts.
 *
 * LOGGING RULE — this worker sees every credential the app uses: **never log a parsed
 * response body, and never log any value derived from an `Authorization` header, a token,
 * an API key or the encryption key.** Log the request path, method and status; nothing that
 * travels inside them. Use `debug()` for anything routine — it compiles out of production
 * builds; `console.warn`/`console.error` survive minification and reach real users' consoles.
 */

import { CRDT_DB, DATA_CACHE_DB, deleteDatabase } from '../shared/idb.js'
import { decodeSwMessage, PROTOCOL_VERSION, type SwMessage } from '../shared/sw-protocol.js'
import {
	BLOB_CACHE_NAME,
	clearBlobCache,
	evictBlobCache,
	fetchThroughBlobCache,
	loadBlobMeta,
	reconcileBlobMeta
} from './blob-cache.js'
import { getCacheStrategy, PRECACHE_URLS, shouldCache } from './cache-strategy.js'
import { debug } from './debug.js'
import { handleDownload } from './download.js'
import { ensureIdTag } from './id-tag.js'
import { clearKeyCookie } from './key-cookie.js'
import { ensureProxyToken, proxyTokenCache } from './proxy-token.js'
import { onNotificationClick, onPush, onPushSubscriptionChange } from './push.js'
import {
	deleteItem,
	getSecureItemResult,
	resetCryptoKeyInit,
	setSecureItem
} from './secure-store.js'
import { getAuthToken, invalidateCryptoKey, setAuthToken, setCachedKey, setIdTag } from './state.js'
import {
	notifyNoToken,
	notifyTokenReceived,
	requestTokenOnce,
	waitForToken
} from './token-replay.js'

declare const self: ServiceWorkerGlobalScope

const VERSION = process.env.CLOUDILLO_VERSION || 'unknown'
const CACHE = `cache-${VERSION}`
const DOWNLOAD_PATH = '/cl-download'

function onInstall(evt: ExtendableEvent) {
	evt.waitUntil(
		(async function () {
			debug(`INSTALL v${VERSION}, cache: ${CACHE}`)
			const cache = await caches.open(CACHE)
			// Per-URL, not `addAll`, which rejects atomically: one URL missing from a
			// deploy — or a first load while offline — would fail the whole install and
			// leave the worker redundant. Precaching is only an optimization.
			const results = await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
			const failed = PRECACHE_URLS.filter((_, i) => results[i].status === 'rejected')
			if (failed.length > 0) {
				debug('Precache failed for:', failed)
			}
			self.skipWaiting()
		})()
	)
}

function onActivate(evt: ExtendableEvent) {
	evt.waitUntil(
		(async function () {
			debug(`ACTIVATE v${VERSION}, cache: ${CACHE}`)
			// Keep blob cache across versions — only delete old versioned caches
			const keepCaches = new Set([CACHE, BLOB_CACHE_NAME])
			const cacheList = (await caches.keys()).filter((name) => !keepCaches.has(name))
			if (cacheList.length > 0) {
				debug('Deleting old caches:', cacheList)
			}
			await Promise.all(cacheList.map((name) => caches.delete(name)))

			// Reconcile before evicting: a worker killed inside the persist
			// debounce leaves Cache Storage entries nothing tracks.
			await loadBlobMeta()
			await reconcileBlobMeta().catch((err) =>
				console.warn('[SW] Blob meta reconcile on activate:', err)
			)
			evictBlobCache().catch((err) => console.warn('[SW] Blob eviction on activate:', err))

			// No token is loaded here: the page owns the session token and onFetch calls
			// requestTokenOnce() when an authed request needs one. Broadcasting during
			// activate would be dropped anyway — clients.matchAll typically returns []
			// before clients.claim() resolves.

			await self.clients.claim()
		})()
	)
}

/**
 * Hand the blob cache this request's lifetime, so its debounced metadata persist isn't lost
 * to an idle-terminated worker. Best-effort: `waitUntil` throws once the event is no longer
 * active, and a write landing that late goes uncovered — the activate-time
 * `reconcileBlobMeta()` repairs the accounting.
 */
function keepAliveFor(evt: FetchEvent): (p: Promise<unknown>) => void {
	return (p) => {
		try {
			evt.waitUntil(p)
		} catch {
			/* the event already settled */
		}
	}
}

function onFetch(evt: FetchEvent) {
	const reqUrl = new URL(evt.request.url)

	// IMPORTANT: Allow .well-known/cloudillo/id-tag to bypass SW logic
	// to prevent deadlock when SW fetches its own idTag
	if (reqUrl.pathname === '/.well-known/cloudillo/id-tag') {
		evt.respondWith(fetch(evt.request))
		return
	}

	// Synthetic streaming-download route (same-origin). The SW fetches the real
	// cl-o.* file with the auth token injected and streams the body straight back
	// with an attachment disposition. Keeps the token out of every URL (the page
	// links to a token-less same-origin path) and never buffers the body in page
	// memory, so large videos download without a memory spike.
	if (reqUrl.origin === self.location.origin && reqUrl.pathname === DOWNLOAD_PATH) {
		evt.respondWith(handleDownload(reqUrl))
		return
	}

	evt.respondWith(
		(async function () {
			// Only resolve idTag for cl-o.* requests that need auth/proxy handling.
			// Static assets (sounds, fonts, etc.) must not be blocked on idTag resolution,
			// as the delay can cause the browser to abort preload requests.
			if (reqUrl.hostname.startsWith('cl-o.')) {
				const idTag = await ensureIdTag()

				// Endpoints that authenticate with their own credentials (API-key exchange,
				// QR-login secret) and must NOT trigger the Bearer-token handshake.
				// login-init is the shell's own "am I logged in?" probe: injecting the SW's
				// token would answer `authenticated` for a page holding no credential of
				// its own, rendering a logged-in shell whose file opens all fail.
				const isPreAuthPath =
					reqUrl.pathname === '/api/auth/access-token' ||
					reqUrl.pathname === '/api/auth/login-init' ||
					(reqUrl.pathname.startsWith('/api/auth/qr-login/') &&
						reqUrl.pathname.endsWith('/status'))

				// No token (SW restart, or the page hasn't pushed one yet): ask the page
				// for it. Bounded wait, so a genuinely unauthenticated page doesn't hang
				// every request.
				if (!getAuthToken() && !isPreAuthPath) {
					void requestTokenOnce()
					const got = await waitForToken(1500)
					debug(
						got
							? 'Token recovered from page after restart'
							: 'Token request to page timed out; proceeding unauth'
					)
				}

				if (idTag && reqUrl.hostname == 'cl-o.' + idTag) {
					debug('OWN FETCH', evt.request.method, reqUrl.pathname)

					// Login responses are NOT inspected here: the page owns the session
					// token and hands it over with `installToken()` on every login path.
					// Scraping it from the body would duplicate that ownership and mean
					// parsing (and logging) a credential the SW has no need to read.
					return await fetchThroughBlobCache(
						evt.request,
						reqUrl,
						() => {
							// isPreAuthPath: those endpoints carry their own
							// credentials, and a stale Bearer would 401 them.
							const authToken = getAuthToken()
							if (
								!authToken ||
								evt.request.headers.get('Authorization') ||
								isPreAuthPath
							) {
								return evt.request
							}
							debug('OWN FETCH inserting token')
							const headers = new Headers(evt.request.headers)
							headers.set('Authorization', `Bearer ${authToken}`)
							return new Request(evt.request, { headers, mode: 'cors' })
						},
						'OWN',
						keepAliveFor(evt)
					)
				} else if (
					idTag &&
					reqUrl.hostname != 'cl-o.' + idTag &&
					reqUrl.pathname.startsWith('/api/')
				) {
					// Federated: another idTag's API.
					debug('FETCH API', evt.request.method, evt.request.url)

					const targetTag = new URL(evt.request.url).hostname.replace('cl-o.', '')

					debug('PROXY TOKEN: ' + idTag + '/api/auth/proxy-token -> ' + targetTag)
					return await fetchThroughBlobCache(
						evt.request,
						reqUrl,
						async () => {
							const token = await ensureProxyToken(targetTag)
							// No token (guest): leave the request alone, as the OWN
							// branch does. Upgrading a plain <img> to `cors` with
							// nothing to authenticate would fail outright against a
							// strict-CORS peer instead of degrading to an opaque response.
							if (!token) return evt.request
							const headers = new Headers(evt.request.headers)
							headers.set('Origin', location.origin)
							headers.set('Authorization', `Bearer ${token}`)
							return new Request(evt.request, { headers, mode: 'cors' })
						},
						'FED',
						keepAliveFor(evt)
					)
				}

				if (!idTag && reqUrl.pathname.startsWith('/api/')) {
					console.warn(
						'[SW] Falling through to direct fetch without idTag for:',
						evt.request.url
					)
				}
			}
			debug('FETCH NO-API', evt.request.method, evt.request.url)

			// Only cache GET requests to our own origin
			if (evt.request.method !== 'GET' || reqUrl.origin !== self.location.origin) {
				return fetch(evt.request)
			}

			const strategy = getCacheStrategy(reqUrl.pathname)
			debug('strategy', strategy, reqUrl.pathname)

			if (strategy === 'network-only') {
				return fetch(evt.request)
			}

			const cache = await caches.open(CACHE)

			if (strategy === 'cache-first') {
				const cached = await cache.match(evt.request)
				if (cached) {
					debug('CACHE HIT', evt.request.url)
					return cached
				}
				try {
					const res = await fetch(new Request(evt.request.url))
					if (res.ok && shouldCache(res)) {
						await cache.put(evt.request, res.clone())
						debug('CACHED', evt.request.url)
					}
					return res
				} catch {
					return new Response('Network error', { status: 408 })
				}
			}

			// network-first
			try {
				const res = await fetch(new Request(evt.request.url, { cache: 'no-cache' }))
				if (res.ok && shouldCache(res)) {
					await cache.put(evt.request, res.clone())
					debug('CACHED (nf)', evt.request.url)
				}
				return res
			} catch {
				const cached = await cache.match(evt.request)
				if (cached) {
					debug('CACHE FALLBACK', evt.request.url)
					return cached
				}
				// Serve offline page for navigation requests
				if (evt.request.mode === 'navigate') {
					const offlinePage = await cache.match('/offline.html')
					if (offlinePage) return offlinePage
				}
				return new Response('Network error', { status: 408 })
			}
		})()
	)
}

// Everything up to `waitUntil` is synchronous on purpose: the handler writes to IndexedDB
// and Cache Storage, and without the keepalive an idle worker can be terminated mid-handler
// — leaving e.g. a half-cleared API key behind on logout.
function onMessage(evt: ExtendableMessageEvent) {
	// Defense-in-depth: today iframe apps can't reach the SW (sandbox blocks it without
	// allow-same-origin), but a future page or extension code-path could.
	if (evt.origin && evt.origin !== self.origin) return

	const msg = decodeSwMessage(evt.data)
	if (!msg) {
		// Only the type is safe to name here (see LOGGING RULE), and only for senders that
		// at least got the envelope right — everything else on this channel is someone
		// else's traffic, not a malformed message.
		const raw = evt.data as { cloudillo?: unknown; type?: unknown } | null
		if (raw?.cloudillo && typeof raw.type === 'string') {
			console.warn('[SW] Rejected malformed message:', raw.type)
		}
		return
	}

	evt.waitUntil(handleSwMessage(msg, evt.source))
}

/**
 * Answer a request-shaped message that failed, so the page can tell a broken worker from a
 * silent one. Without a reply `swRequest` only times out, and the page reads that as "there
 * is no stored API key" and forces a logout — for what may be a transient IndexedDB error.
 */
function postFailureReply(msg: SwMessage, source: ExtendableMessageEvent['source'], err: unknown) {
	if (!source || !('postMessage' in source)) return
	const error = err instanceof Error ? err.message : String(err)
	const client = source as unknown as Client

	if (msg.type === 'sw:apikey.get.req') {
		client.postMessage({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'sw:apikey.get.res',
			replyTo: msg.id,
			ok: false,
			error
		})
	} else if (msg.type === 'sw:key.reset') {
		client.postMessage({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'sw:key.reset.ack',
			replyTo: msg.id,
			ok: false,
			error
		})
	}
}

async function handleSwMessage(msg: SwMessage, source: ExtendableMessageEvent['source']) {
	debug('Received:', msg.type)

	try {
		await dispatchSwMessage(msg, source)
	} catch (err) {
		// LOGGING RULE: the message type and the failure, never the payload.
		console.error('[SW] Message handler failed:', msg.type, err)
		postFailureReply(msg, source, err)
	}
}

async function dispatchSwMessage(msg: SwMessage, source: ExtendableMessageEvent['source']) {
	switch (msg.type) {
		case 'sw:token.set':
			// In-memory only: the page owns the session token and re-pushes it after an
			// SW restart (`sw:token.request`).
			setAuthToken(msg.payload.token)
			notifyTokenReceived()
			break

		case 'sw:token.none':
			// Release the waiters instead of letting every unauthenticated request burn
			// the full timeout.
			notifyNoToken()
			break

		case 'sw:token.clear':
			setAuthToken(undefined)
			// Legacy cleanup: older installs hold an encrypted bearer under `authToken`.
			// The worker no longer writes that record — this is what removes the last
			// copies of it, so it is not dead code.
			await deleteItem('authToken')
			proxyTokenCache.clear()
			await clearBlobCache()
			break

		case 'sw:apikey.set': {
			// Acked because the write can be skipped: with no encryption key
			// `setSecureItem` stores nothing rather than storing it in the clear. Unacked,
			// the page reports remember-me as saved and only finds out one boot later, as
			// a forced logout on a live device.
			const stored = await setSecureItem('apiKey', msg.payload.apiKey)
			if (source && 'postMessage' in source) {
				;(source as unknown as Client).postMessage({
					cloudillo: true,
					v: PROTOCOL_VERSION,
					type: 'sw:apikey.set.ack',
					replyTo: msg.id,
					ok: stored,
					// `swRequestResult` reads `data` as the payload; without it success is
					// indistinguishable from a timeout.
					...(stored ? { data: {} } : { error: 'no-encryption-key' })
				})
			}
			break
		}

		case 'sw:apikey.get.req': {
			// `ok: true` with no apiKey is the page's proof that no "remember me" key
			// exists, and it ends the session for good on that. A record we merely cannot
			// decrypt (evicted/rotated swKey) must be reported as an error instead, so the
			// page keeps the session and lets `assessKeyLoss()` handle it on the next boot.
			const stored = await getSecureItemResult('apiKey')
			if (source && 'postMessage' in source) {
				;(source as unknown as Client).postMessage({
					cloudillo: true,
					v: PROTOCOL_VERSION,
					type: 'sw:apikey.get.res',
					replyTo: msg.id,
					...(stored.status === 'ok'
						? { ok: true, data: { apiKey: stored.value || undefined } }
						: { ok: false, error: 'undecryptable' })
				})
			}
			break
		}

		case 'sw:apikey.del':
			await deleteItem('apiKey')
			// Legacy cleanup, see 'sw:token.clear'.
			await deleteItem('authToken')
			// The bearer was minted from the key just revoked — it must not outlive it, or
			// it silently re-authenticates the next boot.
			setAuthToken(undefined)
			proxyTokenCache.clear()
			await clearBlobCache()
			break

		case 'sw:key.set':
			// Firefox/Safari: no Cookie Store API here, so the page relays the key.
			setCachedKey(msg.payload.key)
			invalidateCryptoKey() // Force re-import with new key
			resetCryptoKeyInit() // ...and drop an import of the key it replaces
			debug('Encryption key received via postMessage')
			break

		case 'sw:key.reset':
			await deleteItem('apiKey')
			// Legacy cleanup, see 'sw:token.clear'.
			await deleteItem('authToken')
			await clearBlobCache()
			for (const name of [CRDT_DB, DATA_CACHE_DB]) {
				// Blocked means the page still has it open, so the encrypted leftovers
				// outlive the key being reset here.
				if ((await deleteDatabase(name)) === 'blocked') {
					debug('Delete blocked by an open connection:', name)
				}
			}
			invalidateCryptoKey()
			resetCryptoKeyInit()
			// Drop the cookie too, or `getKeyFromCookie()` reads the discarded key
			// straight back and the next encrypt lands under it.
			await clearKeyCookie()
			setCachedKey(null) // Clear the key relayed via postMessage
			// Drop in-memory auth state too — otherwise the SW would keep
			// authorising fetches with the just-wiped session's token.
			setAuthToken(undefined)
			setIdTag(undefined)
			proxyTokenCache.clear()
			debug('Encrypted data cleared for key reset')
			if (source && 'postMessage' in source) {
				;(source as unknown as Client).postMessage({
					cloudillo: true,
					v: PROTOCOL_VERSION,
					type: 'sw:key.reset.ack',
					replyTo: msg.id,
					ok: true,
					// `swRequest` resolves `data`; without it success and "no controller /
					// timed out" would both be `undefined`.
					data: {}
				})
			}
			break

		case 'sw:claim':
			// A hard reload leaves the worker active but not controlling.
			await self.clients.claim()
			debug('Claimed clients')
			break
	}
}

self.addEventListener('install', onInstall as EventListener)
self.addEventListener('activate', onActivate as EventListener)
self.addEventListener('fetch', onFetch as EventListener)
self.addEventListener('message', onMessage)
self.addEventListener('pushsubscriptionchange', onPushSubscriptionChange)
self.addEventListener('push', onPush)
self.addEventListener('notificationclick', onNotificationClick)

// vim: ts=4

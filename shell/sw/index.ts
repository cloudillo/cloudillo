declare const self: ServiceWorkerGlobalScope

// Extended cookie options (secure/sameSite/expires not fully typed in TS lib)
interface CookieSetExtOptions extends CookieInit {
	secure?: boolean
	sameSite?: CookieSameSite
	expires?: number
}

// NotificationOptions.image/sound not in TS lib types
interface ExtendedNotificationOptions extends NotificationOptions {
	image?: string
	sound?: string
}

const VERSION = process.env.CLOUDILLO_VERSION || 'unknown'
const CACHE = `cache-${VERSION}`
const log = 1

const PRECACHE_URLS: string[] = [
	'/',
	'/index.html',
	'/manifest.json',
	'/icon-192.png',
	'/offline.html'
]

/************************/
/* Blob Cache           */
/************************/
const BLOB_CACHE_NAME = 'cloudillo-blobs'
const BLOB_CACHE_BUDGET = 30 * 1024 * 1024 // 30MB
const MAX_BLOB_SIZE = 500 * 1024 // 500KB — reject larger blobs
const CACHEABLE_VARIANTS = new Set(['vis.pf', 'vis.tn', 'vis.sd', 'vis.md'])
const VARIANT_PRIORITY: Record<string, number> = {
	'vis.md': 0, // evicted first
	'vis.sd': 1,
	'vis.tn': 2,
	'vis.pf': 3 // evicted last
}
const BLOB_META_KEY = 'blobMeta'
const BLOB_META_PERSIST_INTERVAL = 10_000 // 10s

interface BlobMeta {
	variant: string
	size: number
	cachedAt: number
	accessedAt: number
}

// In-memory blob metadata map: url → BlobMeta
let blobMetaMap = new Map<string, BlobMeta>()
let blobMetaDirty = false
let blobMetaPersistTimer: ReturnType<typeof setTimeout> | null = null
let blobTotalSize = 0

function getBlobCache(): Promise<Cache> {
	return caches.open(BLOB_CACHE_NAME)
}

function isCacheableBlobRequest(url: URL): string | null {
	if (!url.pathname.startsWith('/api/files/')) return null
	const variant = url.searchParams.get('variant')
	if (!variant || !CACHEABLE_VARIANTS.has(variant)) return null
	return variant
}

function blobCacheKey(url: URL): string {
	// Normalize: use only origin + pathname + variant (strip token param)
	const normalized = new URL(url.origin + url.pathname)
	const variant = url.searchParams.get('variant')
	if (variant) normalized.searchParams.set('variant', variant)
	return normalized.toString()
}

async function cacheBlobResponse(url: URL, response: Response): Promise<void> {
	const variant = url.searchParams.get('variant')
	if (!variant) return

	// Clone IMMEDIATELY — the caller returns the original response to the browser,
	// so its body will be locked after the first await yields control
	const cloned = response.clone()

	// Determine size: prefer Content-Length, fall back to reading the body
	const contentLength = cloned.headers.get('Content-Length')
	let size = contentLength ? parseInt(contentLength, 10) : NaN

	const key = blobCacheKey(url)
	const cache = await getBlobCache()

	if (!Number.isNaN(size) && size > 0 && size <= MAX_BLOB_SIZE) {
		// Content-Length is available and within limits — cache directly
		await cache.put(new Request(key), cloned)
	} else if (Number.isNaN(size)) {
		// No Content-Length (chunked encoding) — read body to measure size
		const body = await cloned.arrayBuffer()
		size = body.byteLength
		if (size === 0 || size > MAX_BLOB_SIZE) return
		await cache.put(
			new Request(key),
			new Response(body, {
				status: cloned.status,
				statusText: cloned.statusText,
				headers: cloned.headers
			})
		)
	} else {
		// Size is 0 or exceeds limit
		return
	}

	// Update metadata
	blobMetaMap.set(key, {
		variant,
		size,
		cachedAt: Date.now(),
		accessedAt: Date.now()
	})
	blobTotalSize += size
	scheduleBlobMetaPersist()

	// Trigger eviction if over budget
	if (blobTotalSize > BLOB_CACHE_BUDGET) {
		evictBlobCache().catch((err) => console.warn('[SW] Blob eviction error:', err))
	}
}

async function evictBlobCache(): Promise<void> {
	if (blobTotalSize <= BLOB_CACHE_BUDGET) return

	const cache = await getBlobCache()

	// Sort entries: lowest priority first, then oldest accessedAt
	const entries = [...blobMetaMap.entries()].sort(([, a], [, b]) => {
		const pa = VARIANT_PRIORITY[a.variant] ?? 0
		const pb = VARIANT_PRIORITY[b.variant] ?? 0
		if (pa !== pb) return pa - pb // lower priority number = evicted first
		return a.accessedAt - b.accessedAt // oldest first
	})

	for (const [key, meta] of entries) {
		if (blobTotalSize <= BLOB_CACHE_BUDGET) break

		await cache.delete(new Request(key))
		blobTotalSize -= meta.size
		blobMetaMap.delete(key)
	}
	scheduleBlobMetaPersist()
	log &&
		console.log('[SW] Blob eviction complete, total:', Math.round(blobTotalSize / 1024), 'KB')
}

async function clearBlobCache(): Promise<void> {
	await caches.delete(BLOB_CACHE_NAME)
	blobMetaMap.clear()
	blobTotalSize = 0
	blobMetaDirty = false
	try {
		await deleteItem(BLOB_META_KEY)
	} catch {
		/* ignore */
	}
	log && console.log('[SW] Blob cache cleared')
}

function scheduleBlobMetaPersist(): void {
	blobMetaDirty = true
	if (blobMetaPersistTimer) return
	blobMetaPersistTimer = setTimeout(() => {
		blobMetaPersistTimer = null
		persistBlobMeta().catch((err) => console.warn('[SW] Blob meta persist error:', err))
	}, BLOB_META_PERSIST_INTERVAL)
}

async function persistBlobMeta(): Promise<void> {
	if (!blobMetaDirty) return
	const serialized = JSON.stringify([...blobMetaMap.entries()])
	await setItem(BLOB_META_KEY, serialized)
	blobMetaDirty = false
}

async function loadBlobMeta(): Promise<void> {
	try {
		const raw = (await getItem(BLOB_META_KEY)) as string | undefined
		if (!raw) return
		const entries: [string, BlobMeta][] = JSON.parse(raw)
		blobMetaMap = new Map(entries)
		blobTotalSize = 0
		for (const [, meta] of blobMetaMap) {
			blobTotalSize += meta.size
		}
		log &&
			console.log(
				'[SW] Loaded blob meta:',
				blobMetaMap.size,
				'entries,',
				Math.round(blobTotalSize / 1024),
				'KB'
			)
	} catch (err) {
		console.warn('[SW] Failed to load blob meta:', err)
		blobMetaMap.clear()
		blobTotalSize = 0
	}
}

async function fetchWithBlobCache(request: Request, url: URL): Promise<Response | null> {
	const variant = isCacheableBlobRequest(url)
	if (!variant || request.method !== 'GET') return null

	const key = blobCacheKey(url)
	const cache = await getBlobCache()

	// Check cache
	const cached = await cache.match(new Request(key))
	if (cached) {
		// Update accessedAt in memory
		const meta = blobMetaMap.get(key)
		if (meta) {
			meta.accessedAt = Date.now()
			scheduleBlobMetaPersist()
		}
		log && console.log('[SW] BLOB CACHE HIT', variant, url.pathname)
		return cached
	}

	return null
}

type CacheStrategy = 'cache-first' | 'network-first' | 'network-only'

function shouldCache(response: Response): boolean {
	const cc = response.headers.get('Cache-Control') || ''
	return !cc.includes('no-store') && !cc.includes('no-cache')
}

function getCacheStrategy(pathname: string): CacheStrategy {
	// API and WebSocket endpoints: never cache
	if (pathname.startsWith('/api/') || pathname.startsWith('/ws/')) return 'network-only'

	// Versioned assets, fonts, sounds, icons, favicons: immutable / long-lived
	if (
		/^\/assets-[^/]+\//.test(pathname) || // /assets-1.2.3/*
		/^\/apps\/[^/]+\/assets-[^/]+\//.test(pathname) || // /apps/quillo/assets-1.0.0/*
		pathname.startsWith('/fonts/') ||
		pathname.startsWith('/sounds/') ||
		/^\/icon-[^/]+\.png$/.test(pathname) || // /icon-192.png, /icon-512.png
		/^\/favicon\./.test(pathname) // /favicon.svg, /favicon.ico
	)
		return 'cache-first'

	// HTML and manifest: try network first so updates land quickly
	if (
		pathname === '/' ||
		pathname === '/index.html' ||
		pathname === '/manifest.json' ||
		/^\/apps\/[^/]+\/index\.html$/.test(pathname)
	)
		return 'network-first'

	// Everything else: network-first as a safe default
	return 'network-first'
}

//import { LRUCache } from 'lru-cache'
import LRU from 'quick-lru'

/************************/
/* Message Protocol     */
/************************/
const PROTOCOL_VERSION = 1

interface SwMessage {
	cloudillo: true
	v: number
	type: string
	payload?: unknown
	id?: number
}

function isValidSwMessage(data: unknown): data is SwMessage {
	if (!data || typeof data !== 'object') return false
	const msg = data as Record<string, unknown>
	return msg.cloudillo === true && msg.v === PROTOCOL_VERSION
}

/************************/
/* Encryption Key       */
/* Client-generated, stored in cookie (app-bound encryption in Chrome) */
/************************/
const KEY_COOKIE_NAME = 'swKey'

// Cached key from postMessage (fallback for Firefox/Safari)
let cachedKeyString: string | null = null

// Generate a random 256-bit key, return as base64url
function generateKey(): string {
	const keyBytes = crypto.getRandomValues(new Uint8Array(32))
	return btoa(String.fromCharCode(...keyBytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')
}

// Read key from cookie (Chrome/Edge with Cookie Store API)
async function getKeyFromCookie(): Promise<string | null> {
	if (!('cookieStore' in self)) return null
	try {
		const cookie = await self.cookieStore.get(KEY_COOKIE_NAME)
		return cookie?.value || null
	} catch {
		return null
	}
}

// Store key in cookie
async function setKeyToCookie(key: string): Promise<boolean> {
	if (!('cookieStore' in self)) return false
	try {
		await self.cookieStore.set({
			name: KEY_COOKIE_NAME,
			value: key,
			secure: true,
			sameSite: 'strict',
			expires: Date.now() + 2147483647 * 1000 // ~68 years (max)
		} as CookieSetExtOptions)
		return true
	} catch {
		return false
	}
}

// Notify all window clients about key access error
async function notifyKeyAccessError(reason: 'key_missing' | 'key_mismatch'): Promise<void> {
	// Store error state so main thread can query it
	keyErrorState = reason

	const clients = await self.clients.matchAll({ type: 'window' })
	for (const client of clients) {
		client.postMessage({
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'sw:key.error',
			payload: { error: reason }
		})
	}
	log && console.log('[SW] Key error notification sent to', clients.length, 'clients:', reason)
}

// Get or create encryption key
async function getOrCreateKey(): Promise<string | null> {
	// Try to read existing key from cookie
	let keyString = await getKeyFromCookie()

	if (keyString) {
		// Clear any previous error state - key is now accessible
		keyErrorState = null
		return keyString
	}

	// No cookie - check if there's encrypted data that would become inaccessible
	if (await hasEncryptedData()) {
		console.error('[SW] CRITICAL: Encryption key cookie missing but encrypted data exists!')
		console.error('[SW] This may happen if browser cookie storage is temporarily inaccessible.')
		notifyKeyAccessError('key_missing')
		return null // Do NOT generate new key - would destroy existing data
	}

	// No encrypted data - safe to generate new key
	if ('cookieStore' in self) {
		keyString = generateKey()
		const stored = await setKeyToCookie(keyString)
		if (!stored) {
			console.error('[SW] Failed to store generated key')
			return null
		}
		log && console.log('[SW] Generated and stored new encryption key')
	}

	return keyString
}

/***********/
/* Storage */
/***********/
const DB_NAME = 'db'
const STORE_NAME = 'secrets'

function initDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1)

		request.onupgradeneeded = (evt) => {
			const db = (evt.target as IDBOpenDBRequest).result
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME)
			}
		}

		request.onsuccess = (evt) => resolve((evt.target as IDBOpenDBRequest).result)
		request.onerror = (evt) => reject((evt.target as IDBOpenDBRequest).error)
	})
}

async function setItem(key: string, value: string) {
	const db = await initDB()
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readwrite')
		const store = transaction.objectStore(STORE_NAME)

		const request = store.put(value, key)

		request.onsuccess = () => resolve(true)
		request.onerror = (evt) => reject((evt.target as IDBRequest).error)
	})
}

async function getItem(key: string) {
	const db = await initDB()
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readonly')
		const store = transaction.objectStore(STORE_NAME)

		const request = store.get(key)

		request.onsuccess = (evt) => resolve((evt.target as IDBRequest).result)
		request.onerror = (evt) => reject((evt.target as IDBRequest).error)
	})
}

async function deleteItem(key: string) {
	const db = await initDB()
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readwrite')
		const store = transaction.objectStore(STORE_NAME)

		const request = store.delete(key)

		request.onsuccess = () => resolve(true)
		request.onerror = (evt) => reject((evt.target as IDBRequest).error)
	})
}

// Check if encrypted data exists in storage (used to prevent key regeneration)
async function hasEncryptedData(): Promise<boolean> {
	try {
		const authToken = (await getItem('authToken')) as string | undefined
		const apiKey = (await getItem('apiKey')) as string | undefined
		return (authToken?.startsWith('enc:') || apiKey?.startsWith('enc:')) ?? false
	} catch {
		return false
	}
}

/**************/
/* Encryption */
/**************/
let cryptoKey: CryptoKey | null = null
let _encryptionAvailable = false
let keyErrorState: 'key_missing' | 'key_mismatch' | null = null // Store error state for main thread to query

async function initCryptoKey(): Promise<CryptoKey | null> {
	if (cryptoKey) return cryptoKey

	// Try cookie first (Chrome/Edge), fall back to cached key from postMessage (Firefox/Safari)
	const keyString = (await getOrCreateKey()) || cachedKeyString

	if (!keyString) {
		log && console.log('[SW] No encryption key available')
		_encryptionAvailable = false
		return null
	}

	try {
		// Convert base64url to standard base64 (replace - with +, _ with /, add padding)
		const padding = '='.repeat((4 - (keyString.length % 4)) % 4)
		const base64 = (keyString + padding).replace(/-/g, '+').replace(/_/g, '/')
		const keyData = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
		cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, [
			'encrypt',
			'decrypt'
		])
		_encryptionAvailable = true
		return cryptoKey
	} catch (err) {
		console.error('[SW] Failed to import encryption key:', err)
		_encryptionAvailable = false
		return null
	}
}

async function encryptData(plaintext: string): Promise<string | null> {
	const key = await initCryptoKey()
	if (!key) {
		// Never store unencrypted - return null to skip storage
		console.error('[SW] Cannot encrypt: no encryption key - skipping storage')
		return null
	}

	const iv = crypto.getRandomValues(new Uint8Array(12))
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		new TextEncoder().encode(plaintext)
	)
	const combined = new Uint8Array(iv.length + ciphertext.byteLength)
	combined.set(iv)
	combined.set(new Uint8Array(ciphertext), iv.length)
	return 'enc:' + btoa(String.fromCharCode(...combined))
}

async function decryptData(encrypted: string): Promise<string | null> {
	// Reject unencrypted data - we never store unencrypted
	if (!encrypted.startsWith('enc:')) {
		console.error('[SW] Rejecting unencrypted data - clearing legacy storage')
		return null
	}

	const key = await initCryptoKey()
	if (!key) {
		console.error('[SW] Cannot decrypt: no encryption key')
		return null
	}

	try {
		const combined = Uint8Array.from(atob(encrypted.slice(4)), (c) => c.charCodeAt(0))
		const iv = combined.slice(0, 12)
		const ciphertext = combined.slice(12)
		const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
		return new TextDecoder().decode(decrypted)
	} catch (err) {
		console.error('[SW] Decryption failed:', err)
		console.error('[SW] CRITICAL: Encryption key may be incorrect or data is corrupted!')
		notifyKeyAccessError('key_mismatch')
		return null
	}
}

async function setSecureItem(key: string, value: string) {
	const encrypted = await encryptData(value)
	if (encrypted) {
		await setItem(key, encrypted)
	}
	// If encryption failed, don't store anything (no unencrypted fallback)
}

async function getSecureItem(key: string): Promise<string | null> {
	const encrypted = (await getItem(key)) as string | undefined
	if (!encrypted) return null
	return decryptData(encrypted)
}

async function deleteSecureItem(key: string): Promise<void> {
	await deleteItem(key)
}

/******************/
/* Service worker */
/******************/

//const proxyTokenCache: Record<string, string> = {}
const proxyTokenCache = new LRU<string, string>({ maxSize: 100, maxAge: 1000 * 50 /* 50 sec */ })

let idTag: string | undefined
let authToken: string | undefined

function onInstall(evt: ExtendableEvent) {
	evt.waitUntil(
		(async function () {
			console.log(`[SW] INSTALL v${VERSION}, cache: ${CACHE}`)
			const cache = await caches.open(CACHE)
			await cache.addAll(PRECACHE_URLS)
			self.skipWaiting()
		})()
	)
}

function onActivate(evt: ExtendableEvent) {
	evt.waitUntil(
		(async function () {
			console.log(`[SW] ACTIVATE v${VERSION}, cache: ${CACHE}`)
			// Keep blob cache across versions — only delete old versioned caches
			const keepCaches = new Set([CACHE, BLOB_CACHE_NAME])
			const cacheList = (await caches.keys()).filter((name) => !keepCaches.has(name))
			if (cacheList.length > 0) {
				console.log(`[SW] Deleting old caches:`, cacheList)
			}
			await Promise.all(cacheList.map((name) => caches.delete(name)))

			// Load blob metadata and run eviction
			await loadBlobMeta()
			evictBlobCache().catch((err) => console.warn('[SW] Blob eviction on activate:', err))

			// Load persisted token on activation
			if (!authToken) {
				const persistedToken = await getSecureItem('authToken')
				if (persistedToken) {
					authToken = persistedToken
					log && console.log('[SW] Loaded persisted auth token')
				}
			}

			await self.clients.claim()
		})()
	)
}

let fetchIdTagPromise: Promise<string | undefined> | undefined
let fetchAuthTokenPromise: Promise<string | null> | undefined
async function fetchIdTag(): Promise<string | undefined> {
	try {
		const res = await fetch('/.well-known/cloudillo/id-tag')
		if (!res.ok) {
			console.error('[SW] failed to fetch idTag: HTTP', res.status)
			return undefined
		}
		const json = await res.json()
		const tag = json?.idTag
		if (typeof tag !== 'string') {
			console.error('[SW] invalid idTag response:', json)
			return undefined
		}
		return tag
	} catch (err) {
		console.error('[SW] failed to fetch idTag', err)
		return undefined
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

	evt.respondWith(
		(async function () {
			// Only resolve idTag for cl-o.* requests that need auth/proxy handling.
			// Static assets (sounds, fonts, etc.) must not be blocked on idTag resolution,
			// as the delay can cause the browser to abort preload requests.
			if (reqUrl.hostname.startsWith('cl-o.')) {
				if (!idTag) {
					log && console.log('[SW] fetching idTag')
					if (!fetchIdTagPromise) fetchIdTagPromise = fetchIdTag()
					const fetchedTag = await fetchIdTagPromise
					if (fetchedTag) {
						idTag = fetchedTag
					} else {
						// Reset promise on failure to allow retry on next request
						fetchIdTagPromise = undefined
					}
					log && console.log('[SW] idTag:', idTag)
				}

				// Lazy-load authToken from encrypted storage if SW was restarted
				if (!authToken) {
					log && console.log('[SW] authToken missing, loading from storage')
					if (!fetchAuthTokenPromise) fetchAuthTokenPromise = getSecureItem('authToken')
					const persistedToken = await fetchAuthTokenPromise
					if (persistedToken) {
						authToken = persistedToken
						log && console.log('[SW] Loaded persisted auth token in fetch handler')
					}
					fetchAuthTokenPromise = undefined
				}

				if (idTag && reqUrl.hostname == 'cl-o.' + idTag) {
					// Handle requests to our own idTag
					log && console.log('[SW] OWN FETCH', evt.request.method, reqUrl.pathname)

					// Check blob cache first for cacheable file requests
					const cachedBlob = await fetchWithBlobCache(evt.request, reqUrl)
					if (cachedBlob) return cachedBlob

					try {
						let request = evt.request
						// Skip auth header for endpoints that use their own credentials
						// (e.g., API key exchange) to avoid stale Bearer tokens causing 401
						const skipAuthPaths = ['/api/auth/access-token']
						if (
							authToken &&
							!evt.request.headers.get('Authorization') &&
							!skipAuthPaths.includes(reqUrl.pathname)
						) {
							log && console.log('[SW] OWN FETCH inserting token')
							const headers = new Headers(evt.request.headers)
							headers.set('Authorization', `Bearer ${authToken}`)
							//request = new Request(evt.request, { headers: headers, mode: request.mode })
							request = new Request(evt.request, { headers: headers, mode: 'cors' })
						}

						const origRes = await fetch(request)

						if (
							[
								'/api/auth/login-token',
								'/api/auth/login',
								'/api/auth/set-password'
							].includes(reqUrl.pathname)
						) {
							// Extract token from response
							const res = origRes.clone()
							log && console.log('[SW] OWN RES', res.status)
							const j = await res.json()
							log && console.log('[SW] OWN RES BODY', j)
							if (j.data?.token) {
								log && console.log('[SW] OWN RES TOKEN')
								authToken = j.data.token as string
								// Only persist if API key exists (= "stay logged in")
								if (await getItem('apiKey')) {
									await setSecureItem('authToken', authToken)
								}
							}
							/*
						const cleanedRes = new Response(JSON.stringify({ ...j, token: undefined }), {
							status: res.status,
							statusText: res.statusText,
							headers: res.headers
						})
						return cleanedRes
						*/
						}

						// Cache cacheable blob responses in the background
						if (origRes.ok && isCacheableBlobRequest(reqUrl)) {
							cacheBlobResponse(reqUrl, origRes).catch((err) =>
								console.warn('[SW] Blob cache write error:', err)
							)
						}

						return origRes
					} catch (err) {
						log && console.log('[SW] FETCH ERROR', err)

						// Fallback to blob cache on network error
						const blobFallback = await fetchWithBlobCache(evt.request, reqUrl)
						if (blobFallback) {
							log && console.log('[SW] BLOB CACHE FALLBACK', reqUrl.pathname)
							return blobFallback
						}

						throw err
					}
				} else if (
					idTag &&
					reqUrl.hostname != 'cl-o.' + idTag &&
					reqUrl.pathname.startsWith('/api/')
				) {
					// Handle requests to other idTags (federated requests)
					log && console.log('[SW] FETCH API', evt.request.method, evt.request.url)

					// Check blob cache first for federated file requests
					const cachedFedBlob = await fetchWithBlobCache(evt.request, reqUrl)
					if (cachedFedBlob) return cachedFedBlob

					const targetTag = new URL(evt.request.url).hostname.replace('cl-o.', '')

					log &&
						console.log(
							'[SW] PROXY TOKEN: ' + idTag + '/api/auth/proxy-token -> ' + targetTag
						)
					try {
						const headers = new Headers(evt.request.headers)
						headers.set('Origin', location.origin)

						if (authToken) {
							//let token = proxyTokenCache[targetTag]
							let token = proxyTokenCache.get(targetTag)

							if (!token) {
								const proxyTokenRes = await fetch(
									'https://cl-o.' +
										idTag +
										`/api/auth/proxy-token?idTag=${targetTag}`,
									{
										credentials: 'include',
										headers: { Authorization: `Bearer ${authToken}` }
									}
								)
								token = (await proxyTokenRes.json())?.data?.token
								log && console.log('PROXY TOKEN miss', idTag, targetTag, token)
								// FIXME: expiration
								if (token) proxyTokenCache.set(targetTag, token)
							} else {
								log && console.log('PROXY TOKEN cached', idTag, targetTag, token)
							}

							if (token) headers.set('Authorization', `Bearer ${token}`)
							//const request = new Request(evt.request, { headers, credentials: 'include' })
						}

						const request = new Request(evt.request, { headers, mode: 'cors' })
						log &&
							console.log('[SW] request', request, {
								origin: headers.get('Origin'),
								authorization: headers.get('Authorization')
							})
						const res = await fetch(request)
						log && console.log('[SW] NOCACHE', res)

						// Cache cacheable federated blob responses
						if (res.ok && isCacheableBlobRequest(reqUrl)) {
							cacheBlobResponse(reqUrl, res).catch((err) =>
								console.warn('[SW] Federated blob cache write error:', err)
							)
						}

						return res
					} catch (err) {
						console.log('[SW] FETCH ERROR', err)

						// Fallback to blob cache on network error
						const fedBlobFallback = await fetchWithBlobCache(evt.request, reqUrl)
						if (fedBlobFallback) {
							log && console.log('[SW] FED BLOB CACHE FALLBACK', reqUrl.pathname)
							return fedBlobFallback
						}

						throw err
					}
				}

				// Log when falling through with missing idTag (helps debug auth issues)
				if (!idTag && reqUrl.pathname.startsWith('/api/')) {
					console.warn(
						'[SW] Falling through to direct fetch without idTag for:',
						evt.request.url
					)
				}
			}
			log && console.log('[SW] FETCH NO-API', evt.request.method, evt.request.url)

			// Only cache GET requests to our own origin
			if (evt.request.method !== 'GET' || reqUrl.origin !== self.location.origin) {
				return fetch(evt.request)
			}

			const strategy = getCacheStrategy(reqUrl.pathname)
			log && console.log('[SW] strategy', strategy, reqUrl.pathname)

			if (strategy === 'network-only') {
				return fetch(evt.request)
			}

			const cache = await caches.open(CACHE)

			if (strategy === 'cache-first') {
				const cached = await cache.match(evt.request)
				if (cached) {
					log && console.log('[SW] CACHE HIT', evt.request.url)
					return cached
				}
				try {
					const res = await fetch(new Request(evt.request.url))
					if (res.ok && shouldCache(res)) {
						await cache.put(evt.request, res.clone())
						log && console.log('[SW] CACHED', evt.request.url)
					}
					return res
				} catch {
					return new Response('Network error', { status: 408 })
				}
			}

			// network-first
			try {
				const res = await fetch(new Request(evt.request.url, { cache: 'no-cache' }))
				if (res.ok) {
					await cache.put(evt.request, res.clone())
					log && console.log('[SW] CACHED (nf)', evt.request.url)
				}
				return res
			} catch {
				const cached = await cache.match(evt.request)
				if (cached) {
					log && console.log('[SW] CACHE FALLBACK', evt.request.url)
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

function onPushSubscriptionChange(
	this: ServiceWorkerGlobalScope,
	evt: PushSubscriptionChangeEvent
) {
	console.log('Subscription expired')
	evt.waitUntil(
		self.registration.pushManager.subscribe({ userVisibleOnly: true }).then(function (
			subs: PushSubscription
		) {
			console.log('Subscribed after expiration', JSON.stringify(subs))
			return fetch('/api/notifications/subscription', {
				method: 'post',
				headers: {
					'Content-type': 'application/json'
				},
				body: JSON.stringify({
					oldSubscription: evt.oldSubscription,
					subscription: subs
				})
			})
		})
	)
}

function onPush(evt: PushEvent) {
	const data = evt.data?.json()
	const title = data.title
	const body = data.body
	evt.waitUntil(
		self.registration.showNotification(title, {
			body,
			icon: 'icon-192.png',
			image: data.image,
			data: {
				path: data.path
			},
			sound: 'default',
			vibrate: [200, 100, 100, 100, 200]
		} as ExtendedNotificationOptions)
	)
}

function onNotificationClick(evt: NotificationEvent) {
	console.log('notification click', evt)
	if (evt.notification?.close) evt.notification.close()
	evt.waitUntil(
		self.clients
			.matchAll({
				type: 'window'
			})
			.then(function (clientList: readonly WindowClient[]) {
				for (let i = 0; i < clientList.length; i++) {
					const client = clientList[i]
					//if (client.url == '/' && 'focus' in client) {
					if ('focus' in client) {
						console.log('CLIENT', client)
						client.navigate(evt.notification.data.path || '/')
						return client.focus()
					}
				}
				if (self.clients.openWindow)
					return self.clients.openWindow(evt.notification.data.path || '/')
			})
	)
}

// Handle messages from shell (e.g., token injection after SW registration)
async function onMessage(evt: MessageEvent) {
	const msg = evt.data
	if (!isValidSwMessage(msg)) return

	log && console.log('[SW] Received:', msg.type)

	switch (msg.type) {
		case 'sw:token.set':
			authToken = (msg.payload as { token: string }).token
			// Only persist to IndexedDB if an API key exists (= "stay logged in")
			if (await getItem('apiKey')) {
				await setSecureItem('authToken', authToken)
			}
			break

		case 'sw:token.clear':
			authToken = undefined
			proxyTokenCache.clear()
			await deleteSecureItem('authToken')
			await clearBlobCache()
			break

		case 'sw:apikey.set':
			await setSecureItem('apiKey', (msg.payload as { apiKey: string }).apiKey)
			// Persist current token now that we have an API key
			if (authToken) {
				await setSecureItem('authToken', authToken)
			}
			break

		case 'sw:apikey.get.req': {
			const apiKey = await getSecureItem('apiKey')
			if (evt.source && 'postMessage' in evt.source) {
				;(evt.source as unknown as Client).postMessage({
					cloudillo: true,
					v: PROTOCOL_VERSION,
					type: 'sw:apikey.get.res',
					replyTo: msg.id,
					ok: true,
					data: { apiKey: apiKey || undefined }
				})
			}
			break
		}

		case 'sw:apikey.del':
			await deleteSecureItem('apiKey')
			await deleteSecureItem('authToken') // Remove persisted token
			// Note: authToken remains in memory for current session
			break

		case 'sw:key.set':
			// Fallback for Firefox/Safari: receive key from main thread
			cachedKeyString = (msg.payload as { key: string }).key
			cryptoKey = null // Force re-import with new key
			log && console.log('[SW] Encryption key received via postMessage')
			break

		case 'sw:key.reset':
			// Clear encrypted data to allow fresh key generation
			await deleteItem('authToken')
			await deleteItem('apiKey')
			await clearBlobCache()
			keyErrorState = null // Clear error state
			cryptoKey = null // Clear cached key
			cachedKeyString = null // Clear cached key from postMessage
			log && console.log('[SW] Encrypted data cleared for key reset')
			// Send acknowledgment back to main thread
			if (evt.source && 'postMessage' in evt.source) {
				;(evt.source as unknown as Client).postMessage({
					cloudillo: true,
					v: PROTOCOL_VERSION,
					type: 'sw:key.reset.ack'
				})
			}
			break

		case 'sw:key.error.check':
			// Main thread is asking if there's a key error state
			if (keyErrorState && evt.source && 'postMessage' in evt.source) {
				;(evt.source as unknown as Client).postMessage({
					cloudillo: true,
					v: PROTOCOL_VERSION,
					type: 'sw:key.error',
					payload: { error: keyErrorState }
				})
				log && console.log('[SW] Key error state sent on check:', keyErrorState)
			}
			break

		case 'sw:claim':
			// Claim control of the page (used after hard reload)
			await self.clients.claim()
			log && console.log('[SW] Claimed clients')
			break
	}
}

self.addEventListener('install', onInstall as EventListener)
self.addEventListener('activate', onActivate as EventListener)
self.addEventListener('fetch', onFetch as EventListener)
self.addEventListener('message', onMessage as unknown as EventListener)
self.addEventListener('pushsubscriptionchange', onPushSubscriptionChange)
self.addEventListener('push', onPush)
self.addEventListener('notificationclick', onNotificationClick)

// vim: ts=4

const VERSION = process.env.CLOUDILLO_VERSION || 'unknown'
const CACHE = `cache-${VERSION}`
const log = 1

const PRECACHE_URLS: string[] = [
	//'index.html', './',
	//'icon-192.png'
]

//import { LRUCache } from 'lru-cache'
import LRU from 'quick-lru'

import { handleSwMessage, type SwStorageFunctions } from './message-bus/handlers.js'

/************************/
/* Encryption Key       */
/* Injected by server   */
/************************/
const ENCRYPTION_KEY = '__CLOUDILLO_SW_ENCRYPTION_KEY__'

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

/**************/
/* Encryption */
/**************/
let cryptoKey: CryptoKey | null = null
let encryptionAvailable = false

async function initCryptoKey(): Promise<CryptoKey | null> {
	if (cryptoKey) return cryptoKey
	// Check if key is the placeholder (not injected by server)
	// Base64 never starts with underscore, but our placeholder does
	if (ENCRYPTION_KEY.startsWith('_')) {
		// No encryption key - SW should not have been registered without one
		console.error('[SW] CRITICAL: No encryption key available - token storage disabled')
		encryptionAvailable = false
		return null
	}
	try {
		// Convert base64url to standard base64 (replace - with +, _ with /, add padding)
		const padding = '='.repeat((4 - (ENCRYPTION_KEY.length % 4)) % 4)
		const base64 = (ENCRYPTION_KEY + padding).replace(/-/g, '+').replace(/_/g, '/')
		const keyData = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
		cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, [
			'encrypt',
			'decrypt'
		])
		encryptionAvailable = true
		return cryptoKey
	} catch (err) {
		console.error('[SW] Failed to import encryption key:', err)
		encryptionAvailable = false
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

// Storage functions for message bus
const swStorage: SwStorageFunctions = {
	setSecureItem,
	getSecureItem,
	deleteSecureItem
}

/******************/
/* Service worker */
/******************/

//const proxyTokenCache: Record<string, string> = {}
const proxyTokenCache = new LRU<string, string>({ maxSize: 100, maxAge: 1000 * 50 /* 50 sec */ })

let idTag: string | undefined
let authToken: string | undefined

function onInstall(evt: any) {
	evt.waitUntil(
		(async function () {
			console.log(`[SW] INSTALL v${VERSION}, cache: ${CACHE}`)
			let cache = await caches.open(CACHE)
			await cache.addAll(PRECACHE_URLS)
			;(self as any).skipWaiting()
		})()
	)
}

function onActivate(evt: any) {
	evt.waitUntil(
		(async function () {
			console.log(`[SW] ACTIVATE v${VERSION}, cache: ${CACHE}`)
			const cacheList = (await caches.keys()).filter((name) => name !== CACHE)
			if (cacheList.length > 0) {
				console.log(`[SW] Deleting old caches:`, cacheList)
			}
			await Promise.all(cacheList.map((name) => caches.delete(name)))

			// Load persisted token on activation
			if (!authToken) {
				const persistedToken = await getSecureItem('authToken')
				if (persistedToken) {
					authToken = persistedToken
					log && console.log('[SW] Loaded persisted auth token')
				}
			}

			await (self as any).clients.claim()
		})()
	)
}

let fetchIdTagPromise: Promise<string> | undefined
async function fetchIdTag() {
	try {
		const res = await fetch('/.well-known/cloudillo/id-tag')
		return (await res.json()).idTag
	} catch (err) {
		console.error('[SW] failed to fetch idTag', err)
	}
}

function onFetch(evt: any) {
	const reqUrl = new URL(evt.request.url)

	// IMPORTANT: Allow .well-known/cloudillo/id-tag to bypass SW logic
	// to prevent deadlock when SW fetches its own idTag
	if (reqUrl.pathname === '/.well-known/cloudillo/id-tag') {
		evt.respondWith(fetch(evt.request))
		return
	}

	evt.respondWith(
		(async function () {
			if (!idTag) {
				log && console.log('[SW] fetching idTag')
				if (!fetchIdTagPromise) fetchIdTagPromise = fetchIdTag()
				idTag = await fetchIdTagPromise
				log && console.log('[SW] idTag:', idTag)
			}

			if (reqUrl.hostname == 'cl-o.' + idTag) {
				// Handle requests to our own idTag
				log && console.log('[SW] OWN FETCH', evt.request.method, reqUrl.pathname)
				try {
					let request = evt.request
					if (authToken && !evt.request.headers.get('Authorization')) {
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
							// Persist encrypted token
							await setSecureItem('authToken', authToken)
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
					return origRes
				} catch (err) {
					log && console.log('[SW] FETCH ERROR', err)
					throw err
				}
			} else if (
				reqUrl.hostname.startsWith('cl-o.') &&
				reqUrl.hostname != 'cl-o.' + idTag &&
				reqUrl.pathname.startsWith('/api/')
			) {
				// Handle requests to other idTags
				log && console.log('[SW] FETCH API', evt.request.method, evt.request.url)
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
					return res
				} catch (err) {
					console.log('[SW] FETCH ERROR', err)
					throw err
				}
			}

			log && console.log('[SW] FETCH NO-API', evt.request.method, evt.request.url)

			/*
		if (evt.request.method !== 'GET' || !evt.request.url.startsWith(self.location.origin)) {
			return
		}

		let res
		// Chromium bug workaround
		if (evt.request.cache === 'only-if-cached' && evt.request.mode !== 'same-origin') return
		*/

			// DISABLE CACHE:
			const res = await fetch(evt.request)
			log && console.log('[SW] NOCACHE', res)
			return res

			/*
		res = await caches.match(evt.request)
		if (res) {
			log && console.log('[SW] CACHE HIT', evt.request.url)
			return res
		}
		let cache = await caches.open(CACHE)
		try {
			log && console.log('[SW] GET', evt.request.url)
			res = await fetch(evt.request)
			log && console.log('[SW] RES', res.headers)
			if (!evt.request.url.match(/\/api\//)
				&& !evt.request.url.match(/\.js$/)
			) {
				await cache.put(evt.request, res.clone())
				log && console.log('[SW] CACHE', evt.request.url)
			} else {
				log && console.log('[SW] NO CACHE', evt.request.url)
			}
			return res
		} catch (err) {
			log && console.log('RES null')
			return null
		}
		*/
		})()
	)
}

function onPushSubscriptionChange(evt: any) {
	console.log('Subscription expired')
	evt.waitUntil(
		(self as any).registration.pushManager.subscribe({ userVisibleOnly: true }).then(function (
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

function onPush(evt: any) {
	const data = evt.data.json()
	const title = data.title
	const body = data.body
	evt.waitUntil(
		(self as any).registration.showNotification(title, {
			body,
			icon: 'icon-192.png',
			image: data.image,
			data: {
				path: data.path
			},
			sound: 'default',
			vibrate: [200, 100, 100, 100, 200]
		})
	)
}

function onNotificationClick(evt: any) {
	console.log('notification click', evt)
	if (evt.notification && evt.notification.close) evt.notification.close()
	evt.waitUntil(
		(self as any).clients
			.matchAll({
				type: 'window'
			})
			.then(function (clientList: any) {
				for (let i = 0; i < clientList.length; i++) {
					let client = clientList[i]
					//if (client.url == '/' && 'focus' in client) {
					if ('focus' in client) {
						console.log('CLIENT', client)
						client.navigate(evt.notification.data.path || '/')
						return client.focus()
					}
				}
				if ((self as any).clients.openWindow)
					return (self as any).clients.openWindow(evt.notification.data.path || '/')
			})
	)
}

// Handle messages from shell (e.g., token injection after SW registration)
async function onMessage(evt: MessageEvent) {
	// Try new message bus first
	const handled = await handleSwMessage(evt, swStorage, (token) => {
		authToken = token
		// Clear proxy token cache on logout
		if (token === undefined) {
			proxyTokenCache.clear()
		}
	})

	if (handled) return

	// Legacy fallback (for backward compatibility during transition)
	const msg = evt.data
	if (!msg?.cloudillo) return

	if (msg.type === 'setToken' && msg.token) {
		log && console.log('[SW] Received token via postMessage (legacy)')
		authToken = msg.token as string
		setSecureItem('authToken', authToken)
	}

	if (msg.type === 'setApiKey' && msg.apiKey) {
		log && console.log('[SW] Storing API key (legacy)')
		setSecureItem('apiKey', msg.apiKey)
	}

	if (msg.type === 'getApiKey') {
		log && console.log('[SW] Retrieving API key (legacy)')
		const apiKey = await getSecureItem('apiKey')
		;(evt.source as any)?.postMessage({
			cloudillo: true,
			type: 'apiKeyReply',
			id: msg.id,
			apiKey
		})
	}

	if (msg.type === 'deleteApiKey') {
		log && console.log('[SW] Deleting API key (legacy)')
		deleteSecureItem('apiKey')
	}

	if (msg.type === 'logout') {
		log && console.log('[SW] Clearing auth token (legacy)')
		authToken = undefined
		proxyTokenCache.clear()
		deleteSecureItem('authToken')
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

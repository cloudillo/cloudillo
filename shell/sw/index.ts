const CACHE = 'cache-25.02.04'
const log = 0

const PRECACHE_URLS: string[] = [
	//'index.html', './',
	//'icon-192.png'
]

//import { LRUCache } from 'lru-cache'
import LRU from 'quick-lru'

/***********/
/* Storage */
/***********/
const DB_NAME = 'db';
const STORE_NAME = 'secrets';

function initDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1)

		request.onupgradeneeded = evt => {
			const db = (evt.target as IDBOpenDBRequest).result
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME)
			}
		}

		request.onsuccess = evt => resolve((evt.target as IDBOpenDBRequest).result)
		request.onerror = evt => reject((evt.target as IDBOpenDBRequest).error)
	})
}

async function setItem(key: string, value: string) {
	const db = await initDB()
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readwrite')
		const store = transaction.objectStore(STORE_NAME)

		const request = store.put(value, key)

		request.onsuccess = () => resolve(true)
		request.onerror = evt => reject((evt.target as IDBRequest).error)
	})
}

async function getItem(key: string) {
	const db = await initDB()
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readonly')
		const store = transaction.objectStore(STORE_NAME)

		const request = store.get(key)

		request.onsuccess = evt => resolve((evt.target as IDBRequest).result)
		request.onerror = evt => reject((evt.target as IDBRequest).error)
	})
}

/******************/
/* Service worker */
/******************/

//const proxyTokenCache: Record<string, string> = {}
const proxyTokenCache = new LRU<string, string>({ maxSize: 100, maxAge: 1000 * 50 /* 50 sec */ })

let idTag: string | undefined
let authToken: string | undefined

function onInstall(evt: any) {
	evt.waitUntil(async function () {
		console.log('[SW] INSTALL')
		let cache = await caches.open(CACHE)
		await cache.addAll(PRECACHE_URLS)
		;(self as any).skipWaiting()
	}())
}

function onActivate(evt: any) {
	evt.waitUntil(async function () {
		let cacheList = (await caches.keys()).filter(name => name !== CACHE)
		await Promise.all(cacheList.map(name => caches.delete(name)))
		await (self as any).clients.claim()
	}())
}

let fetchIdTagPromise: Promise<string> | undefined
async function fetchIdTag() {
	const res = await fetch('/.well-known/cloudillo/id-tag')
	return (await res.json()).idTag
}

function onFetch(evt: any) {
	const reqUrl = new URL(evt.request.url)

	evt.respondWith(async function () {
		if (!idTag) {
			log && console.log('[SW] fetching idTag')
			if (!fetchIdTagPromise) fetchIdTagPromise = fetchIdTag()
			idTag = await fetchIdTagPromise
			log && console.log('[SW] idTag:', idTag)
		}
		if (!authToken) {
			//authToken = await getItem('authToken')
			log && console.log('[SW] authToken:', authToken)
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
					request = new Request(evt.request, { headers: headers, mode: request.mode })
				}

				const origRes = fetch(request)

				if (['/api/auth/login-token'].includes(reqUrl.pathname)) {
					// Extract token from response
					const res = (await origRes).clone()
					log && console.log('[SW] OWN RES', res.status)
					const j = await res.json()
					log && console.log('[SW] OWN RES BODY', j)
					if (j.token) {
						log && console.log('[SW] OWN RES TOKEN', j.token)
						authToken = j.token
						//await setItem('authToken', j.token)
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
			}
		} else if (reqUrl.hostname.startsWith('cl-o.')
			&& reqUrl.hostname != 'cl-o.' + idTag
			&& reqUrl.pathname.startsWith('/api/')
		) {
			// Handle requests to other idTags
			log && console.log('[SW] FETCH API', evt.request.method, evt.request.url)
			const targetTag = new URL(evt.request.url).hostname.replace('cl-o.', '')

			log && console.log('[SW] PROXY TOKEN: ' + idTag + '/api/auth/proxy-token -> ' + targetTag)
			try {
				//let token = proxyTokenCache[targetTag]
				let token = proxyTokenCache.get(targetTag)

				if (!token) {
					const proxyTokenRes = await fetch('https://cl-o.' + idTag + `/api/auth/proxy-token?idTag=${targetTag}`, { credentials: 'include' })
					token = (await proxyTokenRes.json()).token
					log && console.log('PROXY TOKEN miss', idTag, targetTag, token)
					// FIXME: expiration
					if (token) proxyTokenCache.set(targetTag, token)
				} else {
					log && console.log('PROXY TOKEN cached', idTag, targetTag, token)
				}

				const headers = new Headers(evt.request.headers)
				if (token) headers.set('Authorization', `Bearer ${token}`)
				headers.set('Origin', location.origin)
				//const request = new Request(evt.request, { headers, credentials: 'include' })
				const request = new Request(evt.request, { headers, mode: 'cors' })
				log && console.log('[SW] request', request, {
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
	}())
}

function onPushSubscriptionChange(evt: any) {
	console.log('Subscription expired')
	evt.waitUntil(
		(self as any).registration.pushManager.subscribe({userVisibleOnly: true})
			.then(function (subs: PushSubscription) {
				console.log('Subscribed after expiration', JSON.stringify(subs))
				return fetch('/api/notification/subscription', {
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
	evt.waitUntil((self as any).clients.matchAll({
		type: 'window'
	}).then(function (clientList: any) {
		for (let i = 0; i < clientList.length; i++) {
			let client = clientList[i]
			//if (client.url == '/' && 'focus' in client) {
			if ('focus' in client) {
				console.log('CLIENT', client)
				client.navigate(evt.notification.data.path || '/')
				return client.focus()
			}
		}
		if ((self as any).clients.openWindow) return (self as any).clients.openWindow(evt.notification.data.path || '/')
	}))
}

self.addEventListener('install', onInstall as EventListener)
self.addEventListener('activate', onActivate as EventListener)
self.addEventListener('fetch', onFetch as EventListener)
self.addEventListener('pushsubscriptionchange', onPushSubscriptionChange)
self.addEventListener('push', onPush)
self.addEventListener('notificationclick', onNotificationClick)

// vim: ts=4

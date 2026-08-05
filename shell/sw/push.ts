// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Web-push subscription refresh, notification display and click routing. */

import { debug } from './debug.js'
import { ensureIdTag } from './id-tag.js'
import { getAuthToken } from './state.js'
import { requestTokenOnce, waitForToken } from './token-replay.js'

// NotificationOptions.image/sound not in TS lib types
interface ExtendedNotificationOptions extends NotificationOptions {
	image?: string
	sound?: string
}

declare const self: ServiceWorkerGlobalScope

export function onPushSubscriptionChange(
	this: ServiceWorkerGlobalScope,
	evt: PushSubscriptionChangeEvent
) {
	debug('Push subscription expired')
	evt.waitUntil(
		(async function () {
			// The tenant, not the page origin: every API call goes to
			// `cl-o.<idTag>`, and a request the worker issues itself does not pass
			// through its own fetch handler — so nothing would inject the bearer
			// and nothing would redirect a same-origin relative URL.
			const idTag = await ensureIdTag()
			if (!idTag) {
				debug('Push re-subscription skipped: no idTag')
				return
			}

			// Chrome refuses a re-subscribe without the key the previous
			// subscription was created with.
			const applicationServerKey = evt.oldSubscription?.options?.applicationServerKey
			const subs = await self.registration.pushManager.subscribe(
				applicationServerKey
					? { userVisibleOnly: true, applicationServerKey }
					: { userVisibleOnly: true }
			)
			debug('Re-subscribed to push after expiration')

			// A push wakes a worker that has usually just restarted, so its
			// in-memory token is gone — the post would go out with no bearer,
			// 401, and push would quietly stop working. Ask the page for it,
			// exactly as download.ts does. Bounded, and we proceed either way:
			// during a push there may genuinely be no window client left to answer.
			if (!getAuthToken()) {
				void requestTokenOnce()
				await waitForToken(1500)
			}

			const headers = new Headers({ 'Content-type': 'application/json' })
			const token = getAuthToken()
			if (token) headers.set('Authorization', `Bearer ${token}`)

			const res = await fetch(`https://cl-o.${idTag}/api/notifications/subscription`, {
				method: 'post',
				headers,
				body: JSON.stringify({
					oldSubscription: evt.oldSubscription,
					subscription: subs
				})
			})
			// LOGGING RULE: the status only, never the body. A failure is a
			// `console.warn`, not a `debug` — `debug` compiles out of production
			// builds, so push would break permanently with no trace of why.
			if (res.ok) debug('Push re-subscription posted:', res.status)
			else console.warn('[SW] Push re-subscription POST failed:', res.status)
		})()
	)
}

export function onPush(evt: PushEvent) {
	// A payload-less or non-JSON push is still delivered, and the subscription is
	// userVisibleOnly — so degrade to a generic notification rather than throwing
	// and letting the browser substitute its own.
	let data: { title?: string; body?: string; image?: string; path?: string } | undefined
	try {
		data = evt.data?.json()
	} catch {
		debug('push payload was not JSON')
	}
	evt.waitUntil(
		self.registration.showNotification(data?.title || 'Cloudillo', {
			body: data?.body,
			icon: 'icon-192.png',
			image: data?.image,
			data: { path: data?.path },
			sound: 'default',
			vibrate: [200, 100, 100, 100, 200]
		} as ExtendedNotificationOptions)
	)
}

export function onNotificationClick(evt: NotificationEvent) {
	debug('notification click')
	if (evt.notification?.close) evt.notification.close()
	evt.waitUntil(
		self.clients
			.matchAll({
				type: 'window'
			})
			.then(function (clientList: readonly WindowClient[]) {
				for (let i = 0; i < clientList.length; i++) {
					const client = clientList[i]
					if ('focus' in client) {
						debug('focusing client', client.id)
						client.navigate(evt.notification.data?.path || '/')
						return client.focus()
					}
				}
				if (self.clients.openWindow)
					return self.clients.openWindow(evt.notification.data?.path || '/')
			})
	)
}
// vim: ts=4

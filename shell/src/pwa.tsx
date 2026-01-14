// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import React from 'react'

//////////////
// PWA hook //
//////////////

function convertKey(base64Key: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - (base64Key.length % 4)) % 4)
	const base64 = (base64Key + padding).replace(/-/g, '+').replace(/_/g, '/')
	const str = window.atob(base64)
	let ret = new Uint8Array(str.length)
	for (let i = 0; i < str.length; ++i) {
		ret[i] = str.charCodeAt(i)
	}
	return ret
}

//////////////////////////////
// Encryption Key (Cookie)  //
//////////////////////////////
const KEY_COOKIE_NAME = 'swKey'

// Generate a random 256-bit key, return as base64url
function generateKey(): string {
	const keyBytes = crypto.getRandomValues(new Uint8Array(32))
	return btoa(String.fromCharCode(...keyBytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')
}

// Get or create key from cookie (for fallback browsers without Cookie Store API)
function getOrCreateKeyFromCookie(): string {
	// Try to read existing
	const existing = document.cookie
		.split('; ')
		.find((row) => row.startsWith(`${KEY_COOKIE_NAME}=`))
		?.split('=')[1]

	if (existing) return existing

	// Generate new key
	const newKey = generateKey()
	document.cookie = `${KEY_COOKIE_NAME}=${newKey}; Secure; SameSite=Strict; Path=/; Max-Age=2147483647`
	console.log('[PWA] Generated new encryption key')
	return newKey
}

/**
 * Ensure SW has encryption key (for browsers without Cookie Store API)
 * Chrome/Edge: SW reads cookie directly via Cookie Store API
 * Firefox/Safari: Main thread generates/reads key and relays to SW
 */
export async function ensureEncryptionKey(): Promise<void> {
	if (!('serviceWorker' in navigator)) return

	// Chrome/Edge: SW handles everything via Cookie Store API
	if ('cookieStore' in window) return

	// Firefox/Safari: Generate key in main thread, relay to SW
	const key = getOrCreateKeyFromCookie()

	await navigator.serviceWorker.ready
	navigator.serviceWorker.controller?.postMessage({
		cloudillo: true,
		v: 1,
		type: 'sw:key.set',
		payload: { key }
	})
	console.log('[PWA] Encryption key relayed to service worker')
}

/**
 * Migrate encryption key from old URL-based storage to cookie-based storage
 * This handles the transition for existing users who have SW registered with key in URL
 */
async function migrateKeyFromUrl(): Promise<void> {
	const existingReg = await navigator.serviceWorker.getRegistration()
	if (!existingReg?.active) return

	const url = existingReg.active.scriptURL
	const keyMatch = url.match(/[?&]key=([^&]+)/)

	if (keyMatch) {
		const oldKey = keyMatch[1]
		console.log('[PWA] Migrating key from URL to cookie')

		// Store key in cookie (same format, no conversion needed)
		document.cookie = `${KEY_COOKIE_NAME}=${oldKey}; Secure; SameSite=Strict; Path=/; Max-Age=2147483647`

		// Unregister old SW so new one can take over
		await existingReg.unregister()
		console.log('[PWA] Old SW unregistered, key migrated to cookie')
	}
}

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>
	readonly userChoice: Promise<{
		outcome: 'accepted' | 'dismissed'
		platform: string
	}>
}

interface PWAConfig {
	swPath?: string
	vapidPublicKey?: string
}

export interface UsePWA {
	doInstall?: () => void
	askNotify?: (vapidPublicKey: string) => Promise<PushSubscription | undefined>
	doNotify?: (title: string, body: string, data: object) => void
}

interface PWAState {
	notify?: boolean
	install?: BeforeInstallPromptEvent
}

let serviceWorker: ServiceWorkerRegistration
let swConfig: PWAConfig = {}

/**
 * Register the service worker
 * Can be called early on page load - encryption key is managed via cookie
 *
 * @param authToken - Optional auth token to send to SW after registration
 */
export async function registerServiceWorker(authToken?: string): Promise<void> {
	if (!('serviceWorker' in navigator)) return

	// Migrate key from URL to cookie if this is an old SW
	await migrateKeyFromUrl()

	const swPath = swConfig.swPath || '/sw.js'

	try {
		const existingReg = await navigator.serviceWorker.getRegistration()

		// Check if SW already registered
		if (existingReg?.active) {
			serviceWorker = existingReg
			if (authToken) {
				existingReg.active.postMessage({
					cloudillo: true,
					v: 1,
					type: 'sw:token.set',
					payload: { token: authToken }
				})
				console.log('[PWA] Token updated in existing service worker')
			}

			// On hard reload (Ctrl+Shift+R), SW is active but not controlling.
			// Request SW to claim this page so it can intercept API requests.
			if (!navigator.serviceWorker.controller) {
				console.log('[PWA] Waiting for SW to become controller...')
				await new Promise<void>((resolve) => {
					// Set up listener for controller change
					const onControllerChange = () => {
						navigator.serviceWorker.removeEventListener(
							'controllerchange',
							onControllerChange
						)
						console.log('[PWA] SW is now controlling the page')
						resolve()
					}
					navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

					// Request SW to claim control
					existingReg.active!.postMessage({
						cloudillo: true,
						v: 1,
						type: 'sw:claim'
					})

					// Also check if controller became available (race condition)
					if (navigator.serviceWorker.controller) {
						navigator.serviceWorker.removeEventListener(
							'controllerchange',
							onControllerChange
						)
						console.log('[PWA] SW is now controlling the page')
						resolve()
					}
				})
			}

			return
		}

		console.log('[PWA] Registering service worker')
		const reg = await navigator.serviceWorker.register(swPath)
		serviceWorker = reg
		console.log('[PWA] Service worker registered')

		// Wait for SW to be active, then send the token
		if (authToken) {
			let activeWorker = reg.active
			if (!activeWorker) {
				const installingWorker = reg.installing || reg.waiting
				if (installingWorker) {
					await new Promise<void>((resolve) => {
						installingWorker.addEventListener('statechange', function handler() {
							if (installingWorker.state === 'activated') {
								activeWorker = installingWorker
								installingWorker.removeEventListener('statechange', handler)
								resolve()
							}
						})
						if (installingWorker.state === 'activated') {
							activeWorker = installingWorker
							resolve()
						}
					})
				}
			}

			if (activeWorker) {
				activeWorker.postMessage({
					cloudillo: true,
					v: 1,
					type: 'sw:token.set',
					payload: { token: authToken }
				})
				console.log('[PWA] Token sent to service worker')
			} else {
				console.warn('[PWA] No active service worker to send token to')
			}
		}
	} catch (err) {
		console.error('[PWA] SW registration failed:', err)
	}
}

//////////////////////////
// API Key SW Storage   //
//////////////////////////

let apiKeyRequestId = 0
const apiKeyPendingRequests = new Map<number, (apiKey: string | undefined) => void>()

// Listen for API key replies from SW
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
	navigator.serviceWorker.addEventListener('message', (evt) => {
		const msg = evt.data
		if (!msg?.cloudillo || msg.type !== 'sw:apikey.get.res') return

		const resolve = apiKeyPendingRequests.get(msg.replyTo)
		if (resolve) {
			apiKeyPendingRequests.delete(msg.replyTo)
			resolve(msg.data?.apiKey)
		}
	})
}

/**
 * Store API key in SW encrypted storage
 */
export async function setApiKey(apiKey: string): Promise<void> {
	if (!('serviceWorker' in navigator)) return

	await navigator.serviceWorker.ready
	navigator.serviceWorker.controller?.postMessage({
		cloudillo: true,
		v: 1,
		type: 'sw:apikey.set',
		payload: { apiKey }
	})
	console.log('[PWA] API key sent to service worker for storage')
}

/**
 * Retrieve API key from SW encrypted storage
 * Returns undefined if no SW, no controller, or no stored key
 */
export async function getApiKey(): Promise<string | undefined> {
	if (!('serviceWorker' in navigator)) return undefined

	const reg = await navigator.serviceWorker.getRegistration()
	if (!reg?.active) return undefined

	await navigator.serviceWorker.ready
	const controller = navigator.serviceWorker.controller
	if (!controller) return undefined

	const id = ++apiKeyRequestId
	return new Promise((resolve) => {
		// Timeout after 3 seconds
		const timeout = setTimeout(() => {
			apiKeyPendingRequests.delete(id)
			console.warn('[PWA] API key request timed out')
			resolve(undefined)
		}, 3000)

		apiKeyPendingRequests.set(id, (apiKey) => {
			clearTimeout(timeout)
			resolve(apiKey)
		})

		controller.postMessage({
			cloudillo: true,
			v: 1,
			type: 'sw:apikey.get.req',
			id
		})
	})
}

/**
 * Delete API key from SW encrypted storage
 */
export async function deleteApiKey(): Promise<void> {
	if (!('serviceWorker' in navigator)) return

	await navigator.serviceWorker.ready
	navigator.serviceWorker.controller?.postMessage({
		cloudillo: true,
		v: 1,
		type: 'sw:apikey.del'
	})
	console.log('[PWA] API key deletion requested')
}

/**
 * Clear auth token from SW (used on logout)
 */
export async function clearAuthToken(): Promise<void> {
	if (!('serviceWorker' in navigator)) return

	await navigator.serviceWorker.ready
	navigator.serviceWorker.controller?.postMessage({
		cloudillo: true,
		v: 1,
		type: 'sw:token.clear'
	})
	console.log('[PWA] Auth token cleared')
}

export default function usePWA(config: PWAConfig = {}): UsePWA {
	swConfig = config
	const [notify, setNotify] = React.useState(false)
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
				let sub = await serviceWorker.pushManager.getSubscription()
				if (sub) {
					console.log('Subscription object: ', JSON.stringify(sub))
					return sub
				} else {
					// Not subscribed yet
					try {
						sub = await serviceWorker.pushManager.subscribe({
							userVisibleOnly: true,
							applicationServerKey: convertKey(vapidPublicKey)
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
		// Register SW early and ensure encryption key is available
		registerServiceWorker().then(() => ensureEncryptionKey())

		// Install Prompt handler
		window.addEventListener(
			'beforeinstallprompt' as keyof WindowEventMap,
			handleBeforeInstallPrompt as any
		)
		return function onUnmount() {
			window.removeEventListener(
				'beforeinstallprompt' as keyof WindowEventMap,
				handleBeforeInstallPrompt as any
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

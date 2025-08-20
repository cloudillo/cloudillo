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
	const padding = '='.repeat((4 - base64Key.length % 4) % 4)
	const base64 = (base64Key + padding).replace(/-/g, '+').replace(/_/g, '/')
	const str = window.atob(base64)
	let ret = new Uint8Array(str.length)
	for (let i = 0; i < str.length; ++i) {
		ret[i] = str.charCodeAt(i)
	}
	return ret
}

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>
	readonly userChoice: Promise<{
		outcome: 'accepted' | 'dismissed',
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

export default function usePWA(config: PWAConfig = {}): UsePWA {
	const [notify, setNotify] = React.useState(false)
	const [installEvt, setInstallEvt] = React.useState<BeforeInstallPromptEvent | undefined>()

	const askNotify = React.useCallback(async function askNotify(vapidPublicKey: string): Promise<PushSubscription | undefined> {
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
					} catch(err) {
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
		if ('serviceWorker' in navigator) {
			(async function () {
				let sw = config.swPath || '/sw.js'
				const reg = await navigator.serviceWorker.register(sw)
				serviceWorker = reg
				//console.log('Service worker installed')

				// Install Prompt
				//console.log('Registering beforeinstallprompt handler')
				window.addEventListener('beforeinstallprompt' as keyof WindowEventMap, handleBeforeInstallPrompt as any)
			})()
			return function onUnmount() {
				//window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
			}
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
		askNotify: 'Notification' in window && Notification.permission != 'denied' ? askNotify : undefined,
		doNotify
	}
}

// vim: ts=4

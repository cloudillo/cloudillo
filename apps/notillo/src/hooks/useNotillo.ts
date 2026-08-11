// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getAppBus, getDocWsUrl } from '@cloudillo/core'
import { RtdbClient, type RtdbPresence, buildPresenceUser } from '@cloudillo/rtdb'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

const APP_NAME = 'notillo'

export function useNotillo() {
	const { i18n } = useTranslation()
	const location = useLocation()
	const [client, setClient] = useState<RtdbClient | undefined>()
	const [presence, setPresence] = useState<RtdbPresence | undefined>()
	const [connected, setConnected] = useState(false)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<Error | undefined>()
	const [fileId, setFileId] = useState('')
	const [ownerTag, setOwnerTag] = useState<string | undefined>()
	const [idTag, setIdTag] = useState<string | undefined>()
	const [access, setAccess] = useState<'read' | 'comment' | 'write'>('write')
	const [darkMode, setDarkMode] = useState(false)
	const [token, setToken] = useState<string | undefined>()
	const [navParam, setNavParam] = useState<string | undefined>()

	// Parse document ID from URL hash (#tenant:path)
	useEffect(() => {
		const resId = location.hash.slice(1)
		const [owner, path] = resId.split(':')
		setOwnerTag(owner || undefined)
		setFileId(path || '')
	}, [location.hash])

	// Initialize cloudillo and RTDB client
	useEffect(() => {
		if (!fileId) return
		let rtdbClient: RtdbClient | undefined
		let presenceFeed: RtdbPresence | undefined
		let unmounted = false
		let unsubscribeTheme: (() => void) | undefined
		let unsubscribeIdentity: (() => void) | undefined

		;(async () => {
			try {
				setLoading(true)
				setError(undefined)

				const bus = getAppBus()
				const state = await bus.init(APP_NAME)
				// Before anything that outlives this effect: the cleanup already
				// ran with `unsubscribeTheme` still undefined if we were torn down
				// while init was pending, so subscribing past this point would leak
				// the listener for the lifetime of the page.
				if (unmounted) return

				setIdTag(bus.idTag)
				setAccess(bus.access)
				setDarkMode(bus.darkMode)
				// BlockNote takes the theme as a prop, so the editor content would
				// stay in the old theme while the chrome flips.
				unsubscribeTheme = bus.onThemeChange(setDarkMode)
				setToken(state.accessToken)
				setNavParam(bus.parsedParams.get('nav') ?? undefined)
				if (state.language) i18n.changeLanguage(state.language)

				// Documents live on their owner's instance; an ownerless document is our own.
				const serverUrl = getDocWsUrl(ownerTag, bus.idTag)
				if (!serverUrl) throw new Error('No identity available for RTDB connection')

				rtdbClient = new RtdbClient({
					dbId: fileId,
					auth: {
						getToken: () => bus.accessToken,
						// On a 4401 `getToken` above is already stale — must renew.
						refreshToken: () => bus.refreshToken()
					},
					serverUrl,
					options: {
						enableCache: true,
						reconnect: true,
						reconnectDelay: 1000,
						maxReconnectDelay: 30000,
						debug: false,
						// Opt in to the presence channel. The flag rides in the socket
						// URL, so it cannot be turned on later — without it every
						// publish is a no-op.
						presence: true
					}
				})

				await rtdbClient.connect()

				if (unmounted) {
					await rtdbClient.disconnect()
					return
				}

				// Only the display name goes on the wire: the server stamps
				// `user.idTag` from the socket's own token, and the colour and picture
				// are derived from that tag by whoever is LOOKING. The page and block
				// a peer is on ride in the same free-form state (`usePresencePublisher`)
				// — the channel knows nothing about RTDB paths.
				presenceFeed = rtdbClient.presence({ user: buildPresenceUser(bus) })
				// A corrective `auth:init.push` can land after `bus.init()` resolves on
				// a share-link mount, which would leave a stale name in every peer's
				// roster.
				unsubscribeIdentity = bus.onIdentityChange(() =>
					presenceFeed?.setUser(buildPresenceUser(bus))
				)

				setClient(rtdbClient)
				setPresence(presenceFeed)
				setConnected(true)
				setLoading(false)

				// Notify shell that we're ready (triggers pending import delivery)
				bus.notifyReady('synced')
			} catch (err) {
				console.error('[Notillo] Initialization error:', err)
				if (!unmounted) {
					setError(err as Error)
					setLoading(false)
				}
			}
		})()

		return () => {
			unmounted = true
			unsubscribeTheme?.()
			unsubscribeIdentity?.()
			// Clears our roster entry at once, so peers do not wait for the socket to
			// die for the avatar to go. `disconnect()` would close it too.
			presenceFeed?.close()
			if (rtdbClient) {
				rtdbClient.disconnect().catch(console.error)
			}
		}
	}, [fileId, ownerTag])

	return {
		client,
		presence,
		fileId,
		ownerTag,
		idTag,
		access,
		connected,
		error,
		loading,
		darkMode,
		token,
		navParam
	}
}

// vim: ts=4

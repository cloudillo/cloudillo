// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * RTDB app bootstrap hook, shared by taskillo, notillo and scanillo: parse the
 * document id from the URL hash → `bus.init(appName)` → resolve the owner's
 * WebSocket URL → create and connect an `RtdbClient` → (optionally) join the
 * presence roster. App-specific extras (theme subscription, i18n, `notifyReady`,
 * extra state) plug in via `onInit`.
 */

import { type AppMessageBus, type AppState, getAppBus, getDocWsUrl } from '@cloudillo/core'
import { buildPresenceUser, RtdbClient, type RtdbPresence } from '@cloudillo/rtdb'
import * as React from 'react'

export interface UseRtdbDocumentOptions {
	/** Opt in to the presence channel (goes in the socket URL — cannot be turned on later). */
	presence?: boolean
	/**
	 * Runs immediately after `bus.init()`, before the RTDB client is built or
	 * connected. Theme, language and token come from the bus, not the socket —
	 * they must not wait on it, or a slow or failed connect renders the app in
	 * the wrong theme with no token. Return a cleanup to run on teardown.
	 */
	onBusInit?: (bus: AppMessageBus, state: AppState) => (() => void) | undefined
	/**
	 * Runs after `bus.init()` and the RTDB connect, before the result is
	 * committed. Return a cleanup to run on teardown (bus listener
	 * unsubscriptions, …).
	 */
	onInit?: (
		bus: AppMessageBus,
		state: AppState,
		presenceFeed: RtdbPresence | undefined
	) => (() => void) | undefined
}

export interface RtdbDocumentResult {
	client: RtdbClient | undefined
	presence: RtdbPresence | undefined
	fileId: string
	ownerTag: string | undefined
	idTag: string | undefined
	access: 'read' | 'comment' | 'write' | undefined
	connected: boolean
	loading: boolean
	error: Error | undefined
}

export function useRtdbDocument(
	appName: string,
	opts?: UseRtdbDocumentOptions
): RtdbDocumentResult {
	const { presence = false, onInit, onBusInit } = opts ?? {}
	const onInitRef = React.useRef(onInit)
	onInitRef.current = onInit
	const onBusInitRef = React.useRef(onBusInit)
	onBusInitRef.current = onBusInit
	const [client, setClient] = React.useState<RtdbClient | undefined>()
	const [presenceFeed, setPresenceFeed] = React.useState<RtdbPresence | undefined>()
	const [connected, setConnected] = React.useState(false)
	const [loading, setLoading] = React.useState(true)
	const [error, setError] = React.useState<Error | undefined>()
	const [fileId, setFileId] = React.useState('')
	const [ownerTag, setOwnerTag] = React.useState<string | undefined>()
	const [idTag, setIdTag] = React.useState<string | undefined>()
	const [access, setAccess] = React.useState<'read' | 'comment' | 'write' | undefined>()

	// Parse document ID from URL hash (#tenant:path → fileId)
	React.useEffect(() => {
		function readHash() {
			const [owner, path] = window.location.hash.slice(1).split(':')
			setOwnerTag(owner || undefined)
			setFileId(path || '')
		}
		readHash()
		window.addEventListener('hashchange', readHash)
		return () => window.removeEventListener('hashchange', readHash)
	}, [])

	// Initialize cloudillo and the RTDB client
	React.useEffect(() => {
		if (!fileId) return
		let rtdbClient: RtdbClient | undefined
		let feed: RtdbPresence | undefined
		let initCleanup: (() => void) | undefined
		let busInitCleanup: (() => void) | undefined
		let unmounted = false

		void (async () => {
			try {
				setLoading(true)
				setError(undefined)

				const bus = getAppBus()
				const state = await bus.init(appName)
				if (unmounted) return

				setIdTag(bus.idTag)
				setAccess(bus.access)

				const busResult = onBusInitRef.current?.(bus, state)
				busInitCleanup = typeof busResult === 'function' ? busResult : undefined

				// Documents live on their owner's instance; an ownerless one is our own.
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
						presence
					}
				})

				await rtdbClient.connect()

				if (unmounted) {
					await rtdbClient.disconnect()
					return
				}

				// Only the display name goes on the wire: the server stamps
				// `user.idTag` from the socket's own token, and the colour and
				// picture are derived from that tag by whoever is LOOKING.
				if (presence) {
					feed = rtdbClient.presence({ user: buildPresenceUser(bus) })
				}

				const result = onInitRef.current?.(bus, state, feed)
				initCleanup = typeof result === 'function' ? result : undefined

				setClient(rtdbClient)
				setPresenceFeed(feed)
				setConnected(true)
				setLoading(false)
			} catch (err) {
				console.error(`[${appName}] Initialization error:`, err)
				if (!unmounted) {
					setError(err as Error)
					setLoading(false)
				}
			}
		})()

		return () => {
			unmounted = true
			initCleanup?.()
			busInitCleanup?.()
			// Clears our roster entry at once, so peers do not wait for the socket
			// to die for the avatar to go. `disconnect()` would close it too.
			feed?.close()
			if (rtdbClient) {
				rtdbClient.disconnect().catch(console.error)
			}
			setConnected(false)
			setClient(undefined)
			setPresenceFeed(undefined)
		}
	}, [fileId, ownerTag, presence, appName])

	return {
		client,
		presence: presenceFeed,
		fileId,
		ownerTag,
		idTag,
		access,
		connected,
		loading,
		error
	}
}

// vim: ts=4

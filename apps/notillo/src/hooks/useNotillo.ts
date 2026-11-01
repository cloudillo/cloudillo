// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { getAppBus } from '@cloudillo/core'
import { useRtdbDocument } from '@cloudillo/react'
import { buildPresenceUser } from '@cloudillo/rtdb'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function useNotillo() {
	const { i18n } = useTranslation()
	const [darkMode, setDarkMode] = useState(false)
	const [token, setToken] = useState<string | undefined>()
	const [navParam, setNavParam] = useState<string | undefined>()

	const base = useRtdbDocument('notillo', {
		presence: true,
		// Theme, language and token come from the bus — they must not wait on
		// the socket, or a slow connect renders the app in the wrong theme.
		onBusInit: (bus, state) => {
			setDarkMode(bus.darkMode)
			setToken(state.accessToken)
			setNavParam(bus.parsedParams.get('nav') ?? undefined)
			if (state.language) i18n.changeLanguage(state.language)

			// BlockNote takes the theme as a prop, so the editor content would
			// stay in the old theme while the chrome flips.
			return bus.onThemeChange(setDarkMode)
		},
		onInit: (bus, _state, feed) => {
			// A corrective `auth:init.push` can land after `bus.init()` resolves on
			// a share-link mount, which would leave a stale name in every peer's
			// roster.
			const unsubIdentity = bus.onIdentityChange(() => feed?.setUser(buildPresenceUser(bus)))

			// Notify shell that we're ready (triggers pending import delivery)
			bus.notifyReady('synced')

			return unsubIdentity
		}
	})

	// Writes only queue while the socket is down, so the document is dirty when
	// disconnected with writes pending. The shell shows `*` and guards unload.
	// 1000 ms poll of `pendingWrites()` while disconnected (the client
	// has no pending-change event); switch to one if the RTDB client grows it.
	const { client, connected } = base
	useEffect(() => {
		if (!client || connected) return
		let dirty = false
		const check = () => {
			const next = client.pendingWrites() > 0
			if (next === dirty) return
			dirty = next
			getAppBus().setTitle(undefined, { dirty })
		}
		check()
		const timer = setInterval(check, 1000)
		return () => {
			clearInterval(timer)
			// Reconnected (the queue has flushed) or torn down: clear the marker.
			if (dirty) getAppBus().setTitle(undefined, { dirty: false })
		}
	}, [client, connected])

	return {
		...base,
		darkMode,
		token,
		navParam
	}
}

// vim: ts=4

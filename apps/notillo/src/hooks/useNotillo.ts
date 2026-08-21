// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useRtdbDocument } from '@cloudillo/react'
import { buildPresenceUser } from '@cloudillo/rtdb'
import { useState } from 'react'
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

	return {
		...base,
		darkMode,
		token,
		navParam
	}
}

// vim: ts=4

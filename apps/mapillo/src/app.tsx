// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilard Hajba
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

import * as React from 'react'

import { getAppBus, type AppMessageBus } from '@cloudillo/core'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import './style.css'

import { MapView } from './map.js'
import type { MapilloSettings } from './types.js'
import { DEFAULT_SETTINGS } from './types.js'

const APP_NAME = 'mapillo'

/** Server setting keys (without the app.mapillo. prefix) */
const SETTING_KEYS: Record<keyof MapilloSettings, string> = {
	activeTileLayerId: 'tile_layer',
	nominatimConsent: 'nominatim_consent',
	overpassConsent: 'overpass_consent',
	overpassServer: 'overpass_server'
}

/** Load settings from server via message bus */
async function loadSettings(bus: AppMessageBus): Promise<Partial<MapilloSettings>> {
	try {
		const items = await bus.settings.list()
		const partial: Partial<MapilloSettings> = {}
		for (const item of items) {
			for (const [prop, serverKey] of Object.entries(SETTING_KEYS)) {
				if (item.key === `app.${APP_NAME}.${serverKey}`) {
					;(partial as Record<string, unknown>)[prop] = item.value
				}
			}
		}
		return partial
	} catch (err) {
		console.warn('[Mapillo] Failed to load settings:', err)
		return {}
	}
}

export function MapilloApp() {
	const [darkMode, setDarkMode] = React.useState(false)
	const [ready, setReady] = React.useState(false)
	const [settings, setSettings] = React.useState<MapilloSettings>(DEFAULT_SETTINGS)
	const busRef = React.useRef<AppMessageBus | null>(null)

	React.useEffect(() => {
		;(async () => {
			try {
				const bus = getAppBus()
				busRef.current = bus
				const state = await bus.init(APP_NAME)
				setDarkMode(state.darkMode ?? false)

				// Load settings from server (shell proxies via its own API client,
				// so this works even without an app-level access token)
				const saved = await loadSettings(bus)
				setSettings((s) => ({ ...s, ...saved }))

				setReady(true)
			} catch (err) {
				console.error('[Mapillo] Bus init failed, running standalone:', err)
				// Fallback: detect system dark mode
				setDarkMode(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
				setReady(true)
			}
		})()
	}, [])

	React.useEffect(() => {
		if (darkMode) {
			document.body.classList.add('dark')
			document.body.classList.remove('light')
		} else {
			document.body.classList.add('light')
			document.body.classList.remove('dark')
		}
	}, [darkMode])

	const handleSettingsChange = React.useCallback((changes: Partial<MapilloSettings>) => {
		setSettings((prev) => {
			const next = { ...prev, ...changes }

			// Persist changed keys to server
			const bus = busRef.current
			if (bus) {
				for (const [prop, value] of Object.entries(changes)) {
					const serverKey = SETTING_KEYS[prop as keyof MapilloSettings]
					if (serverKey) {
						bus.settings.set(serverKey, value).catch((err) => {
							console.warn('[Mapillo] Failed to save setting:', serverKey, err)
						})
					}
				}
			}

			return next
		})
	}, [])

	if (!ready) {
		return (
			<div className="mapillo-loading c-vbox w-100 h-100 align-center justify-center">
				<div className="c-spinner large" />
				<p className="mt-2">Loading Mapillo...</p>
			</div>
		)
	}

	return (
		<MapView
			darkMode={darkMode}
			settings={settings}
			onSettingsChange={handleSettingsChange}
			bus={busRef.current}
		/>
	)
}

// vim: ts=4

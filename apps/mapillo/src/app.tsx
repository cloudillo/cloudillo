// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { type AppMessageBus, getAppBus, parseTileSources } from '@cloudillo/core'
import { EmptyState, LoadingSpinner } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import '@cloudillo/fonts/fonts.css'
import './style.css'

import i18n from './i18n.js'
import { IcMap } from './icons.js'
import { MapView } from './map.js'
import { toTileLayers } from './styles.js'
import type { MapilloSettings, TileLayerConfig } from './types.js'
import { DEFAULT_SETTINGS } from './types.js'

const APP_NAME = 'mapillo'

// maplibre-gl needs WebGL2 and renders a blank canvas without it
const hasWebGL2 = !!document.createElement('canvas').getContext('webgl2')

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

/**
 * The admin-configured tile sources (`map.tile_sources`, a global key the manifest's
 * `readSettings` grants). `[]` for a missing key or an empty list (Mapillo is off);
 * undefined when the read fails or yields no usable source. No hard-coded fallback.
 */
async function loadTileLayers(bus: AppMessageBus): Promise<TileLayerConfig[] | undefined> {
	try {
		const value = await bus.settings.get('map.tile_sources')
		// Missing (404 → undefined) or empty: no sources configured
		if (value == null || (Array.isArray(value) && !value.length)) return []
		const layers = toTileLayers(parseTileSources(value))
		return layers.length ? layers : undefined
	} catch (err) {
		console.warn('[Mapillo] Failed to load tile sources:', err)
		return undefined
	}
}

export function MapilloApp() {
	const { t } = useTranslation()
	const [darkMode, setDarkMode] = React.useState(false)
	const [ready, setReady] = React.useState(false)
	const [settings, setSettings] = React.useState<MapilloSettings>(DEFAULT_SETTINGS)
	const [tileLayers, setTileLayers] = React.useState<TileLayerConfig[]>([])
	const [tileError, setTileError] = React.useState(false)
	const busRef = React.useRef<AppMessageBus | null>(null)

	React.useEffect(() => {
		let unmounted = false
		let unsubscribeTheme: (() => void) | undefined
		;(async () => {
			try {
				const bus = getAppBus()
				busRef.current = bus
				const state = await bus.init(APP_NAME)
				if (state.language) await i18n.changeLanguage(state.language)
				// Torn down while init was pending: the cleanup has already run,
				// with `unsubscribeTheme` still undefined. Subscribing past this
				// point would leak the listener for the lifetime of the page.
				if (unmounted) return

				setDarkMode(state.darkMode ?? false)
				// The tile-layer filter is derived from `darkMode` in JS, so a live
				// theme switch has to reach this state, not just the body classes.
				unsubscribeTheme = bus.onThemeChange(setDarkMode)

				// Load settings from server (shell proxies via its own API client,
				// so this works even without an app-level access token)
				const [saved, layers] = await Promise.all([loadSettings(bus), loadTileLayers(bus)])
				if (unmounted) return

				setSettings((s) => ({ ...s, ...saved }))
				setTileLayers(layers ?? [])
				setTileError(!layers)
				setReady(true)
			} catch (err) {
				if (unmounted) return
				console.error('[Mapillo] Bus init failed, running standalone:', err)
				// Fallback: detect system dark mode
				setDarkMode(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
				setReady(true)
			}
		})()
		return () => {
			unmounted = true
			unsubscribeTheme?.()
		}
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
				<LoadingSpinner size="lg" label={t('Loading Mapillo…')} />
			</div>
		)
	}

	if (!hasWebGL2) {
		return (
			<EmptyState
				fill
				icon={<IcMap />}
				title={t('Maps need WebGL2')}
				description={t(
					'This browser or device has WebGL2 disabled or unsupported, so the map cannot be drawn.'
				)}
			/>
		)
	}

	if (tileError) {
		return (
			<EmptyState
				fill
				icon={<IcMap />}
				title={t('Map sources could not be loaded')}
				description={t('Try reloading the page.')}
			/>
		)
	}

	if (!tileLayers.length) {
		return (
			<EmptyState
				fill
				icon={<IcMap />}
				title={t('Mapillo is disabled by the administrator')}
				description={t('This server has no map tile sources configured.')}
			/>
		)
	}

	return (
		<MapView
			darkMode={darkMode}
			settings={settings}
			tileLayers={tileLayers}
			onSettingsChange={handleSettingsChange}
			bus={busRef.current}
		/>
	)
}

// vim: ts=4

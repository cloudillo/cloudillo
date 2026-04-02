// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useApi, useToast } from '@cloudillo/react'

// Debounce delays for different input types
const DEBOUNCE_DELAYS = {
	text: 800, // Text inputs - wait for user to stop typing
	password: 800, // Password inputs - wait for user to stop typing
	select: 300, // Select dropdowns - short delay
	checkbox: 0, // Checkboxes - instant (toggles should be immediate)
	default: 500 // Default fallback
}

export function useSettings(prefix: string | string[]) {
	const { t } = useTranslation()
	const { api, authenticated } = useApi()
	const { error: toastError } = useToast()
	const [settings, setSettings] = React.useState<
		Record<string, string | number | boolean> | undefined
	>()
	const prefixStr = React.useMemo(
		() => (Array.isArray(prefix) ? prefix.join(',') : prefix),
		[prefix]
	)
	const debounceTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({})

	React.useEffect(
		function loadSettings() {
			// Only fetch settings if we have both api and auth token
			if (!api || !authenticated) return
			;(async function () {
				try {
					const res = await api.settings.list({ prefix: prefixStr })
					// Convert array of SettingResponse to flat object mapping key -> value
					const settingsMap: Record<string, string | number | boolean> = {}
					for (const setting of res) {
						if (setting.value != null) {
							settingsMap[setting.key] = setting.value as string | number | boolean
						}
					}
					setSettings(settingsMap)
				} catch (err) {
					console.error('Failed to load settings:', err)
				}
			})()
		},
		[api, authenticated, prefixStr]
	)

	// Cleanup debounce timers on unmount
	React.useEffect(() => {
		return () => {
			Object.values(debounceTimers.current).forEach((timer) => {
				clearTimeout(timer)
			})
		}
	}, [])

	async function onSettingChange(
		evt: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
	) {
		if (!settings || !api) return

		const { name, type, tagName } = evt.target
		const value =
			type === 'checkbox' ? (evt.target as HTMLInputElement).checked : evt.target.value
		const oldValue = settings[name]

		// Update local state immediately for responsive UI
		setSettings((settings) => ({ ...settings, [name]: value }))

		// Determine debounce delay based on input type
		const inputType = type || (tagName.toLowerCase() === 'select' ? 'select' : 'default')
		const delay =
			DEBOUNCE_DELAYS[inputType as keyof typeof DEBOUNCE_DELAYS] || DEBOUNCE_DELAYS.default

		// Clear existing timer for this setting
		if (debounceTimers.current[name]) {
			clearTimeout(debounceTimers.current[name])
		}

		// Set new debounced API call
		if (delay === 0) {
			// No debounce - call immediately (for checkboxes)
			try {
				await api.settings.update(name, { value })
			} catch (error) {
				console.error('Failed to update setting:', name, error)
				setSettings((settings) => ({ ...settings, [name]: oldValue }))
				toastError(t('Failed to save setting. Please try again.'))
			}
		} else {
			// Debounce the API call
			debounceTimers.current[name] = setTimeout(async () => {
				try {
					await api.settings.update(name, { value })
					delete debounceTimers.current[name]
				} catch (error) {
					console.error('Failed to update setting:', name, error)
					setSettings((settings) => ({ ...settings, [name]: oldValue }))
					toastError(t('Failed to save setting. Please try again.'))
				}
			}, delay)
		}
	}

	return { settings, setSettings, onSettingChange }
}

// vim: ts=4

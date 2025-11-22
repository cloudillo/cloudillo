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

import * as React from 'react'

import { useApi } from '@cloudillo/react'

// Debounce delays for different input types
const DEBOUNCE_DELAYS = {
	text: 800,      // Text inputs - wait for user to stop typing
	password: 800,  // Password inputs - wait for user to stop typing
	select: 300,    // Select dropdowns - short delay
	checkbox: 0,    // Checkboxes - instant (toggles should be immediate)
	default: 500    // Default fallback
}

export function useSettings(prefix: string | string[]) {
	const { api, setIdTag } = useApi()
	const [settings, setSettings] = React.useState<Record<string, string | number | boolean> | undefined>()
	const prefixStr = React.useMemo(() => Array.isArray(prefix) ? prefix.join(',') : prefix, [prefix])
	const debounceTimers = React.useRef<Record<string, NodeJS.Timeout>>({})

	React.useEffect(function loadSettings() {
		if (!api) return
		(async function () {
			const res = await api.settings.list({ prefix: prefixStr })
			// Convert array of SettingResponse to flat object mapping key -> value
			const settingsMap = Object.fromEntries(
				res.map((setting: any) => [setting.key, setting.value])
			)
			setSettings(settingsMap)
		})()
	}, [api, prefixStr])

	// Cleanup debounce timers on unmount
	React.useEffect(() => {
		return () => {
			Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer))
		}
	}, [])

	async function onSettingChange(evt: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
		if (!settings || !api) return

		const { name, type, tagName } = evt.target
		let value = type === 'checkbox' ? (evt.target as HTMLInputElement).checked : evt.target.value

		// Update local state immediately for responsive UI
		setSettings(settings => ({ ...settings, [name]: value }))

		// Determine debounce delay based on input type
		const inputType = type || (tagName.toLowerCase() === 'select' ? 'select' : 'default')
		const delay = DEBOUNCE_DELAYS[inputType as keyof typeof DEBOUNCE_DELAYS] || DEBOUNCE_DELAYS.default

		// Clear existing timer for this setting
		if (debounceTimers.current[name]) {
			clearTimeout(debounceTimers.current[name])
		}

		// Set new debounced API call
		if (delay === 0) {
			// No debounce - call immediately (for checkboxes)
			await api.settings.update(name, { value })
		} else {
			// Debounce the API call
			debounceTimers.current[name] = setTimeout(async () => {
				try {
					await api.settings.update(name, { value })
					delete debounceTimers.current[name]
				} catch (error) {
					console.error('Failed to update setting:', name, error)
					// Optionally revert the local state on error
					// setSettings(settings => ({ ...settings, [name]: oldValue }))
				}
			}, delay)
		}
	}

	return { settings, setSettings, onSettingChange }
}


// vim: ts=4

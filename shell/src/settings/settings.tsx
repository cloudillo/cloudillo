// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { EmptyState, ListItem, Toggle, useApi, useToast } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuLock as IcDenied } from 'react-icons/lu'

import { coerceSettingValue, isPermissionError } from '../utils.js'

/** Shown instead of a settings page whose `useSettings` load was refused (403) */
export function SettingsDenied() {
	const { t } = useTranslation()
	return (
		<EmptyState
			icon={<IcDenied />}
			title={t('No access to these settings')}
			description={t('Your account is not allowed to view or change these settings.')}
		/>
	)
}

type SwitchRowProps = Omit<React.ComponentProps<typeof Toggle>, 'label' | 'description'> & {
	label: string
	description?: React.ReactNode
}

/** Settings switch row: goes inside `<List variant="divided">`, a direct child of the Panel */
export function SwitchRow({ label, description, ...props }: SwitchRowProps) {
	const autoId = React.useId()
	const id = props.id ?? autoId
	return (
		<ListItem
			title={
				// biome-ignore lint/plugin/no-raw-intrinsic: ds-allow: ListItem title must be a label tied to the Toggle
				<label htmlFor={id}>{label}</label>
			}
			subtitle={description}
			trailing={<Toggle color="primary" {...props} id={id} />}
		/>
	)
}

// Debounce delays for different input types
const DEBOUNCE_DELAYS = {
	text: 800, // Text inputs - wait for user to stop typing
	password: 800, // Password inputs - wait for user to stop typing
	select: 300, // Select dropdowns - short delay
	checkbox: 0, // Checkboxes - instant (toggles should be immediate)
	default: 500 // Default fallback
}

// `level` selects between the caller's own scope (tenant or global) — for cross-
// tenant admin writes (site admin editing tenant X), call api.settings.* directly
// with { level: 'tenant', tenant: idTag }; this hook only handles self-settings.
export function useSettings(prefix: string | string[], opts?: { level?: 'global' | 'tenant' }) {
	const level = opts?.level
	const { t } = useTranslation()
	const { api, authenticated } = useApi()
	const { error: toastError } = useToast()
	const [settings, setSettings] = React.useState<
		Record<string, string | number | boolean> | undefined
	>()
	const [denied, setDenied] = React.useState(false)
	const prefixStr = React.useMemo(
		() => (Array.isArray(prefix) ? prefix.join(',') : prefix),
		[prefix]
	)
	const debounceTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({})

	const refresh = React.useCallback(async () => {
		if (!api || !authenticated) return
		try {
			const res = await api.settings.list({
				prefix: prefixStr,
				...(level ? { level } : {})
			})
			// Convert array of SettingResponse to flat object mapping key -> value
			const settingsMap: Record<string, string | number | boolean> = {}
			for (const setting of res) {
				if (setting.value != null) {
					settingsMap[setting.key] = setting.value as string | number | boolean
				}
			}
			setSettings(settingsMap)
			setDenied(false)
		} catch (err) {
			console.error('Failed to load settings:', err)
			if (isPermissionError(err)) setDenied(true)
		}
	}, [api, authenticated, prefixStr, level])

	React.useEffect(() => {
		refresh()
	}, [refresh])

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
		const oldValue = settings[name]

		const value = coerceSettingValue(evt.target, oldValue)
		if (value === undefined) {
			// Empty/partial numeric input (e.g. '' or '-'): keep what the user typed
			// locally so the controlled input isn't reverted, but don't persist a bad
			// value to the typed-settings backend. (See M1.)
			setSettings((settings) => ({ ...settings, [name]: evt.target.value }))
			return
		}

		// Update local state immediately for responsive UI
		setSettings((settings) => ({ ...settings, [name]: value }))

		// Determine debounce delay based on input type
		const inputType = tagName.toLowerCase() === 'select' ? 'select' : type
		const delay =
			DEBOUNCE_DELAYS[inputType as keyof typeof DEBOUNCE_DELAYS] ?? DEBOUNCE_DELAYS.default

		// Clear existing timer for this setting
		if (debounceTimers.current[name]) {
			clearTimeout(debounceTimers.current[name])
		}

		// Set new debounced API call
		if (delay === 0) {
			// No debounce - call immediately (for checkboxes)
			try {
				await api.settings.update(name, { value }, level ? { level } : undefined)
			} catch (error) {
				console.error('Failed to update setting:', name, error)
				setSettings((settings) => ({ ...settings, [name]: oldValue }))
				toastError(t('Failed to save setting. Please try again.'))
			}
		} else {
			// Debounce the API call
			debounceTimers.current[name] = setTimeout(async () => {
				try {
					await api.settings.update(name, { value }, level ? { level } : undefined)
					delete debounceTimers.current[name]
				} catch (error) {
					console.error('Failed to update setting:', name, error)
					setSettings((settings) => ({ ...settings, [name]: oldValue }))
					toastError(t('Failed to save setting. Please try again.'))
				}
			}, delay)
		}
	}

	return { settings, setSettings, onSettingChange, refresh, denied }
}

// vim: ts=4

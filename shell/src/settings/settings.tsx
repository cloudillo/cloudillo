// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { EmptyState, IcNoAccess, ListItem, Toggle, useApi, useToast } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useContextAwareApi } from '../context/index.js'
import { coerceSettingValue, isPermissionError } from '../utils.js'

/** Shown instead of a settings page whose `useSettings` load was refused (403) */
export function SettingsDenied() {
	const { t } = useTranslation()
	return (
		<EmptyState
			icon={<IcNoAccess />}
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
// Reads and writes the home node's settings by default; `idTag` (including `null`)
// targets that node (see `useApi`), and `context: true` targets the active context
// (`useContextAwareApi`) — only for community-admin pages.
export function useSettings(
	prefix: string | string[],
	opts?: { level?: 'global' | 'tenant'; idTag?: string | null; context?: boolean }
) {
	const level = opts?.level
	const { t } = useTranslation()
	const contextApi = useContextAwareApi()
	const explicitApi = useApi(opts?.idTag)
	const { api, authenticated } = opts?.context ? contextApi : explicitApi
	const { error: toastError } = useToast()
	const [settings, setSettings] = React.useState<
		Record<string, string | number | boolean> | undefined
	>()
	const [denied, setDenied] = React.useState(false)
	const [error, setError] = React.useState<unknown>()
	const prefixStr = React.useMemo(
		() => (Array.isArray(prefix) ? prefix.join(',') : prefix),
		[prefix]
	)
	// Debounced writes not yet sent: the timer calls `run`, or the unmount flush does
	const pending = React.useRef<
		Record<string, { timer: ReturnType<typeof setTimeout>; run: () => Promise<void> }>
	>({})
	// The client whose list responses may still land; a superseded one's are dropped
	const liveApi = React.useRef<typeof api>(undefined)

	const refresh = React.useCallback(async () => {
		if (!api || !authenticated) return
		try {
			setError(undefined)
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
			if (liveApi.current !== api) return
			setSettings(settingsMap)
			setDenied(false)
			setError(undefined)
		} catch (err) {
			if (liveApi.current !== api) return
			console.error('Failed to load settings:', err)
			if (isPermissionError(err)) setDenied(true)
			else setError(err)
		}
	}, [api, authenticated, prefixStr, level])

	React.useEffect(() => {
		liveApi.current = api
		refresh()
		return () => {
			liveApi.current = undefined
		}
	}, [api, refresh])

	// Flush pending debounced writes on unmount instead of dropping them
	React.useEffect(() => {
		return () => {
			for (const p of Object.values(pending.current)) {
				clearTimeout(p.timer)
				void p.run()
			}
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

		// Supersede a pending write for this setting
		const prev = pending.current[name]
		if (prev) {
			clearTimeout(prev.timer)
			delete pending.current[name]
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
			// Debounce the API call; `run` fires exactly once, from the timer or the unmount flush
			const run = async () => {
				delete pending.current[name]
				try {
					await api.settings.update(name, { value }, level ? { level } : undefined)
				} catch (error) {
					console.error('Failed to update setting:', name, error)
					setSettings((settings) => ({ ...settings, [name]: oldValue }))
					toastError(t('Failed to save setting. Please try again.'))
				}
			}
			pending.current[name] = { timer: setTimeout(() => void run(), delay), run }
		}
	}

	return { settings, setSettings, onSettingChange, refresh, denied, error }
}

/** `notify.push_allowed` (Global): only an explicit false forbids push */
export function isPushAllowed(settings: Record<string, unknown> | undefined): boolean {
	return settings?.['notify.push_allowed'] !== false
}

export function usePushAllowed(): boolean {
	const { settings } = useSettings('notify')
	return isPushAllowed(settings)
}

// vim: ts=4

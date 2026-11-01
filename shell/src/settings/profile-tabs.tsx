// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ProfilePatch } from '@cloudillo/core'
import { friendlyError, LoadError, LoadingSpinner, useApi, useToast } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { parseTabConfig, type TabConfig } from '../profile/about/types.js'
import { TabEditor } from '../profile/TabEditor.js'

interface TabConfigEditorProps {
	/** The profile's `x` map, where `tabConfig` lives as a JSON string */
	x: Record<string, string>
	save: (patch: ProfilePatch) => Promise<unknown>
	isCommunity?: boolean
}

/**
 * `TabEditor` over a profile's `x.tabConfig`, updated optimistically and saved debounced.
 * Shared by the personal Profile page and the community General page.
 */
export function TabConfigEditor({ x, save, isCommunity }: TabConfigEditorProps) {
	const { t } = useTranslation()
	const { error: toastError } = useToast()
	const [tabConfig, setTabConfig] = React.useState(() => parseTabConfig(x))
	const saveTimerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)
	// The not-yet-saved config, and the latest `save` (the prop changes every render)
	const pendingRef = React.useRef<TabConfig>(undefined)
	const saveRef = React.useRef(save)
	saveRef.current = save

	function flush() {
		const config = pendingRef.current
		pendingRef.current = undefined
		if (!config) return
		saveRef.current({ x: { tabConfig: JSON.stringify(config) } }).catch((err) => {
			console.error('Failed to save tab config:', err)
			toastError(friendlyError(t, err))
		})
	}

	// Flush a pending save on unmount instead of dropping it
	React.useEffect(() => {
		return () => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
			flush()
		}
	}, [])

	function onChange(newConfig: TabConfig) {
		setTabConfig(newConfig)
		pendingRef.current = newConfig
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
		saveTimerRef.current = setTimeout(flush, 500)
	}

	return <TabEditor tabConfig={tabConfig} onChange={onChange} isCommunity={isCommunity} />
}

/** `~/settings/profile`: the tabs of the user's own profile page. */
export function ProfileTabSettings() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [x, setX] = React.useState<Record<string, string>>()
	const [loadError, setLoadError] = React.useState<unknown>()

	const load = React.useCallback(() => {
		if (!api) return
		setLoadError(undefined)
		api.profiles
			.getOwnFull()
			.then((p) => setX((p as { x?: Record<string, string> }).x ?? {}))
			.catch((err) => {
				console.error('Failed to load profile:', err)
				setLoadError(err)
			})
	}, [api])

	React.useEffect(load, [load])

	if (loadError)
		return (
			<LoadError error={loadError} onRetry={load} title={t("Couldn't load these settings")} />
		)
	if (!api) return null
	if (!x) return <LoadingSpinner className="auto-bg" />
	return <TabConfigEditor x={x} save={(patch) => api.profiles.updateOwn(patch)} />
}

// vim: ts=4

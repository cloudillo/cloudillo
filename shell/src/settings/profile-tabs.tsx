// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ProfilePatch } from '@cloudillo/core'
import { useApi } from '@cloudillo/react'
import * as React from 'react'

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
	const [tabConfig, setTabConfig] = React.useState(() => parseTabConfig(x))
	const saveTimerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)

	React.useEffect(() => {
		return () => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
		}
	}, [])

	function onChange(newConfig: TabConfig) {
		setTabConfig(newConfig)
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
		saveTimerRef.current = setTimeout(() => {
			save({ x: { tabConfig: JSON.stringify(newConfig) } }).catch((err) => {
				console.error('Failed to save tab config:', err)
			})
		}, 500)
	}

	return <TabEditor tabConfig={tabConfig} onChange={onChange} isCommunity={isCommunity} />
}

/** `~/settings/profile`: the tabs of the user's own profile page. */
export function ProfileTabSettings() {
	const { api } = useApi()
	const [x, setX] = React.useState<Record<string, string>>()

	React.useEffect(
		function load() {
			if (!api) return
			api.profiles
				.getOwnFull()
				.then((p) => setX((p as { x?: Record<string, string> }).x ?? {}))
				.catch((err) => console.error('Failed to load profile:', err))
		},
		[api]
	)

	if (!api || !x) return null
	return <TabConfigEditor x={x} save={(patch) => api.profiles.updateOwn(patch)} />
}

// vim: ts=4

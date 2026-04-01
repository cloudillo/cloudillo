// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

const STORAGE_KEY = 'notify.local'

export interface LocalNotifySettings {
	// Master toggle for toasts
	toast: boolean
	// Sound settings: empty string = disabled, otherwise sound key (e.g., 'beep', 'chime')
	'sound.message': string
	'sound.connection': string
	'sound.file_share': string
	'sound.follow': string
	'sound.comment': string
	'sound.reaction': string
	'sound.mention': string
	'sound.post': string
	// Volume settings (0-100)
	'volume.active': number // Volume when tab is focused
	'volume.inactive': number // Volume when tab is in background
	// Toast settings: boolean per action type
	'toast.message': boolean
	'toast.connection': boolean
	'toast.file_share': boolean
	'toast.follow': boolean
	'toast.comment': boolean
	'toast.reaction': boolean
	'toast.mention': boolean
	'toast.post': boolean
}

const defaultSettings: LocalNotifySettings = {
	toast: true,
	'sound.message': '',
	'sound.connection': '',
	'sound.file_share': '',
	'sound.follow': '',
	'sound.comment': '',
	'sound.reaction': '',
	'sound.mention': '',
	'sound.post': '',
	'volume.active': 50,
	'volume.inactive': 100,
	'toast.message': true,
	'toast.connection': true,
	'toast.file_share': true,
	'toast.follow': false,
	'toast.comment': false,
	'toast.reaction': false,
	'toast.mention': true,
	'toast.post': false
}

function loadSettings(): LocalNotifySettings {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		if (stored) {
			return { ...defaultSettings, ...JSON.parse(stored) }
		}
	} catch (e) {
		console.error('[LocalNotifySettings] Failed to load settings:', e)
	}
	return defaultSettings
}

function saveSettings(settings: LocalNotifySettings): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
	} catch (e) {
		console.error('[LocalNotifySettings] Failed to save settings:', e)
	}
}

export function useLocalNotifySettings() {
	const [settings, setSettings] = React.useState<LocalNotifySettings>(loadSettings)

	const updateSetting = React.useCallback(
		(key: keyof LocalNotifySettings, value: string | boolean | number) => {
			setSettings((prev) => {
				const newSettings = { ...prev, [key]: value }
				saveSettings(newSettings)
				return newSettings
			})
		},
		[]
	)

	return { settings, updateSetting }
}

// vim: ts=4

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
	toast: false,
	'sound.message': '',
	'sound.connection': '',
	'sound.file_share': '',
	'sound.follow': '',
	'sound.comment': '',
	'sound.reaction': '',
	'sound.mention': '',
	'sound.post': '',
	'toast.message': false,
	'toast.connection': false,
	'toast.file_share': false,
	'toast.follow': false,
	'toast.comment': false,
	'toast.reaction': false,
	'toast.mention': false,
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
		(key: keyof LocalNotifySettings, value: string | boolean) => {
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

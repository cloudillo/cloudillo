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
import { useTranslation } from 'react-i18next'
import { useToast } from '@cloudillo/react'
import { ActionView } from '@cloudillo/types'

import { useWsBus } from '../ws-bus.js'
import { NOTIFICATION_SOUNDS } from './sounds.js'
import { useLocalNotifySettings, LocalNotifySettings } from './useLocalNotifySettings.js'

// Map action types to setting keys
const ACTION_TYPE_MAP: Record<string, keyof LocalNotifySettings> = {
	MSG: 'sound.message',
	CONN: 'sound.connection',
	PRINVT: 'sound.connection',
	FSHR: 'sound.file_share',
	FLLW: 'sound.follow',
	CMNT: 'sound.comment',
	REACT: 'sound.reaction',
	MNTN: 'sound.mention',
	POST: 'sound.post'
}

// Actionable types get a longer toast duration
const ACTIONABLE_TYPES = new Set(['CONN', 'FSHR', 'INVT', 'PRINVT'])

function getSettingKey(actionType: string): string | undefined {
	const key = ACTION_TYPE_MAP[actionType]
	return key?.replace('sound.', '')
}

function getNotificationTitle(t: (key: string) => string, actionType: string): string {
	switch (actionType) {
		case 'MSG':
			return t('New Message')
		case 'CONN':
			return t('Connection Request')
		case 'FSHR':
			return t('File Shared')
		case 'FLLW':
			return t('New Follower')
		case 'CMNT':
			return t('New Comment')
		case 'REACT':
			return t('New Reaction')
		case 'MNTN':
			return t('Mention')
		case 'POST':
			return t('New Post')
		case 'INVT':
			return t('Group Invitation')
		case 'PRINVT':
			return t('Community Invitation')
		default:
			return t('Notification')
	}
}

function getNotificationMessage(
	t: (key: string, options?: Record<string, string>) => string,
	action: ActionView
): string {
	const name = action.issuer?.name || action.issuer?.idTag || t('Someone')
	switch (action.type) {
		case 'MSG':
			return t('New message from {{name}}', { name })
		case 'CONN':
			return t('{{name}} wants to connect', { name })
		case 'FSHR':
			return t('{{name}} shared a file with you', { name })
		case 'FLLW':
			return t('{{name}} started following you', { name })
		case 'CMNT':
			return t('{{name}} commented on your post', { name })
		case 'REACT':
			return t('{{name}} reacted to your post', { name })
		case 'MNTN':
			return t('{{name}} mentioned you', { name })
		case 'POST':
			return t('New post from {{name}}', { name })
		case 'INVT':
			return t('{{name}} invited you to join a group', { name })
		case 'PRINVT':
			return t('{{name}} invited you to create a community', { name })
		default:
			return t('New notification from {{name}}', { name })
	}
}

/**
 * Hook for handling action notifications (sound + toast).
 * Should be called once in Layout to enable global notification handling.
 */
export function useActionNotifications() {
	const { t } = useTranslation()
	const { settings } = useLocalNotifySettings()
	const { toast } = useToast()
	const audioRefs = React.useRef<Record<string, HTMLAudioElement>>({})
	// Use ref to avoid stale closure in useWsBus callback
	const settingsRef = React.useRef(settings)
	settingsRef.current = settings

	// Initialize audio elements for all sounds
	React.useEffect(function initAudio() {
		Object.entries(NOTIFICATION_SOUNDS).forEach(([key, filename]) => {
			const audio = new Audio(`/sounds/${filename}`)
			audio.preload = 'auto'
			audioRefs.current[key] = audio
		})

		return () => {
			// Cleanup audio elements
			Object.values(audioRefs.current).forEach((audio) => {
				audio.pause()
				audio.src = ''
				audio.load()
			})
			audioRefs.current = {}
		}
	}, [])

	const playSound = React.useCallback((soundKey: string) => {
		const audio = audioRefs.current[soundKey]
		if (audio) {
			// Get volume based on window state
			const currentSettings = settingsRef.current
			const isActive = document.visibilityState === 'visible'
			const volumePercent = isActive
				? (currentSettings['volume.active'] ?? 50)
				: (currentSettings['volume.inactive'] ?? 100)

			audio.volume = volumePercent / 100 // HTMLAudioElement.volume is 0.0 - 1.0
			audio.currentTime = 0
			audio.play().catch(() => {
				// Silently fail if blocked by browser autoplay policy
			})
		}
	}, [])

	const notify = React.useCallback(
		(action: ActionView) => {
			const settingKey = getSettingKey(action.type)
			if (!settingKey) return

			const currentSettings = settingsRef.current
			// Play sound if configured (non-empty string)
			const soundKey = currentSettings[
				`sound.${settingKey}` as keyof LocalNotifySettings
			] as string
			if (soundKey) {
				playSound(soundKey)
			}

			// Show toast if enabled
			const toastEnabled =
				currentSettings.toast &&
				currentSettings[`toast.${settingKey}` as keyof LocalNotifySettings]
			if (toastEnabled) {
				const title = getNotificationTitle(t, action.type)
				const message = getNotificationMessage(t, action)
				const duration = ACTIONABLE_TYPES.has(action.type) ? 7000 : 5000
				toast({ variant: 'info', title, message, duration })
			}
		},
		[t, playSound, toast]
	)

	useWsBus({ cmds: ['ACTION'] }, (msg) => {
		const action = msg.data as ActionView
		// Play sounds for active notifications (not drafts or deleted)
		if (!action.status || ['N', 'C', 'A'].includes(action.status)) {
			notify(action)
		}
	})
}

// vim: ts=4

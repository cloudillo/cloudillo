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

function getNotificationTitle(actionType: string): string {
	switch (actionType) {
		case 'MSG':
			return 'New Message'
		case 'CONN':
			return 'Connection Request'
		case 'FSHR':
			return 'File Shared'
		case 'FLLW':
			return 'New Follower'
		case 'CMNT':
			return 'New Comment'
		case 'REACT':
			return 'New Reaction'
		case 'MNTN':
			return 'Mention'
		case 'POST':
			return 'New Post'
		case 'INVT':
			return 'Group Invitation'
		case 'PRINVT':
			return 'Community Invitation'
		default:
			return 'Notification'
	}
}

function getNotificationMessage(action: ActionView): string {
	const name = action.issuer?.name || action.issuer?.idTag || 'Someone'
	switch (action.type) {
		case 'MSG':
			return `New message from ${name}`
		case 'CONN':
			return `${name} wants to connect`
		case 'FSHR':
			return `${name} shared a file with you`
		case 'FLLW':
			return `${name} started following you`
		case 'CMNT':
			return `${name} commented on your post`
		case 'REACT':
			return `${name} reacted to your post`
		case 'MNTN':
			return `${name} mentioned you`
		case 'POST':
			return `New post from ${name}`
		case 'INVT':
			return `${name} invited you to join a group`
		case 'PRINVT':
			return `${name} invited you to create a community`
		default:
			return `New notification from ${name}`
	}
}

/**
 * Hook for handling action notifications (sound + toast).
 * Should be called once in Layout to enable global notification handling.
 */
export function useActionNotifications() {
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
				const title = getNotificationTitle(action.type)
				const message = getNotificationMessage(action)
				const duration = ACTIONABLE_TYPES.has(action.type) ? 7000 : 5000
				toast({ variant: 'info', title, message, duration })
			}
		},
		[playSound, toast]
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

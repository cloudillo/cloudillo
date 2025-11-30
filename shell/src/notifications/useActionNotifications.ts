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
	'MSG': 'sound.message',
	'CONN': 'sound.connection',
	'FSHR': 'sound.file_share',
	'FLLW': 'sound.follow',
	'CMNT': 'sound.comment',
	'REACT': 'sound.reaction',
	'MNTN': 'sound.mention',
	'POST': 'sound.post',
}

function getSettingKey(actionType: string): string | undefined {
	const key = ACTION_TYPE_MAP[actionType]
	return key?.replace('sound.', '')
}

function getNotificationMessage(action: ActionView): string {
	const name = action.issuer?.name || action.issuer?.idTag || 'Someone'
	switch (action.type) {
		case 'MSG': return `New message from ${name}`
		case 'CONN': return `${name} wants to connect`
		case 'FSHR': return `${name} shared a file with you`
		case 'FLLW': return `${name} started following you`
		case 'CMNT': return `${name} commented on your post`
		case 'REACT': return `${name} reacted to your post`
		case 'MNTN': return `${name} mentioned you`
		case 'POST': return `New post from ${name}`
		default: return `New notification from ${name}`
	}
}

/**
 * Hook for handling action notifications (sound + toast).
 * Should be called once in Layout to enable global notification handling.
 */
export function useActionNotifications() {
	const { settings } = useLocalNotifySettings()
	const { info } = useToast()
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
			Object.values(audioRefs.current).forEach(audio => {
				audio.pause()
				audio.src = ''
			})
			audioRefs.current = {}
		}
	}, [])

	const playSound = React.useCallback((soundKey: string) => {
		const audio = audioRefs.current[soundKey]
		if (audio) {
			audio.currentTime = 0
			audio.play().catch(() => {
				// Silently fail if blocked by browser autoplay policy
			})
		}
	}, [])

	const notify = React.useCallback((action: ActionView) => {
		const settingKey = getSettingKey(action.type)
		if (!settingKey) return

		const currentSettings = settingsRef.current
		// Play sound if configured (non-empty string)
		const soundKey = currentSettings[`sound.${settingKey}` as keyof LocalNotifySettings] as string
		if (soundKey) {
			playSound(soundKey)
		}

		// Show toast if enabled
		const toastEnabled = currentSettings.toast && currentSettings[`toast.${settingKey}` as keyof LocalNotifySettings]
		if (toastEnabled) {
			const message = getNotificationMessage(action)
			info(message, { duration: 5000 })
		}
	}, [playSound, info])

	useWsBus({ cmds: ['ACTION'] }, (msg) => {
		const action = msg.data as ActionView
		// Real-time WS messages are inherently new - notify unless explicitly handled (status 'A' = accepted, etc.)
		if (!action.status || action.status === 'N' || action.status === 'C') {
			notify(action)
		}
	})
}

// vim: ts=4

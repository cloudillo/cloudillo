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
import { atom, useAtom } from 'jotai'

import { ActionView } from '@cloudillo/types'
import { useAuth, useApi } from '@cloudillo/react'

export interface NotificationState {
	notifications: ActionView[]
}

const notificationAtom = atom<NotificationState>({ notifications: [] })

export function useNotifications() {
	const { api, setIdTag } = useApi()
	const [notifications, setNotifications] = useAtom(notificationAtom)

	const loadNotifications = React.useCallback(
		async function () {
			if (!api) return
			const actions = await api.actions.list({ status: ['C', 'N'] })
			setNotifications({ notifications: actions })
		},
		[api, setNotifications]
	)

	const dismissNotification = React.useCallback(
		async function (action: ActionView) {
			if (!api || !action.actionId) return
			// Optimistically remove from state
			setNotifications((n) => ({
				notifications: n.notifications.filter((a) => a.actionId !== action.actionId)
			}))
			try {
				await api.actions.dismiss(action.actionId)
			} catch {
				// Restore on failure
				loadNotifications()
			}
		},
		[api, setNotifications, loadNotifications]
	)

	const acceptNotification = React.useCallback(
		async function (action: ActionView) {
			if (!api || !action.actionId) return
			// Optimistically remove from state
			setNotifications((n) => ({
				notifications: n.notifications.filter((a) => a.actionId !== action.actionId)
			}))
			try {
				await api.actions.accept(action.actionId)
			} catch {
				// Restore on failure
				loadNotifications()
			}
		},
		[api, setNotifications, loadNotifications]
	)

	const rejectNotification = React.useCallback(
		async function (action: ActionView) {
			if (!api || !action.actionId) return
			// Optimistically remove from state
			setNotifications((n) => ({
				notifications: n.notifications.filter((a) => a.actionId !== action.actionId)
			}))
			try {
				await api.actions.reject(action.actionId)
			} catch {
				// Restore on failure
				loadNotifications()
			}
		},
		[api, setNotifications, loadNotifications]
	)

	const dismissAllNotifications = React.useCallback(
		async function () {
			if (!api) return
			const toDismiss = notifications.notifications.filter((a) => a.status !== 'C')
			// Keep only 'C' items in state
			setNotifications((n) => ({
				notifications: n.notifications.filter((a) => a.status === 'C')
			}))
			try {
				await Promise.all(
					toDismiss.map((a) => a.actionId && api.actions.dismiss(a.actionId))
				)
			} catch {
				loadNotifications()
			}
		},
		[api, notifications.notifications, setNotifications, loadNotifications]
	)

	return {
		notifications,
		setNotifications,
		loadNotifications,
		dismissNotification,
		acceptNotification,
		rejectNotification,
		dismissAllNotifications
	}
}

// vim: ts=4

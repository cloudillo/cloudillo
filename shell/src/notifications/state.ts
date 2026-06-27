// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useApi } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import { atom, useAtom } from 'jotai'
import * as React from 'react'

export interface NotificationState {
	notifications: ActionView[]
}

const notificationAtom = atom<NotificationState>({ notifications: [] })

export function useNotifications(status: string[] = ['C', 'N']) {
	const { api } = useApi()
	const [notifications, setNotifications] = useAtom(notificationAtom)
	// Key the loader on the joined status so the default array's fresh identity
	// each render doesn't churn the callback / trigger refetch loops.
	const statusKey = status.join(',')

	const loadNotifications = React.useCallback(
		async function () {
			if (!api) return
			const actions = await api.actions.list({ status: statusKey.split(',') })
			setNotifications({ notifications: actions })
		},
		[api, setNotifications, statusKey]
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
			if (!api || !action.actionId) return false
			// Optimistically remove from state
			setNotifications((n) => ({
				notifications: n.notifications.filter((a) => a.actionId !== action.actionId)
			}))
			try {
				await api.actions.accept(action.actionId)
				return true
			} catch {
				// Restore on failure
				loadNotifications()
				return false
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
			let toDismiss: typeof notifications.notifications = []
			// Dismiss only 'N' (unread/awaiting-ack) items; keep actionable ('C')
			// and historical ('A') items in state. Capture fresh toDismiss list.
			setNotifications((n) => {
				toDismiss = n.notifications.filter((a) => a.status === 'N')
				return { notifications: n.notifications.filter((a) => a.status !== 'N') }
			})
			try {
				await Promise.all(
					toDismiss.map((a) => a.actionId && api.actions.dismiss(a.actionId))
				)
			} catch {
				loadNotifications()
			}
		},
		[api, setNotifications, loadNotifications]
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

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { useApi } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import { atom, useAtom } from 'jotai'
import * as React from 'react'

export interface NotificationState {
	notifications: ActionView[]
}

const notificationAtom = atom<NotificationState>({ notifications: [] })

export function useNotifications(status: string[] = ['confirmation', 'notification']) {
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
			if (!api || !action.id) return
			// Optimistically remove from state
			setNotifications((n) => ({
				notifications: n.notifications.filter((a) => a.id !== action.id)
			}))
			try {
				await api.actions.dismiss(action.id)
			} catch {
				// Restore on failure
				loadNotifications()
			}
		},
		[api, setNotifications, loadNotifications]
	)

	const acceptNotification = React.useCallback(
		async function (action: ActionView) {
			if (!api || !action.id) return false
			// Optimistically remove from state
			setNotifications((n) => ({
				notifications: n.notifications.filter((a) => a.id !== action.id)
			}))
			try {
				await api.actions.accept(action.id)
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
			if (!api || !action.id) return
			// Optimistically remove from state
			setNotifications((n) => ({
				notifications: n.notifications.filter((a) => a.id !== action.id)
			}))
			try {
				await api.actions.reject(action.id)
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
				toDismiss = n.notifications.filter((a) => a.status === 'notification')
				return { notifications: n.notifications.filter((a) => a.status !== 'notification') }
			})
			try {
				await Promise.all(toDismiss.map((a) => a.id && api.actions.dismiss(a.id)))
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

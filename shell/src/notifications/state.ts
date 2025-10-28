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
import * as T from '@symbion/runtype'

import { ActionView } from '@cloudillo/types'
import { useAuth, useApi } from '@cloudillo/react'

export interface NotificationState {
	notifications: ActionView[]
}

const notificationAtom = atom<NotificationState>({ notifications: [] })

export function useNotifications() {
	const { api, setIdTag } = useApi()
	const [notifications, setNotifications] = useAtom(notificationAtom)

	const loadNotifications = React.useCallback(async function () {
		if (!api) return
		const res = await api.actions.list({ status: ['C', 'N'] })
		console.log('RES', res)
		setNotifications({ notifications: res.actions })
	}, [api, notifications, setNotifications])

	return { notifications, setNotifications, loadNotifications }
}


// vim: ts=4

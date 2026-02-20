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

import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

import { RtdbClient } from '@cloudillo/rtdb'
import { getAppBus, getWsUrl } from '@cloudillo/core'

const APP_NAME = 'notillo'

export function useNotillo() {
	const location = useLocation()
	const [client, setClient] = useState<RtdbClient | undefined>()
	const [connected, setConnected] = useState(false)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<Error | undefined>()
	const [fileId, setFileId] = useState('')
	const [ownerTag, setOwnerTag] = useState<string | undefined>()
	const [idTag, setIdTag] = useState<string | undefined>()
	const [access, setAccess] = useState<'read' | 'write'>('write')
	const [darkMode, setDarkMode] = useState(false)

	// Parse document ID from URL hash (#tenant:path)
	useEffect(() => {
		const resId = location.hash.slice(1)
		const [owner, path] = resId.split(':')
		setOwnerTag(owner || undefined)
		setFileId(path || '')
	}, [location.hash])

	// Initialize cloudillo and RTDB client
	useEffect(() => {
		if (!fileId) return
		let rtdbClient: RtdbClient | undefined
		let unmounted = false

		;(async () => {
			try {
				setLoading(true)
				setError(undefined)

				const bus = getAppBus()
				const state = await bus.init(APP_NAME)
				setIdTag(bus.idTag)
				setAccess(bus.access)
				setDarkMode(bus.darkMode)

				if (unmounted) return

				const serverUrl = ownerTag
					? getWsUrl(ownerTag)
					: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`

				rtdbClient = new RtdbClient({
					dbId: fileId,
					auth: {
						getToken: () => state.accessToken
					},
					serverUrl,
					options: {
						enableCache: true,
						reconnect: true,
						reconnectDelay: 1000,
						maxReconnectDelay: 30000,
						debug: false
					}
				})

				await rtdbClient.connect()

				if (unmounted) {
					await rtdbClient.disconnect()
					return
				}

				setClient(rtdbClient)
				setConnected(true)
				setLoading(false)
			} catch (err) {
				console.error('[Notillo] Initialization error:', err)
				if (!unmounted) {
					setError(err as Error)
					setLoading(false)
				}
			}
		})()

		return () => {
			unmounted = true
			if (rtdbClient) {
				rtdbClient.disconnect().catch(console.error)
			}
		}
	}, [fileId, ownerTag])

	return {
		client,
		fileId,
		ownerTag,
		idTag,
		access,
		connected,
		error,
		loading,
		darkMode
	}
}

// vim: ts=4

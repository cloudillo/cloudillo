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
import { useLocation } from 'react-router-dom'
import { atom, useAtom } from 'jotai'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

import * as cloudillo from '@cloudillo/base'
import { createApiClient, ApiClient } from '@cloudillo/base'

// useAuth() //
///////////////
export interface AuthState {
	tnId: number
	idTag?: string
	name?: string
	profilePic?: string
	roles?: string[]
	token?: string
}

const authAtom = atom<AuthState | undefined>(undefined)

export function useAuth() {
	return useAtom(authAtom)
}

// useAPI() //
//////////////
export interface ApiState {
	idTag?: string
}

export const apiAtom = atom<ApiState>({})

/**
 * Hook for type-safe API client
 *
 * Returns a fully type-safe API client with all endpoints typed.
 * Also allows setting the idTag for initial login flow.
 *
 * @example
 * ```typescript
 * const { api, setIdTag } = useApi()
 *
 * // Set idTag if needed (e.g., from .well-known endpoint)
 * if (idTagFromServer) {
 *   setIdTag(idTagFromServer)
 * }
 *
 * if (!api) return <div>Not authenticated</div>
 *
 * // Get login token
 * const result = await api.auth.getLoginToken()
 *
 * // List files
 * const files = await api.files.list({ tag: 'vacation' })
 *
 * // Create action
 * const action = await api.actions.create({
 *   type: 'POST',
 *   content: 'Hello!'
 * })
 * ```
 */
export interface ApiHook {
	api: ApiClient | null
	authenticated: boolean
	setIdTag: (idTag: string) => void
}

export function useApi(): ApiHook {
	const [auth] = useAuth()
	const [apiState, setApiState] = useAtom(apiAtom)

	// Cache API clients per idTag + token combination
	const apiClientsRef = React.useRef<Map<string, ApiClient>>(new Map())

	const api = React.useMemo(() => {
		const idTag = apiState.idTag || auth?.idTag
		const token = auth?.token

		if (!idTag) return null

		// Create cache key
		const cacheKey = `${idTag}:${token || 'no-token'}`

		// Return cached client if exists
		if (apiClientsRef.current.has(cacheKey)) {
			return apiClientsRef.current.get(cacheKey)!
		}

		// Create new client
		const client = createApiClient({
			idTag,
			authToken: token,
		})

		// Cache it
		apiClientsRef.current.set(cacheKey, client)

		// Clean up old clients (keep last 10)
		if (apiClientsRef.current.size > 10) {
			const keys = Array.from(apiClientsRef.current.keys())
			const oldKey = keys[0]
			apiClientsRef.current.delete(oldKey)
		}

		return client
	}, [apiState.idTag, auth?.idTag, auth?.token])

	const setIdTag = React.useCallback((idTag: string) => setApiState({ idTag }), [setApiState])
	const authenticated = !!auth?.token

	return React.useMemo(() => ({
		api,
		authenticated,
		setIdTag
	}), [api, authenticated, setIdTag])
}

interface UseCloudillo {
	token?: string
	ownerTag: string
	fileId?: string
	idTag?: string
	tnId?: number
	roles?: string[]
}

export function useCloudillo(appNameArg?: string): UseCloudillo {
	const location = useLocation()
	const [auth, setAuth] = useAuth()
	const [appName, setAppName] = React.useState(appNameArg || '')
	const [fileId, setFileId] = React.useState<string | undefined>(undefined)
	const [ownerTag, setOwnerTag] = React.useState<string | undefined>(undefined)

	React.useEffect(function () {
		const [ownerTag, fileId] = location.hash.slice(1).split(':')
		setOwnerTag(ownerTag)
		setFileId(fileId)
	}, [location.hash])

	React.useEffect(function () {
		(async function init() {
			try {
				const token = await cloudillo.init(appName)
				setAuth({
					idTag: cloudillo.idTag,
					tnId: cloudillo.tnId ?? 0,
					roles: cloudillo.roles,
					token
				})
			} catch (e) {
				console.error('useCloudillo INIT ERROR', e)
			}
		})()
	}, [appName])

	const struct = React.useMemo(() => ({
		token: auth?.token,
		ownerTag: ownerTag || '',
		fileId,
		idTag: cloudillo.idTag,
		roles: cloudillo.roles
	}), [auth, ownerTag, fileId])

	return struct
}

export function useCloudilloEditor(appName: string) {
	const location = useLocation()
	const docId = location.hash.slice(1)
	const cl = useCloudillo(appName)
	const [yDoc, setYDoc] = React.useState<Y.Doc>(new Y.Doc())
	const [provider, setProvider] = React.useState<WebsocketProvider | undefined>(undefined)
	const [synced, setSynced] = React.useState(false)

	React.useEffect(function () {
		if (cl.token && docId) {
			(async function initDoc() {
				const { provider } = await cloudillo.openYDoc(yDoc, docId)
				setProvider(provider)

				// Wait for initial sync before marking as ready
				const handleSync = (isSynced: boolean) => {
					if (isSynced) {
						setSynced(true)
						provider.off('sync', handleSync)
					}
				}

				// Check if already synced
				if (provider.synced) {
					setSynced(true)
				} else {
					provider.on('sync', handleSync)
				}
			})()
		}
	}, [cl.token, docId])

	return {
		...cl,
		yDoc,
		provider,
		synced
	}
}

// vim: ts=4

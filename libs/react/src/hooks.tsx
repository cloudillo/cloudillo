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
import { apiFetchHelper, ApiFetchOpts } from '@cloudillo/base'

// useAuth() //
///////////////
export interface AuthState {
	tnId: number
	idTag?: string
	name?: string
	profilePic?: string
	roles?: string[]
	settings?: Record<string, unknown>
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

export function useApi() {
	const [auth] = useAuth()
	const [api, setApi] = useAtom(apiAtom)

	return React.useMemo(() => ({
		//get: async function get<R>(idTag: string, path: string, opts?: Omit<ApiFetchOpts<R, never>, 'authToken'>): Promise<R> {
		get: async function get<R>(idTag: string, path: string, opts?: ApiFetchOpts<R, never>): Promise<R> {
			console.log('GET', { idTag, path, opts, auth })
			return await apiFetchHelper(idTag || api.idTag || '', 'GET', path, { ...opts, authToken: opts?.authToken || auth?.token })
		},

		post: async function post<R, D = any>(idTag: string, path: string, opts?: Omit<ApiFetchOpts<R, D>, 'authToken'>): Promise<R> {
			return await apiFetchHelper(idTag || api.idTag || '', 'POST', path, { ...opts, authToken: auth?.token })
		},

		put: async function put<R, D = any>(idTag: string, path: string, opts?: Omit<ApiFetchOpts<R, D>, 'authToken'>): Promise<R> {
			return await apiFetchHelper(idTag || api.idTag || '', 'PUT', path, { ...opts, authToken: auth?.token })
		},

		patch: async function patch<R, D = any>(idTag: string, path: string, opts?: Omit<ApiFetchOpts<R, D>, 'authToken'>): Promise<R> {
			return await apiFetchHelper(idTag || api.idTag || '', 'PATCH', path, { ...opts, authToken: auth?.token })
		},

		delete: async function del<R>(idTag: string, path: string, opts?: Omit<ApiFetchOpts<R, never>, 'authToken'>): Promise<R> {
			return await apiFetchHelper(idTag || api.idTag || '', 'DELETE', path, { ...opts, authToken: auth?.token })
		},

		setIdTag: function setIdTag(idTag: string) {
			setApi({ idTag })
		},
		idTag: api.idTag
	}), [api.idTag])


	/*
	const [auth] = useAuth()
	const [api, setApi] = useAtom(apiAtom)
	const abortCtrlRef = React.useRef<AbortController | null>(null)

	const apiIface = {
		url: api.url,

		get: async function get<R>(idTag: string, path: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<R> {
			return await fetchIt(idTag, path, 'GET', undefined, query)
		},

		post: async function post<R, D = any>(idTag: string, path: string, data: D, query: Record<string, string | number | boolean | undefined> = {}): Promise<R> {
			return await fetchIt(idTag, path, 'POST', data, query)
		},

		put: async function put<R, D = any>(idTag: string, path: string, data: D, query: Record<string, string | number | boolean | undefined> = {}): Promise<R> {
			return await fetchIt(idTag, path, 'PUT', data, query)
		},

		patch: async function patch<R, D = any>(idTag: string, path: string, data: D, query: Record<string, string | number | boolean | undefined> = {}): Promise<R> {
			return await fetchIt(idTag, path, 'PATCH', data, query)
		},

		delete: async function del<R>(idTag: string, path: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<R> {
			return await fetchIt(idTag, path, 'DELETE', undefined, query)
		}
	}

	return React.useMemo(() => apiIface, [auth])
	*/
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
			console.log('useCloudillo XXXXXXXXXXXXXXXXXXXXXXXXXX init start')
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
			console.log('useCloudillo XXXXXXXXXXXXXXXXXXXXXXXXXX init end')
		})()
	}, [appName])

	const struct = React.useMemo(() => ({
		token: auth?.token,
		ownerTag: ownerTag || '',
		fileId,
		idTag: cloudillo.idTag,
		roles: cloudillo.roles
	}), [auth, ownerTag, fileId])

	console.log('cloudillo', struct, ownerTag, fileId)
	//if (!ownerTag || !fileId) return
	return struct
}

export function useCloudilloEditor(appName: string) {
	const location = useLocation()
	const docId = location.hash.slice(1)
	const cl = useCloudillo(appName)
	const [yDoc, setYDoc] = React.useState<Y.Doc>(new Y.Doc())
	const [provider, setProvider] = React.useState<WebsocketProvider | undefined>(undefined)

	React.useEffect(function () {
		console.log('cl.token', cl.token, 'docId', docId)
		if (cl.token && docId) {
			(async function initDoc() {
				const { provider } = await cloudillo.openYDoc(yDoc, docId)
				//setYDoc(yDoc)
				setProvider(provider)
				console.log('doc', yDoc)
			})()
		}
	}, [cl.token, docId])

	return {
		...cl,
		yDoc,
		provider
	}
}

// vim: ts=4

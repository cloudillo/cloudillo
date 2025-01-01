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

// Utility functions //
///////////////////////
export function qs(obj: Record<string, string | number | boolean | string[] | number[] | undefined>) {
	var str: string[] = []
	for (var f in obj) {
		const val = obj[f]
		if (obj.hasOwnProperty(f) && val !== undefined) {
			str.push(encodeURIComponent(f) + '=' + encodeURIComponent(Array.isArray(val) ? val.join(',') : val))
		}
	}
	return str.join('&')
}

export function parseQS(qs: string) {
	const p = new URLSearchParams(qs)
	return Object.fromEntries(p.entries())
}

export type FetchResultError = {
	error: {
		code: string
		descr: string
	}
}

export class ServerError extends Error {
	code: string
	descr: string
	httpStatus: number

	constructor(code: string, descr: string, httpStatus: number = 400) {
		super(descr)
		this.code = code
		this.descr = descr
		this.httpStatus = httpStatus
	}
}

// useAuth() //
///////////////
export interface AuthState {
	idTag?: string
	name?: string
	roles?: number[]
	token?: string
}

const authAtom = atom<AuthState | undefined>(undefined)

export function useAuth() {
	return useAtom(authAtom)
}

// useAPI() //
//////////////
export interface ApiState {
	url?: string
	notifications: number
	messages: number
}

export interface ApiExtFields {
	$notifications?: number
	$messages?: number
}

export const apiAtom = atom<ApiState>({ notifications: 0, messages: 0 })

export function useApi() {
	const [auth] = useAuth()
	const [api, setApi] = useAtom(apiAtom)
	const abortCtrlRef = React.useRef<AbortController | null>(null)

	async function fetchIt<R, D = any>(idTag: string, path: string, method: string, data: D, query: Record<string, string | number | boolean | undefined> = {}): Promise<R> {
		console.log('FETCH', idTag, path, method)

		if (abortCtrlRef.current) {
			console.log('FETCH abort()')
			abortCtrlRef.current.abort()
			abortCtrlRef.current = null
		}
		abortCtrlRef.current = new AbortController()
		const res = await fetch(`https://${idTag}/api${path}` + (query ? '?' + qs(query) : ''), {
			method,
			headers: {
				'Content-Type': 'application/json',
				...(auth?.token ? { 'Authorization': `Bearer ${auth?.token}` } : {})
			},
			credentials: 'include',
			body: method != 'GET' ? JSON.stringify(data) : undefined,
			signal: abortCtrlRef.current.signal
		})
		abortCtrlRef.current = null
		//console.log('RES', res)
		const textRes = await res.text()
		if (res.ok) {
			const j: (R & ApiExtFields & {error?: undefined}) | FetchResultError = JSON.parse(textRes)
			if (j && j.error) {
				console.log('FETCH:', j)
				throw new Error((j as FetchResultError).error.code)
			} else {
				return j as R
			}
		} else {
			try {
				const j: FetchResultError = await JSON.parse(textRes)
				console.log('FETCH ERROR', res, j)
				throw new ServerError(j.error.code, j.error.descr, res.status)
			} catch (err) {
				throw new ServerError(`SYS-HTTP-${res.status}`, textRes, res.status)
			}
		}
	}

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
}

interface UseCloudillo {
	token?: string
	ownerTag: string
	fileId?: string
	idTag?: string
	roles?: number[]
}

export function useCloudillo(appName: string): UseCloudillo {
	const location = useLocation()
	const [auth, setAuth] = useAuth()
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

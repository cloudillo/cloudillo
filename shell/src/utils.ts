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
import dayjs from 'dayjs'
import * as T from '@symbion/runtype'

import { useAuth } from '@cloudillo/react'

// Query string handling
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

// Delay asynchronously
export async function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(() => resolve(), ms))
}

export const format = {
	integer: function integer(n: number | undefined) {
		return n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'
	},

	number: function number(n: number | undefined) {
		return n ? n.toLocaleString() : '-'
	},

	currency: function currency(n: number | undefined) {
		return n ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
	}
}

// Date format
export function humanDate(dt: dayjs.Dayjs) {
	if (dt.isSame(dayjs(), 'day')) {
		return 'TODAY'
	} else if (dt.isSame(dayjs().subtract(1, 'day'), 'day')) {
		return 'YESTERDAY'
	} else {
		return dt.format('YY/MM/DD')
	}
}

// Base64 string to array buffer
export function base64ToArrayBuffer(b64str: string): Uint8Array {
	// Fix padding
	const padding = '='.repeat((4 - b64str.length % 4) % 4)
	// Convert URL padding to standard padding
	const base64 = (b64str + padding).replace(/-/g, '+').replace(/_/g, '/')

	const str = atob(base64)
	let ret = new Uint8Array(str.length)
	for (let i = 0; i < str.length; ++i) {
		ret[i] = str.charCodeAt(i)
	}
	return ret
}

export function arrayBufferToBase64(buffer: Uint8Array): string {
	return btoa(String.fromCharCode(...buffer))
}

export function arrayBufferToBase64Url(buffer: Uint8Array): string {
	return arrayBufferToBase64(buffer).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

// Call a JSON POST API endpoint with fetch()
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

// useAppConfig() //
////////////////////
export interface AppConfig {
	id: string
	url: string
	trust?: boolean
}

export interface MenuItem {
	id: string
	icon?: React.ComponentType
	label: string
	path: string
	public?: boolean
	perm?: string
}

export interface AppConfigState {
	apps: AppConfig[]
	mime: Record<string, string>
	menu: MenuItem[]
	menuEx: MenuItem[]
	defaultMenu?: string
}

const appConfigAtom = atom<AppConfigState | undefined>(undefined)

export function useAppConfig() {
	return useAtom(appConfigAtom)
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { atom, useAtom } from 'jotai'
import dayjs from 'dayjs'

// Query string handling
export function qs(
	obj: Record<string, string | number | boolean | string[] | number[] | undefined>
) {
	const str: string[] = []
	for (const f in obj) {
		const val = obj[f]
		if (Object.hasOwn(obj, f) && val !== undefined) {
			str.push(
				encodeURIComponent(f) +
					'=' +
					encodeURIComponent(Array.isArray(val) ? val.join(',') : val)
			)
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
	return new Promise((resolve) => setTimeout(() => resolve(), ms))
}

export const format = {
	integer: function integer(n: number | undefined) {
		return n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'
	},

	number: function number(n: number | undefined) {
		return n ? n.toLocaleString() : '-'
	},

	currency: function currency(n: number | undefined) {
		return n
			? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
			: '-'
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
	const padding = '='.repeat((4 - (b64str.length % 4)) % 4)
	// Convert URL padding to standard padding
	const base64 = (b64str + padding).replace(/-/g, '+').replace(/_/g, '/')

	const str = atob(base64)
	const ret = new Uint8Array(str.length)
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

/**
 * Trust levels for microfrontend apps:
 * - 'trusted': First-party apps with full storage access (allow-same-origin)
 * - 'semi-trusted': Verified third-party apps with storage access (allow-same-origin)
 * - 'untrusted': Unverified apps with sandboxed storage (no allow-same-origin, opaque origin)
 */
export type TrustLevel = 'trusted' | 'semi-trusted' | 'untrusted'

export interface AppConfig {
	id: string
	url: string
	trust?: TrustLevel | boolean // boolean for backwards compatibility
}

export interface MenuItem {
	id: string
	icon?: React.ComponentType
	label: string
	trans?: Record<string, string>
	path: string
	public?: boolean
	perm?: string
}

export interface AppConfigState {
	apps: AppConfig[]
	mime: Record<string, string>
	menu: MenuItem[]
	defaultMenu?: string
}

const appConfigAtom = atom<AppConfigState | undefined>(undefined)

export function useAppConfig() {
	return useAtom(appConfigAtom)
}

// vim: ts=4

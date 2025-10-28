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

import * as T from '@symbion/runtype'

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

// Fetch helper
export class FetchError extends Error {
	code: string
	descr: string
	httpStatus: number

	constructor(code: string, descr: string, httpStatus: number = 400) {
		console.log('FetchError', code, descr, httpStatus)
		super(descr)
		this.code = code
		this.descr = descr
		this.httpStatus = httpStatus
	}
}


export interface ApiFetchOpts<R, D> {
	type?: T.Type<R>
	data?: D
	query?: Record<string, string | number | boolean | string[] | undefined>
	authToken?: string
}
export async function apiFetchHelper<R, D = any>(idTag: string, method: string, path: string, opts: ApiFetchOpts<R, D>): Promise<R> {
	if (!idTag) throw new Error('No idTag in API call')

	const abortCtrl = new AbortController()
	const url = `https://cl-o.${idTag}/api${path}`
	const res = await fetch(url + (opts.query ? '?' + qs(opts.query) : ''), {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(opts.authToken ? { 'Authorization': `Bearer ${opts.authToken}` } : {})
		},
		credentials: 'include',
		body: method != 'GET' ? JSON.stringify(opts.data) : undefined,
		signal: abortCtrl.signal
	})
	const textRes = await res.text()
	if (res.ok) {
		let j
		try {
			j = JSON.parse(textRes)
		} catch (err) {
			console.log('API-PARSE-JSON', err instanceof Error ? err.toString(): err, { idTag, method, path })
			throw new FetchError(`API-PARSE-JSON`, textRes, res.status)
		}
		if (!opts.type) return j
		const d = T.decode(opts.type, j, { coerceDate: true, unknownFields: 'drop' })
		if (T.isErr(d)) {
			console.log('RES:', j)
			throw new FetchError('API-PARSE-TYPE', d.err.map(err => `${err.path.join('.')}: ${err.error}`).join(', '))
		}
		return d.ok
	} else {
		throw new FetchError(`API-HTTP-${res.status}`, textRes, res.status)
	}
}


// vim: ts=4

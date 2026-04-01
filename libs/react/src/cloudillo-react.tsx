// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

// Utility functions //
///////////////////////
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

// vim: ts=4

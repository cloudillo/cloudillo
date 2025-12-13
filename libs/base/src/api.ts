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

import { getApiUrl } from './urls.js'

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Response metadata from API envelope
 */
export interface ApiResponseMeta {
	/** Unix timestamp of response */
	time?: number
	/** Request ID for tracing */
	reqId?: string
	/** Pagination info (list endpoints only) */
	pagination?: {
		offset: number
		limit: number
		total: number
	}
}

/**
 * Structured error from API
 */
export interface ApiErrorDetails {
	code: string
	message: string
}

/**
 * Result with metadata
 */
export interface ApiFetchResult<R> {
	data: R
	meta: ApiResponseMeta
}

// Query string handling
export function qs(
	obj: Record<string, string | number | boolean | string[] | number[] | undefined>
) {
	var str: string[] = []
	for (var f in obj) {
		const val = obj[f]
		if (obj.hasOwnProperty(f) && val !== undefined) {
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

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Fetch error with structured API error code support
 */
export class FetchError extends Error {
	code: string
	descr: string
	httpStatus: number
	/** Structured error code from API (e.g., "E-AUTH-UNAUTH") */
	apiErrorCode?: string

	constructor(code: string, descr: string, httpStatus: number = 400, apiErrorCode?: string) {
		console.log('FetchError', code, descr, httpStatus, apiErrorCode)
		super(descr)
		this.code = code
		this.descr = descr
		this.httpStatus = httpStatus
		this.apiErrorCode = apiErrorCode
	}

	/** Check if this is a specific API error code */
	is(errorCode: string): boolean {
		return this.apiErrorCode === errorCode
	}
}

export interface ApiFetchOpts<R, D> {
	type?: T.Type<R>
	data?: D
	query?: Record<string, string | number | boolean | string[] | undefined>
	authToken?: string
	/** Optional request ID for tracing */
	requestId?: string
	/** Return metadata in addition to data */
	returnMeta?: boolean
}
/**
 * Helper function to unwrap API response envelope
 * Handles both old format (direct data) and new format ({ data, time, reqId, pagination })
 */
function unwrapResponseEnvelope(response: any): { data: any; meta: ApiResponseMeta } {
	// Extract metadata from envelope
	const meta: ApiResponseMeta = {
		time: response.time,
		reqId: response.reqId,
		pagination: response.pagination
	}

	// Check for new envelope format - if 'data' field exists, use it
	// Otherwise, the entire response is the data (old format)
	const data = response.data !== undefined ? response.data : response

	return { data, meta }
}

/**
 * Overload signatures
 */
export async function apiFetchHelper<R, D = any>(
	idTag: string,
	method: string,
	path: string,
	opts: ApiFetchOpts<R, D> & { returnMeta: true }
): Promise<ApiFetchResult<R>>

export async function apiFetchHelper<R, D = any>(
	idTag: string,
	method: string,
	path: string,
	opts: ApiFetchOpts<R, D>
): Promise<R>

/**
 * Main implementation
 */
export async function apiFetchHelper<R, D = any>(
	idTag: string,
	method: string,
	path: string,
	opts: ApiFetchOpts<R, D>
): Promise<R | ApiFetchResult<R>> {
	if (!idTag) throw new Error('No idTag in API call')

	const abortCtrl = new AbortController()
	const url = `${getApiUrl(idTag)}${path}`

	// Build headers
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	}
	if (opts.authToken) {
		headers['Authorization'] = `Bearer ${opts.authToken}`
	}
	if (opts.requestId) {
		headers['X-Request-ID'] = opts.requestId
	}

	const res = await fetch(url + (opts.query ? '?' + qs(opts.query) : ''), {
		method,
		headers,
		credentials: 'include',
		body: method != 'GET' ? JSON.stringify(opts.data) : undefined,
		signal: abortCtrl.signal
	})

	const textRes = await res.text()

	if (res.ok) {
		// Handle empty responses (e.g., 204 No Content)
		if (!textRes || textRes.trim() === '') {
			const emptyMeta: ApiResponseMeta = {
				time: undefined,
				reqId: undefined,
				pagination: undefined
			}
			return (opts.returnMeta ? { data: undefined, meta: emptyMeta } : undefined) as
				| R
				| ApiFetchResult<R>
		}

		let j
		try {
			j = JSON.parse(textRes)
		} catch (err) {
			console.log('API-PARSE-JSON', err instanceof Error ? err.toString() : err, {
				idTag,
				method,
				path
			})
			throw new FetchError(`API-PARSE-JSON`, textRes, res.status)
		}

		// Unwrap envelope (handles both old and new format)
		const { data, meta } = unwrapResponseEnvelope(j)

		// If no type specified, return data as-is
		if (!opts.type) {
			return opts.returnMeta ? { data, meta } : data
		}

		// Validate with runtype
		const d = T.decode(opts.type, data, { coerceDate: true, unknownFields: 'drop' })
		if (T.isErr(d)) {
			console.log('RES:', j)
			throw new FetchError(
				'API-PARSE-TYPE',
				d.err.map((err) => `${err.path.join('.')}: ${err.error}`).join(', ')
			)
		}

		return opts.returnMeta ? { data: d.ok, meta } : d.ok
	} else {
		// Parse structured error response
		let apiErrorCode: string | undefined
		let errorMessage = textRes

		try {
			const errorBody = JSON.parse(textRes)
			if (errorBody.error && errorBody.error.code) {
				apiErrorCode = errorBody.error.code
				errorMessage = errorBody.error.message
			}
		} catch (e) {
			// Not JSON or no structured error, use plain text
		}

		throw new FetchError(
			apiErrorCode || `API-HTTP-${res.status}`,
			errorMessage,
			res.status,
			apiErrorCode
		)
	}
}

// vim: ts=4

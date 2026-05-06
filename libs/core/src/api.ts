// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as T from '@symbion/runtype'

import { getApiUrl } from './urls.js'

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Cursor-based pagination info from API response
 */
export interface CursorPaginationMeta {
	nextCursor: string | null
	hasMore: boolean
}

/**
 * Response metadata from API envelope
 */
export interface ApiResponseMeta {
	/** Unix timestamp of response */
	time?: number
	/** Request ID for tracing */
	reqId?: string
	/** Pagination info (list endpoints only) - deprecated offset-based */
	pagination?: {
		offset: number
		limit: number
		total: number
	}
	/** Cursor-based pagination info (list endpoints) */
	cursorPagination?: CursorPaginationMeta
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
	/** Optional structured payload from `ErrorResponse.error.details` (camelCase, untyped). */
	details?: unknown

	constructor(
		code: string,
		descr: string,
		httpStatus: number = 400,
		apiErrorCode?: string,
		details?: unknown
	) {
		super(descr)
		this.code = code
		this.descr = descr
		this.httpStatus = httpStatus
		this.apiErrorCode = apiErrorCode
		this.details = details
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
	/** Optional custom headers */
	headers?: Record<string, string>
	/** Return metadata in addition to data */
	returnMeta?: boolean
	/** Send the body verbatim instead of JSON-encoding `data`. When set, `data` is ignored.
	 *  Set Content-Type via `headers`. */
	rawBody?: string
}
/**
 * Helper function to unwrap API response envelope
 * Handles both old format (direct data) and new format ({ data, time, reqId, pagination, cursorPagination })
 */
function unwrapResponseEnvelope(response: unknown): { data: unknown; meta: ApiResponseMeta } {
	const res = response as Record<string, unknown>
	// Extract metadata from envelope
	const meta: ApiResponseMeta = {
		time: res.time as number | undefined,
		reqId: res.reqId as string | undefined,
		pagination: res.pagination as ApiResponseMeta['pagination'],
		cursorPagination: res.cursorPagination as ApiResponseMeta['cursorPagination']
	}

	// Check for new envelope format - if 'data' field exists, use it
	// Otherwise, the entire response is the data (old format)
	const data = res.data !== undefined ? res.data : response

	return { data, meta }
}

/**
 * Overload signatures
 */
export async function apiFetchHelper<R, D = unknown>(
	idTag: string,
	method: string,
	path: string,
	opts: ApiFetchOpts<R, D> & { returnMeta: true }
): Promise<ApiFetchResult<R>>

export async function apiFetchHelper<R, D = unknown>(
	idTag: string,
	method: string,
	path: string,
	opts: ApiFetchOpts<R, D>
): Promise<R>

/**
 * Main implementation
 */
export async function apiFetchHelper<R, D = unknown>(
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
		'Content-Type': 'application/json',
		...opts.headers
	}
	if (opts.authToken) {
		headers.Authorization = `Bearer ${opts.authToken}`
	}
	if (opts.requestId) {
		headers['X-Request-ID'] = opts.requestId
	}

	const body =
		method === 'GET'
			? undefined
			: opts.rawBody !== undefined
				? opts.rawBody
				: JSON.stringify(opts.data)

	const res = await fetch(url + (opts.query ? '?' + qs(opts.query) : ''), {
		method,
		headers,
		credentials: 'include',
		body,
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

		let j: unknown
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
			return (opts.returnMeta ? { data, meta } : data) as R | ApiFetchResult<R>
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
		let errorDetails: unknown

		try {
			// Expected envelope: `{ error: { code?, message?, details? } }`.
			// Any truthy `error` field triggers the structured-extract; legacy or
			// non-object shapes leave the inner fields as undefined and fall back
			// to the plain-text response.
			const errorBody = JSON.parse(textRes)
			if (errorBody && typeof errorBody === 'object' && errorBody.error) {
				apiErrorCode = errorBody.error.code
				if (errorBody.error.message) errorMessage = errorBody.error.message
				errorDetails = errorBody.error.details
			}
		} catch (_e) {
			// Not JSON or no structured error, use plain text
		}

		throw new FetchError(
			apiErrorCode || `API-HTTP-${res.status}`,
			errorMessage,
			res.status,
			apiErrorCode,
			errorDetails
		)
	}
}

// vim: ts=4

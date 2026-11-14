// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as T from '@symbion/runtype'

import { getApiUrl } from './urls.js'

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Envelope metadata: every `/api/**` JSON success response is `{data, next?, total?}`.
 * `next` is the opaque cursor of the next page (absent on the last page); `total` comes
 * only with search's first page and `count=true`. The request id is the `X-Request-ID`
 * response header, not part of the body.
 */
export interface ApiResponseMeta {
	next?: string
	total?: number
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
	const p = new URLSearchParams()
	for (const f in obj) {
		const val = obj[f]
		if (Object.hasOwn(obj, f) && val !== undefined) {
			p.set(f, Array.isArray(val) ? val.join(',') : String(val))
		}
	}
	return p.toString()
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
	/** Structured error code from API (e.g., "E-AUTH-UNAUTHENTICATED") */
	apiErrorCode?: string
	/** Optional structured payload from `ErrorResponse.error.details` (camelCase, untyped). */
	details?: unknown
	/** True when the auth-recovery path judged this a dead home session
	 *  (a "Session expired" toast + redirect to /login has already fired). */
	sessionExpired = false

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

/** True when this error represents a home session that recovery judged dead
 *  (a "Session expired" toast + redirect to /login has already been shown). */
export function isSessionExpiredError(err: unknown): boolean {
	return err instanceof FetchError && err.sessionExpired
}

/** True when the server has no such route (`E-CORE-NOROUTE`): the endpoint is not supported by
 *  that server's version, as opposed to a missing item. */
export function isNoRouteError(err: unknown): boolean {
	return err instanceof FetchError && err.is('E-CORE-NOROUTE')
}

/** Called with the `X-Cloudillo-Version` header of every `apiFetchHelper` response that has one,
 *  along with the idTag the request went to. The shell decides which idTag is the home node. */
let serverVersionListener: ((idTag: string, version: string) => void) | undefined

export function onServerVersion(cb: ((idTag: string, version: string) => void) | undefined) {
	serverVersionListener = cb
}

/** Shape of `FetchError.details` for rate-limit errors: E-RATE-BANNED carries
 *  `remainingSecs` (null = permanent), E-RATE-LIMITED carries `level` and
 *  `retryAfter` (seconds). Mirrors the cloudillo-rs error registry. */
export interface RateLimitErrorDetails {
	remainingSecs?: number | null
	level?: string
	retryAfter?: number
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
	/** Abort the request when this signal fires (superseded search queries, unmount). */
	signal?: AbortSignal
}
/** Splits the `{data, next?, total?}` envelope into data and meta. */
function unwrapResponseEnvelope(response: unknown): { data: unknown; meta: ApiResponseMeta } {
	const res = response as Record<string, unknown>
	const meta: ApiResponseMeta = {
		next: typeof res.next === 'string' ? res.next : undefined,
		total: typeof res.total === 'number' ? res.total : undefined
	}
	return { data: res.data, meta }
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
 *
 * An aborted request (`opts.signal`) rejects with a `DOMException` named
 * `AbortError`, *not* a `FetchError` — callers branching on `httpStatus` must
 * check `err.name === 'AbortError'` first.
 */
export async function apiFetchHelper<R, D = unknown>(
	idTag: string,
	method: string,
	path: string,
	opts: ApiFetchOpts<R, D>
): Promise<R | ApiFetchResult<R>> {
	if (!idTag) throw new Error('No idTag in API call')

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
		signal: opts.signal
	})

	// Optional chain: test doubles for fetch often omit headers.
	const serverVersion = res.headers?.get('X-Cloudillo-Version')
	if (serverVersion) serverVersionListener?.(idTag, serverVersion)

	const textRes = await res.text()

	if (res.ok) {
		// Handle empty responses (e.g., 204 No Content)
		if (!textRes || textRes.trim() === '') {
			const emptyMeta: ApiResponseMeta = {}
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

		// The backend always wraps responses; anything else is a proxy or error page.
		if (typeof j !== 'object' || j === null || Array.isArray(j) || !Object.hasOwn(j, 'data')) {
			throw new FetchError('API-PARSE-JSON', textRes, res.status)
		}

		// Unwrap the {data, next?, total?} envelope
		const { data, meta } = unwrapResponseEnvelope(j)

		// If no type specified, return data as-is
		if (!opts.type) {
			return (opts.returnMeta ? { data, meta } : data) as R | ApiFetchResult<R>
		}

		// Validate with runtype
		const d = T.decode(opts.type, data, {
			coerceDate: true,
			unknownFields: 'drop',
			onSkip: (e) =>
				console.warn(
					'API-SKIP-ITEM',
					path.split('?')[0],
					e.map((x) => `${x.path.join('.')}: ${x.error}`)
				)
		})
		if (T.isErr(d)) {
			throw new FetchError(
				'API-PARSE-TYPE',
				d.err.map((err) => `${err.path.join('.')}: ${err.error}`).join(', ')
			)
		}

		return opts.returnMeta ? { data: d.ok, meta } : d.ok
	} else {
		throw fetchErrorFromResponse(res.status, textRes)
	}
}

/** Build the `FetchError` for a non-OK response from its status and body text */
export function fetchErrorFromResponse(status: number, textRes: string): FetchError {
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

	return new FetchError(
		apiErrorCode || `API-HTTP-${status}`,
		errorMessage,
		status,
		apiErrorCode,
		errorDetails
	)
}

// vim: ts=4

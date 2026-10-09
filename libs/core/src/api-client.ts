// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as T from '@symbion/runtype'

import { type ApiFetchResult, apiFetchHelper, FetchError } from './api.js'
import * as Types from './api-types.js'
import { jwtExpiryDate } from './jwt.js'
import { getInstanceUrl } from './urls.js'

// Aborts are signaled via DOMException('AbortError'), not UploadError.
export type UploadErrorKind =
	| 'auth'
	| 'forbidden'
	| 'too_large'
	| 'server'
	| 'network'
	| 'invalid_response'

export class UploadError extends Error {
	readonly status?: number
	readonly statusText?: string
	readonly kind: UploadErrorKind
	/** Backend error code from the `{ error: { code } }` envelope, when present. */
	readonly apiErrorCode?: string
	/** Backend human message from `{ error: { message } }`, when present. */
	readonly detail?: string
	constructor(
		kind: UploadErrorKind,
		message: string,
		status?: number,
		statusText?: string,
		apiErrorCode?: string,
		detail?: string
	) {
		super(message)
		this.name = 'UploadError'
		this.kind = kind
		this.status = status
		this.statusText = statusText
		this.apiErrorCode = apiErrorCode
		this.detail = detail
	}

	static kindFromHttpStatus(status: number): UploadErrorKind {
		if (status === 401) return 'auth'
		if (status === 403) return 'forbidden'
		if (status === 413) return 'too_large'
		if (status >= 500) return 'server'
		return 'invalid_response'
	}
}

export interface AuthErrorInfo {
	idTag: string
	/** Set when the failing client holds a hatted token (`contextKey(idTag, hat)`). */
	hat?: string
	httpStatus: number
	apiErrorCode?: string
}
/** Result a handler may return so the failed request can be retried. */
export interface AuthRecovery {
	/** Fresh token to retry the failed request with, when recovery succeeded. */
	token?: string
	/** True when the handler terminally handled a dead session (toast + redirect
	 *  already shown); the failing request should reject quietly. */
	handled?: boolean
}
export type AuthErrorHandler = (
	info: AuthErrorInfo
) => undefined | Promise<AuthRecovery | undefined>

let authErrorHandler: AuthErrorHandler | undefined

/** Register a process-wide handler invoked when an authenticated request fails
 *  with HTTP 401 using the client's own (non-scoped) token. Pass undefined to clear. */
export function setAuthErrorHandler(handler: AuthErrorHandler | undefined): void {
	authErrorHandler = handler
}

/** Wire params for `GET /search`, shared so a new filter cannot reach only one of
 *  the two `search` methods that send them. */
function searchQueryParams(query: Types.SearchQuery) {
	return {
		q: query.q,
		type: query.type,
		fileId: query.fileId,
		contentType: query.contentType,
		tags: query.tags,
		limit: query.limit,
		offset: query.offset
	}
}

/**
 * Options for creating an API client
 */
export interface ApiClientOpts {
	/** Authentication token (optional, can be provided per-request) */
	authToken?: string
	/** Identity tag of the tenant */
	idTag: string
	/** Community whose hat the client's token was minted under; reported to the
	 *  auth-error handler so a hatted 401 re-handshakes instead of refreshing. */
	hat?: string
}

/**
 * Type-safe API client for Cloudillo backend
 *
 * Provides strongly-typed methods for all API endpoints with automatic
 * response validation using runtype.
 *
 * @example
 * ```typescript
 * const api = createApiClient({
 *   idTag: 'alice',
 *   authToken: 'jwt-token'
 * })
 *
 * // Login
 * const result = await api.auth.login({
 *   idTag: 'alice',
 *   password: 'secret'
 * })
 *
 * // Create action
 * const action = await api.actions.create({
 *   type: 'POST',
 *   content: 'Hello world!'
 * })
 * ```
 */
export class ApiClient {
	private opts: ApiClientOpts
	/** When `opts.authToken` dies. Undefined = no known expiry (never reaped). */
	private authExpiresAt?: Date
	/**
	 * Whether this client stands for a logged-in session, as opposed to a
	 * guest/anonymous one. Stays true when the token is dropped for having
	 * expired, and only goes false on an explicit `setAuthToken(undefined)` —
	 * that distinction is what lets an expired session still reach 401 recovery.
	 */
	private authenticatedClient: boolean

	constructor(opts: ApiClientOpts) {
		this.opts = opts
		this.authExpiresAt = jwtExpiryDate(opts.authToken)
		this.authenticatedClient = !!opts.authToken
	}

	/**
	 * Get the idTag of the tenant this API client is configured for
	 */
	get idTag(): string {
		return this.opts.idTag
	}

	/**
	 * Update the auth token used by subsequent requests, and with it the instant
	 * the client stops considering itself authenticated. `expiresAt` defaults to
	 * the token's own `exp` claim, so callers cannot forget it; pass one only
	 * where a different rule applies (a lifetime handed down by the shell, say).
	 * Clearing the token clears the expiry too.
	 *
	 * Token reads happen lazily inside `request()` / `requestWithMeta()`, so
	 * mutating it here is safe — in-flight requests keep the value they captured;
	 * future requests pick up the new one. Lets `useApi` keep one client across
	 * JWT rotations (the client's identity stays referentially stable, which
	 * matters for any `useEffect`/`useMemo` that depends on the api object).
	 */
	setAuthToken(token: string | undefined, expiresAt?: Date): void {
		this.opts.authToken = token
		this.authExpiresAt = token ? (expiresAt ?? jwtExpiryDate(token)) : undefined
		this.authenticatedClient = !!token
	}

	/**
	 * The token to authenticate with, or undefined when there is none — the one
	 * place expiry is checked. An expired token is dropped here (lazily, on
	 * read), so a client that outlives its token stops sending it rather than
	 * collecting 401s.
	 */
	getAuthToken(): string | undefined {
		if (this.authExpiresAt && this.authExpiresAt.getTime() <= Date.now()) {
			this.opts.authToken = undefined
			this.authExpiresAt = undefined
		}
		return this.opts.authToken
	}

	/**
	 * True when this client holds a token that has not expired. Pure — unlike
	 * `getAuthToken()` it does NOT reap. React callers compute this during render
	 * (`useApi()` in libs/react/src/hooks.tsx), where dropping the token as a
	 * side effect would lose it with nothing scheduling a re-render; the reaping
	 * stays on the request path.
	 */
	hasValidToken(): boolean {
		if (!this.opts.authToken) return false
		return !this.authExpiresAt || this.authExpiresAt.getTime() > Date.now()
	}

	private async handleAuthError(
		err: unknown,
		perRequestToken: string | undefined
	): Promise<AuthRecovery | undefined> {
		if (
			authErrorHandler &&
			err instanceof FetchError &&
			err.httpStatus === 401 && // 401 only — never 403 (permission denials stay errors)
			!perRequestToken && // used the client's own token, not a scoped per-request token
			// Deliberately NOT getAuthToken(): the question is "does this client
			// stand for a session", and an expired token is the very case recovery
			// exists for. Gating on the live token returns those 401s unrecovered.
			this.authenticatedClient // authenticated client only — excludes guest/anonymous clients
		) {
			const recovery = await authErrorHandler({
				idTag: this.opts.idTag,
				hat: this.opts.hat,
				httpStatus: err.httpStatus,
				apiErrorCode: err.apiErrorCode
			})
			return recovery ?? undefined
		}
		return undefined
	}

	/**
	 * Make a request with automatic response validation
	 */
	async request<Res>(
		method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
		path: string,
		responseType: T.Type<Res>,
		options?: {
			data?: unknown
			query?: Record<string, string | number | boolean | string[] | undefined>
			authToken?: string
			requestId?: string
			headers?: Record<string, string>
			skipAuthRecovery?: boolean
			signal?: AbortSignal
		}
	): Promise<Res> {
		const send = (authToken: string | undefined) =>
			apiFetchHelper<Res, unknown>(this.opts.idTag, method, path, {
				type: responseType,
				data: options?.data,
				query: options?.query,
				authToken,
				requestId: options?.requestId,
				headers: options?.headers,
				signal: options?.signal
			})
		try {
			return await send(options?.authToken || this.getAuthToken())
		} catch (err) {
			// A cancelled request never reached a verdict, so there is nothing to
			// recover from — and a token refresh per superseded keystroke would cost
			// more than the request it replaced.
			if (options?.signal?.aborted) throw err
			if (options?.skipAuthRecovery) throw err
			const recovery = await this.handleAuthError(err, options?.authToken)
			if (recovery?.token) {
				this.setAuthToken(recovery.token)
				return await send(recovery.token) // single retry with the refreshed token
			}
			if (recovery?.handled && err instanceof FetchError) {
				err.sessionExpired = true // recovery already redirected — caller should reject quietly
			}
			throw err // preserve existing behaviour — callers still see the FetchError
		}
	}

	/**
	 * Make a request and return metadata (time, reqId, pagination)
	 */
	async requestWithMeta<Res>(
		method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
		path: string,
		responseType: T.Type<Res>,
		options?: {
			data?: unknown
			query?: Record<string, string | number | boolean | string[] | undefined>
			authToken?: string
			requestId?: string
			skipAuthRecovery?: boolean
			signal?: AbortSignal
		}
	): Promise<ApiFetchResult<Res>> {
		const send = (authToken: string | undefined) =>
			apiFetchHelper<Res, unknown>(this.opts.idTag, method, path, {
				type: responseType,
				data: options?.data,
				query: options?.query,
				authToken,
				requestId: options?.requestId,
				returnMeta: true,
				signal: options?.signal
			})
		try {
			return await send(options?.authToken || this.getAuthToken())
		} catch (err) {
			// See `request` above: an aborted call is not an auth failure.
			if (options?.signal?.aborted) throw err
			if (options?.skipAuthRecovery) throw err
			const recovery = await this.handleAuthError(err, options?.authToken)
			if (recovery?.token) {
				this.setAuthToken(recovery.token)
				return await send(recovery.token) // single retry with the refreshed token
			}
			if (recovery?.handled && err instanceof FetchError) {
				err.sessionExpired = true // recovery already redirected — caller should reject quietly
			}
			throw err // preserve existing behaviour — callers still see the FetchError
		}
	}

	// ========================================================================
	// AUTH ENDPOINTS
	// ========================================================================

	/** Authentication endpoints */
	auth = {
		/** POST /auth/login - User login with password */
		login: (data: Types.LoginRequest) =>
			this.request('POST', '/auth/login', Types.tLoginResult, { data }),

		/** POST /auth/logout - User logout */
		logout: (data?: { apiKey?: string }) =>
			this.request('POST', '/auth/logout', T.nullValue, { data: data ?? {} }),

		/** GET /auth/login-token - Get login token for current session */
		getLoginToken: () =>
			this.request('GET', '/auth/login-token', T.nullable(Types.tLoginResult), {
				skipAuthRecovery: true
			}),

		/** POST /auth/login-init - Combined login initialization */
		loginInit: () =>
			this.request('POST', '/auth/login-init', Types.tLoginInitResult, { data: {} }),

		/** GET /auth/access-token - Get access token */
		getAccessToken: (query?: { scope?: string; token?: string; lifetime?: number }) =>
			this.request('GET', '/auth/access-token', Types.tAccessTokenResult, {
				query
			}),

		/** GET /auth/access-token?refId={refId} - Exchange ref for scoped access token (unauthenticated) */
		getAccessTokenByRef: (refId: string, options?: { refresh?: boolean }) =>
			this.request('GET', '/auth/access-token', Types.tRefAccessTokenResult, {
				query: { refId, refresh: options?.refresh }
			}),

		/** GET /auth/access-token?via=...&scope=... - Get scoped token via cross-document link */
		getAccessTokenVia: (via: string, scope: string) =>
			this.request('GET', '/auth/access-token', Types.tRefAccessTokenResult, {
				query: { via, scope }
			}),

		/** GET /auth/proxy-token - Get proxy token for federation (optionally wearing a hat) */
		getProxyToken: (idTag?: string, opts?: { hat?: string }) =>
			this.request('GET', '/auth/proxy-token', Types.tProxyTokenResult, {
				query: idTag || opts?.hat ? { idTag, hat: opts?.hat } : undefined
			}),

		/** GET /auth/vapid - Get VAPID public key for push notifications */
		getVapidPublicKey: () => this.request('GET', '/auth/vapid', Types.tGetVapidResult),

		/** POST /auth/password - Change password */
		changePassword: (data: Types.PasswordChangeRequest) =>
			this.request('POST', '/auth/password', T.nullValue, { data }),

		/** POST /auth/set-password - Set password using a reference token */
		setPassword: (data: Types.SetPasswordRequest) =>
			this.request('POST', '/auth/set-password', Types.tSetPasswordResult, { data }),

		/** POST /auth/forgot-password - Request password reset email */
		forgotPassword: (data: Types.ForgotPasswordRequest) =>
			this.request('POST', '/auth/forgot-password', Types.tPasswordResetResponse, { data }),

		// ====================================================================
		// WEBAUTHN ENDPOINTS
		// ====================================================================

		/** GET /auth/wa/reg - List WebAuthn credentials */
		listWebAuthnCredentials: () =>
			this.request('GET', '/auth/wa/reg', Types.tWebAuthnCredentialList),

		/** GET /auth/wa/reg/challenge - Get WebAuthn registration challenge */
		getWebAuthnRegChallenge: () =>
			this.request('GET', '/auth/wa/reg/challenge', Types.tWebAuthnRegChallengeResult),

		/** POST /auth/wa/reg - Register new WebAuthn credential */
		registerWebAuthnCredential: (data: Types.WebAuthnRegisterRequest) =>
			this.request('POST', '/auth/wa/reg', Types.tWebAuthnCredential, { data }),

		/** DELETE /auth/wa/reg/{credentialId} - Delete WebAuthn credential */
		deleteWebAuthnCredential: (credentialId: string) =>
			this.request('DELETE', `/auth/wa/reg/${encodeURIComponent(credentialId)}`, T.nullValue),

		/** GET /auth/wa/login/challenge - Get WebAuthn login challenge (public) */
		getWebAuthnLoginChallenge: () =>
			this.request('GET', '/auth/wa/login/challenge', Types.tWebAuthnLoginChallengeResult),

		/** POST /auth/wa/login - Authenticate with WebAuthn */
		webAuthnLogin: (data: Types.WebAuthnLoginRequest) =>
			this.request('POST', '/auth/wa/login', Types.tLoginResult, { data }),

		// ====================================================================
		// API KEY ENDPOINTS
		// ====================================================================

		/** GET /auth/api-keys - List API keys */
		listApiKeys: () => this.request('GET', '/auth/api-keys', Types.tApiKeyList),

		/** POST /auth/api-keys - Create new API key */
		createApiKey: (data: Types.CreateApiKeyRequest) =>
			this.request('POST', '/auth/api-keys', Types.tCreateApiKeyResult, { data }),

		/** PATCH /auth/api-keys/{keyId} - Update API key (name, scopes) */
		updateApiKey: (keyId: number, data: Types.UpdateApiKeyRequest) =>
			this.request('PATCH', `/auth/api-keys/${keyId}`, Types.tApiKeyListItem, { data }),

		/** DELETE /auth/api-keys/{keyId} - Delete API key */
		deleteApiKey: (keyId: number) =>
			this.request('DELETE', `/auth/api-keys/${keyId}`, T.nullValue),

		/** GET /auth/access-token?apiKey=... - Exchange API key for access token (unauthenticated) */
		getAccessTokenByApiKey: (apiKey: string) =>
			this.request('GET', '/auth/access-token', Types.tAccessTokenResult, {
				query: { apiKey }
			}),

		// ====================================================================
		// QR LOGIN ENDPOINTS
		// ====================================================================

		/** POST /auth/qr-login/init - Create QR login session */
		initQrLogin: () =>
			this.request('POST', '/auth/qr-login/init', Types.tQrLoginInitResult, { data: {} }),

		/** GET /auth/qr-login/{sessionId}/status - Poll QR login status */
		getQrLoginStatus: (sessionId: string, secret: string) =>
			this.request(
				'GET',
				`/auth/qr-login/${encodeURIComponent(sessionId)}/status`,
				Types.tQrLoginStatusResult,
				{ headers: { 'X-QR-Secret': secret } }
			),

		/** GET /auth/qr-login/{sessionId}/details - Get desktop browser info for approval */
		getQrLoginDetails: (sessionId: string) =>
			this.request(
				'GET',
				`/auth/qr-login/${encodeURIComponent(sessionId)}/details`,
				Types.tQrLoginDetailsResult
			),

		/** POST /auth/qr-login/{sessionId}/respond - Approve or deny QR login */
		respondQrLogin: (sessionId: string, data: Types.QrLoginRespondRequest) =>
			this.request(
				'POST',
				`/auth/qr-login/${encodeURIComponent(sessionId)}/respond`,
				Types.tQrLoginRespondResult,
				{ data }
			)
	}

	// ========================================================================
	// PROFILE ENDPOINTS
	// ========================================================================

	/** Profile creation endpoints (registration, community creation) */
	profile = {
		/** POST /profiles/verify - Verify profile identity availability (registration or community) */
		verify: (data: Types.VerifyProfileRequest) =>
			this.request('POST', '/profiles/verify', Types.tVerifyProfileResult, { data }),

		/** POST /profiles/register - Register new user or create community profile */
		register: (data: Types.RegisterRequest) =>
			this.request('POST', '/profiles/register', Types.tRegisterResult, { data }),

		/** GET /profiles/me/idp-status - Live IDP identity status for the active tenant. */
		idpStatus: () => this.request('GET', '/profiles/me/idp-status', Types.tIdpStatusResponse),

		/** POST /profiles/me/resend-activation - Re-send the IDP activation email. */
		resendActivation: () =>
			this.request('POST', '/profiles/me/resend-activation', Types.tResendActivationResponse)
	}

	// ========================================================================
	// ACTION ENDPOINTS
	// ========================================================================

	/** Action endpoints */
	actions = {
		/** GET /actions - List actions */
		list: (query?: Types.ListActionsQuery) =>
			this.request('GET', '/actions', Types.tListActionsResult, {
				query: query as Record<string, string | number | boolean | string[] | undefined>
			}),

		/** GET /actions - List actions with cursor pagination */
		listPaginated: async (query?: Types.ListActionsQuery) => {
			const result = await this.requestWithMeta('GET', '/actions', Types.tListActionsResult, {
				query: query as Record<string, string | number | boolean | string[] | undefined>
			})
			return {
				data: result.data,
				cursorPagination: result.meta.cursorPagination
			}
		},

		/** GET /actions?count=true - Aggregate row count for a query. */
		count: async (query?: Types.ListActionsQuery): Promise<number> => {
			const result = await this.requestWithMeta('GET', '/actions', Types.tListActionsResult, {
				query: { ...query, count: true } as Record<
					string,
					string | number | boolean | string[] | undefined
				>
			})
			return result.meta.cursorPagination?.count ?? 0
		},

		/** POST /actions - Create action */
		create: (data: Types.NewAction) =>
			this.request('POST', '/actions', Types.tActionView, { data }),

		/** GET /actions/:actionId - Get single action */
		get: (actionId: string) => this.request('GET', `/actions/${actionId}`, Types.tActionView),

		/** PATCH /actions/:actionId - Update action (draft only) */
		update: (actionId: string, patch: Types.PatchActionRequest) =>
			this.request('PATCH', `/actions/${actionId}`, Types.tActionView, {
				data: patch
			}),

		/** DELETE /actions/:actionId - Delete action */
		delete: (actionId: string) => this.request('DELETE', `/actions/${actionId}`, T.nullValue),

		/** POST /actions/:actionId/accept - Accept action */
		accept: (actionId: string) =>
			this.request('POST', `/actions/${actionId}/accept`, T.nullValue),

		/** POST /actions/:actionId/reject - Reject action */
		reject: (actionId: string) =>
			this.request('POST', `/actions/${actionId}/reject`, T.nullValue),

		/** POST /actions/:actionId/dismiss - Dismiss notification */
		dismiss: (actionId: string) =>
			this.request('POST', `/actions/${actionId}/dismiss`, T.nullValue),

		/** POST /actions/:actionId/reaction - Add reaction to action */
		addReaction: (actionId: string, data: Types.ReactionRequest) =>
			this.request('POST', `/actions/${actionId}/reaction`, Types.tReactionResponse, {
				data
			}),

		/** POST /actions/:actionId/publish - Publish a draft action */
		publish: (actionId: string, data?: Types.PublishActionRequest) =>
			this.request('POST', `/actions/${actionId}/publish`, Types.tActionView, {
				data: data ?? {}
			}),

		/** POST /actions/:actionId/cancel - Cancel a scheduled action (revert to draft) */
		cancel: (actionId: string) =>
			this.request('POST', `/actions/${actionId}/cancel`, Types.tActionView, {
				data: {}
			}),

		/** PUT /actions/:actionId/subscribe - Set the reader's thread-subscription */
		subscribe: (actionId: string, level: 'W' | 'T' | 'M' | null) =>
			this.request('PUT', `/actions/${actionId}/subscribe`, T.struct({}), {
				data: { level }
			}),

		/** PUT /read-marker - Forward-only read watermark on the reader's own node. */
		setReadMarker: (m: { scope: 'feed' | 'msg' | 'thread'; key: string; position: number }) =>
			this.request('PUT', '/read-marker', T.struct({}), {
				data: {
					scope: m.scope,
					key: m.key,
					position: new Date(m.position * 1000).toISOString()
				}
			})
	}

	// ========================================================================
	// FILE ENDPOINTS
	// ========================================================================

	/** File endpoints */
	files = {
		/** GET /files - List files */
		list: (query?: Types.ListFilesQuery) =>
			this.request('GET', '/files', Types.tListFilesResult, {
				query: query as Record<string, string | number | boolean | string[] | undefined>
			}),

		/** GET /files - List files with cursor pagination */
		listPaginated: async (query?: Types.ListFilesQuery) => {
			const result = await this.requestWithMeta('GET', '/files', Types.tListFilesResult, {
				query: query as Record<string, string | number | boolean | string[] | undefined>
			})
			return {
				data: result.data,
				cursorPagination: result.meta.cursorPagination
			}
		},

		/** POST /files - Create file (metadata-only: CRDT, RTDB, etc.) */
		create: (data: Types.CreateFileRequest) =>
			this.request('POST', '/files', Types.tCreateFileResult, { data }),

		/**
		 * POST /files/{preset}/{fileName} - Upload file blob
		 * @param preset - File preset (e.g., "profile", "cover", "gallery")
		 * @param fileName - File name
		 * @param fileData - File data (Blob, File, or ArrayBuffer)
		 * @param contentType - Content type of the file
		 * @param options.visibility - ABAC level the new file row is created with:
		 *   `P` Public (readable unauthenticated), `V` Verified, `F` Follower,
		 *   `C` Connected. Omit for the server's default — Direct for a personal
		 *   tenant, Connected for a community one. Site containers upload as `P`;
		 *   nothing else may be read without a token.
		 * @returns Upload result with file ID and optional thumbnail variant ID
		 */
		uploadBlob: (
			preset: string,
			fileName: string,
			fileData: Blob | File | ArrayBuffer,
			contentType?: string,
			options?: {
				rootId?: string
				parentId?: string
				as?: 'managed'
				visibility?: 'P' | 'V' | 'F' | 'C'
				channel?: string
				onProgress?: (pct: number) => void
				signal?: AbortSignal
			}
		) => {
			return new Promise<T.TypeOf<typeof Types.tUploadFileResult>>((resolve, reject) => {
				let url = `${getInstanceUrl(this.opts.idTag)}/api/files/${preset}/${fileName}`
				const qp = new URLSearchParams()
				if (options?.rootId) qp.set('rootId', options.rootId)
				if (options?.parentId) qp.set('parentId', options.parentId)
				if (options?.as) qp.set('as', options.as)
				if (options?.visibility) qp.set('visibility', options.visibility)
				if (options?.channel) qp.set('channel', options.channel)
				const qs = qp.toString()
				if (qs) url += '?' + qs

				const xhr = new XMLHttpRequest()
				xhr.open('POST', url)
				const type =
					contentType ||
					(fileData instanceof Blob && fileData.type) ||
					'application/octet-stream'
				xhr.setRequestHeader('Content-Type', type)
				const authToken = this.getAuthToken()
				if (authToken) {
					xhr.setRequestHeader('Authorization', `Bearer ${authToken}`)
				}
				xhr.withCredentials = true

				let abortListener: (() => void) | undefined
				let progressListener: ((e: ProgressEvent) => void) | undefined
				const cleanup = () => {
					if (abortListener && options?.signal) {
						options.signal.removeEventListener('abort', abortListener)
						abortListener = undefined
					}
					if (progressListener) {
						xhr.upload.removeEventListener('progress', progressListener)
						progressListener = undefined
					}
				}

				if (options?.onProgress) {
					progressListener = (e) => {
						if (e.lengthComputable) {
							options.onProgress!(Math.round((e.loaded / e.total) * 100))
						}
					}
					xhr.upload.addEventListener('progress', progressListener)
				}

				xhr.addEventListener('load', () => {
					cleanup()
					if (xhr.status < 200 || xhr.status >= 300) {
						let apiErrorCode: string | undefined
						let detail: string | undefined
						try {
							const body = JSON.parse(xhr.responseText)
							if (body && typeof body === 'object' && body.error) {
								apiErrorCode = body.error.code
								if (body.error.message) detail = body.error.message
							}
						} catch (_e) {
							// non-JSON / no structured error — fall back to status text
						}
						const msg = detail || `Upload failed: ${xhr.status} ${xhr.statusText}`
						const kind = UploadError.kindFromHttpStatus(xhr.status)
						return reject(
							new UploadError(
								kind,
								msg,
								xhr.status,
								xhr.statusText,
								apiErrorCode,
								detail
							)
						)
					}
					try {
						const result = JSON.parse(xhr.response)
						const decoded = T.decode(Types.tUploadFileResult, result.data, {
							unknownFields: 'drop'
						})
						if (T.isErr(decoded)) {
							return reject(
								new UploadError(
									'invalid_response',
									`Invalid response: ${decoded.err.map((e) => e.error).join(', ')}`
								)
							)
						}
						resolve(decoded.ok)
					} catch (err) {
						reject(new UploadError('invalid_response', (err as Error).message))
					}
				})
				xhr.addEventListener('error', () => {
					cleanup()
					reject(new UploadError('network', 'Network error'))
				})
				xhr.addEventListener('abort', () => {
					cleanup()
					reject(new DOMException('Aborted', 'AbortError'))
				})

				if (options?.signal) {
					if (options.signal.aborted) {
						xhr.abort()
						return reject(new DOMException('Aborted', 'AbortError'))
					}
					abortListener = () => xhr.abort()
					options.signal.addEventListener('abort', abortListener, { once: true })
				}

				xhr.send(fileData as Blob | ArrayBuffer)
			})
		},

		/** GET /files/variant/:variantId - Get specific file variant */
		getVariant: (variantId: string) => {
			const headers: Record<string, string> = {}
			const authToken = this.getAuthToken()
			if (authToken) {
				headers.Authorization = `Bearer ${authToken}`
			}
			return fetch(`${getInstanceUrl(this.opts.idTag)}/api/files/variant/${variantId}`, {
				headers
			})
		},

		/** GET /files/:fileId/descriptor - Get file descriptor and variants */
		getDescriptor: (fileId: string) =>
			this.request(
				'GET',
				`/files/${encodeURIComponent(fileId)}/descriptor`,
				Types.tFileDescriptor
			),

		/** GET /files/:id/metadata — the serving node's own answer about a file. Takes either id;
		 *  a content id answers with the granting entry, so pass the row's `entryId` when held. */
		getMetadata: (id: string) =>
			this.request('GET', `/files/${encodeURIComponent(id)}/metadata`, Types.tFileView),

		/** GET /files/:fileId - Get file (best variant selected) */
		get: (fileId: string, selector?: Types.GetFileVariantSelector) => {
			const query = selector
				? Object.entries(selector).reduce(
						(acc, [key, val]) => {
							if (val !== undefined) acc[key] = String(val)
							return acc
						},
						{} as Record<string, string>
					)
				: undefined
			const qs = query ? '?' + new URLSearchParams(query).toString() : ''

			const headers: Record<string, string> = {}
			const authToken = this.getAuthToken()
			if (authToken) {
				headers.Authorization = `Bearer ${authToken}`
			}

			return fetch(`${getInstanceUrl(this.opts.idTag)}/api/files/${fileId}${qs}`, {
				headers
			})
		},

		/** PATCH /files/:entryId - Rename, move (incl. cross-drive `channel`), visibility */
		update: (entryId: string, data: Types.PatchFileRequest) =>
			this.request('PATCH', `/files/${entryId}`, Types.tPatchFileResult, {
				data
			}),

		/** DELETE /files/:entryId - Move file to trash (soft delete) */
		delete: (entryId: string) =>
			this.request('DELETE', `/files/${entryId}`, Types.tDeleteFileResult),

		/** DELETE /files/:entryId?permanent=true - Permanently delete file (must be in trash) */
		permanentDelete: (entryId: string) =>
			this.request('DELETE', `/files/${entryId}`, Types.tDeleteFileResult, {
				query: { permanent: true }
			}),

		/** POST /files/:entryId/restore - Restore from trash (no `parentId` = root of its drive) */
		restore: (entryId: string, parentId?: string) =>
			this.request('POST', `/files/${entryId}/restore`, Types.tRestoreFileResult, {
				data: { parentId }
			}),

		/** POST /files/:entryId/duplicate - Duplicate a file */
		duplicate: (entryId: string, data?: Types.DuplicateFileRequest) =>
			this.request('POST', `/files/${entryId}/duplicate`, Types.tCreateFileResult, {
				data: data ?? {}
			}),

		/** PATCH /files/:entryId/user - Update user-specific file data */
		updateUserData: (entryId: string, data: Types.UpdateFileUserDataRequest) =>
			this.request('PATCH', `/files/${entryId}/user`, Types.tUpdateFileUserDataResult, {
				data
			}),

		/**
		 * Set starred status for a file
		 * @param entryId - Entry ID
		 * @param starred - New starred state
		 * @returns Updated user data
		 */
		setStarred: (entryId: string, starred: boolean) =>
			this.request('PATCH', `/files/${entryId}/user`, Types.tUpdateFileUserDataResult, {
				data: { starred }
			}),

		/**
		 * Set pinned status for a file
		 * @param entryId - Entry ID
		 * @param pinned - New pinned state
		 * @returns Updated user data
		 */
		setPinned: (entryId: string, pinned: boolean) =>
			this.request('PATCH', `/files/${entryId}/user`, Types.tUpdateFileUserDataResult, {
				data: { pinned }
			}),

		/** PUT /files/:entryId/tag/:tag - Add tag to file */
		addTag: (entryId: string, tag: string) =>
			this.request(
				'PUT',
				`/files/${encodeURIComponent(entryId)}/tag/${encodeURIComponent(tag)}`,
				Types.tTagResult
			),

		/** DELETE /files/:entryId/tag/:tag - Remove tag from file */
		removeTag: (entryId: string, tag: string) =>
			this.request(
				'DELETE',
				`/files/${encodeURIComponent(entryId)}/tag/${encodeURIComponent(tag)}`,
				Types.tTagResult
			),

		/** POST /files/:entryId/refresh - Reconcile a reference (Pin / Place / FSHR) with its
		 *  source. Takes the entry id only: a content id may name several placements. */
		refresh: (entryId: string) =>
			this.request(
				'POST',
				`/files/${encodeURIComponent(entryId)}/refresh`,
				Types.tFileRefreshResult
			),

		/** GET /files/:entryId/shares - List share entries for a file */
		listShares: (entryId: string) =>
			this.request(
				'GET',
				`/files/${encodeURIComponent(entryId)}/shares`,
				Types.tListShareEntriesResult
			),

		/** POST /files/:entryId/shares - Create share entry */
		createShare: (entryId: string, data: Types.CreateShareEntryRequest) =>
			this.request(
				'POST',
				`/files/${encodeURIComponent(entryId)}/shares`,
				Types.tShareEntry,
				{ data }
			),

		/** PATCH /files/:entryId/shares/:shareId - Update share entry */
		updateShare: (entryId: string, shareId: number, data: Types.UpdateShareEntryRequest) =>
			this.request(
				'PATCH',
				`/files/${encodeURIComponent(entryId)}/shares/${shareId}`,
				Types.tShareEntry,
				{
					data
				}
			),

		/** DELETE /files/:entryId/shares/:shareId - Delete share entry */
		deleteShare: (entryId: string, shareId: number) =>
			this.request(
				'DELETE',
				`/files/${encodeURIComponent(entryId)}/shares/${shareId}`,
				T.nullValue
			)
	}

	// ========================================================================
	// SHARE ENTRY QUERY ENDPOINTS
	// ========================================================================

	/** Share entry query endpoints */
	shares = {
		/** GET /shares?subject_id={id}[&subject_type=F] - List share entries by subject */
		listBySubject: (subjectId: string, subjectType?: string) =>
			this.request('GET', '/shares', Types.tListShareEntriesResult, {
				query: { subjectId, subjectType }
			})
	}

	// ========================================================================
	// TRASH ENDPOINTS
	// ========================================================================

	/** Trash management endpoints */
	trash = {
		/** GET /files?parentId=__trash__ - List files in trash */
		list: (query?: { limit?: number }) =>
			this.request('GET', '/files', Types.tListFilesResult, {
				query: { ...query, parentId: '__trash__' }
			}),

		/** DELETE /trash - Empty trash (permanently delete all trashed files) */
		empty: () => this.request('DELETE', '/trash', Types.tEmptyTrashResult)
	}

	// ========================================================================
	// TAG ENDPOINTS
	// ========================================================================

	/** Tag endpoints */
	tags = {
		/** GET /tags - List tags */
		list: (query?: Types.ListTagsQuery) =>
			this.request('GET', '/tags', Types.tListTagsResult, {
				query: query as Record<string, string | number | boolean | string[] | undefined>
			})
	}

	// ========================================================================
	// PROFILE ENDPOINTS
	// ========================================================================

	/** Profile endpoints */
	profiles = {
		/** GET /me - Get own profile */
		getOwn: () => this.request('GET', '/me', Types.tProfileKeys),

		/** GET /me/app-domain — tenant's public app/web domain (for building share links) */
		getAppDomain: () => this.request('GET', '/me/app-domain', Types.tAppDomainResult),

		/** GET /me/full - Get full own profile */
		getOwnFull: () => this.request('GET', '/me/full', Types.tProfileKeys),

		/** GET /me/full on another node - Get remote profile's full data */
		getRemoteFull: (idTag: string, authToken?: string) =>
			apiFetchHelper<Types.ProfileKeys, unknown>(idTag, 'GET', '/me/full', {
				type: Types.tProfileKeys,
				authToken
			}),

		/** PATCH /me - Update own profile */
		updateOwn: (data: Types.ProfilePatch) =>
			this.request('PATCH', '/me', Types.tUpdateProfileResult, { data }),

		/** GET /profiles - List profiles */
		list: (query?: Types.ListProfilesQuery, opts?: { signal?: AbortSignal }) =>
			this.request('GET', '/profiles', Types.tListProfilesResult, {
				query: query as Record<string, string | number | boolean | string[] | undefined>,
				signal: opts?.signal
			}),

		/** GET /profiles/:idTag - Get profile by ID tag (local relationship state) */
		get: (idTag: string) => this.request('GET', `/profiles/${idTag}`, Types.tOptionalProfile),

		/** GET /profiles/batch?idTags=a,b,c - Resolve several profiles at once, in */
		getBatch: (idTags: string[], opts?: { signal?: AbortSignal }) =>
			this.request('GET', '/profiles/batch', Types.tPublicProfileList, {
				query: { idTags },
				signal: opts?.signal
			}),

		/** POST /profiles/:idTag/refresh - Force an immediate re-sync of the caller's */
		refresh: (idTag: string) =>
			this.request('POST', `/profiles/${idTag}/refresh`, Types.tProfileRefreshResult),

		/** PATCH /profiles/:idTag - Update profile connection/relationship */
		updateConnection: (idTag: string, data: Types.PatchProfileConnection) =>
			this.request('PATCH', `/profiles/${idTag}`, T.struct({}), { data }),

		/** PATCH /profiles/:idTag - Set per-profile trust preference for proxy-token use. */
		setTrust: (idTag: string, trust: Types.ProfileTrust | null) => {
			const body: Types.PatchProfileConnection = { trust }
			return this.request('PATCH', `/profiles/${idTag}`, T.struct({}), { data: body })
		},

		/** PATCH /profiles/:idTag - Per-community "Show in Home" composition toggle. */
		setShowInHome: (idTag: string, show: boolean) =>
			this.request('PATCH', `/profiles/${idTag}`, T.struct({}), {
				data: { hiddenInHome: !show } satisfies Types.PatchProfileConnection
			}),

		/** PATCH /profiles/:idTag - Set the hats (communities) this profile may act on behalf of. */
		setHats: (idTag: string, hats: string[] | null) =>
			this.request('PATCH', `/profiles/${idTag}`, T.struct({}), {
				data: { hats } satisfies Types.PatchProfileConnection
			}),

		/** GET /profiles?trustSet=true - List profiles that have a non-null trust preference set. */
		listTrust: () =>
			this.request('GET', '/profiles', Types.tListProfilesResult, {
				query: { trustSet: true }
			}),

		/** PATCH /admin/profiles/:idTag - Admin update profile (roles, status) */
		adminUpdate: (idTag: string, data: Types.AdminProfilePatch) =>
			this.request('PATCH', `/admin/profiles/${idTag}`, Types.tUpdateProfileResult, { data })
	}

	// ========================================================================
	// CONTACT / ADDRESS BOOK ENDPOINTS
	// ========================================================================

	/** Address books and contacts (also reachable over CardDAV at /dav/...) */
	contacts = {
		/** GET /address-books - List address books for the current tenant. */
		listAddressBooks: () => this.request('GET', '/address-books', Types.tAddressBookList),

		/** POST /address-books - Create an address book. */
		createAddressBook: (data: Types.AddressBookCreate) =>
			this.request('POST', '/address-books', Types.tAddressBookOutput, { data }),

		/** PATCH /address-books/:abId - Update an address book (name/description). */
		updateAddressBook: (abId: number, data: Types.AddressBookPatch) =>
			this.request('PATCH', `/address-books/${abId}`, Types.tAddressBookOutput, { data }),

		/** DELETE /address-books/:abId - Delete an address book and all its contacts. */
		deleteAddressBook: (abId: number) =>
			this.request('DELETE', `/address-books/${abId}`, T.nullValue),

		/** GET /contacts - List contacts across all address books (cursor-paginated, name-sorted). */
		listAllContacts: (query?: Types.ListContactsQuery) =>
			this.requestWithMeta('GET', '/contacts', Types.tContactList, {
				query: query as Record<string, string | number | boolean | string[] | undefined>
			}),

		/** GET /address-books/:abId/contacts - List contacts (cursor-paginated, optional search). */
		listContacts: (abId: number, query?: Types.ListContactsQuery) =>
			this.requestWithMeta('GET', `/address-books/${abId}/contacts`, Types.tContactList, {
				query: query as Record<string, string | number | boolean | string[] | undefined>
			}),

		/** GET /address-books/:abId/contacts/:uid - Get a single contact. */
		getContact: (abId: number, uid: string) =>
			this.request(
				'GET',
				`/address-books/${abId}/contacts/${encodeURIComponent(uid)}`,
				Types.tContactOutput
			),

		/** POST /address-books/:abId/contacts - Create a contact. */
		createContact: (abId: number, data: Types.ContactInput) =>
			this.request('POST', `/address-books/${abId}/contacts`, Types.tContactOutput, { data }),

		/** PUT /address-books/:abId/contacts/:uid - Replace a contact (full overwrite). */
		replaceContact: (abId: number, uid: string, data: Types.ContactInput) =>
			this.request(
				'PUT',
				`/address-books/${abId}/contacts/${encodeURIComponent(uid)}`,
				Types.tContactOutput,
				{ data }
			),

		/** PATCH /address-books/:abId/contacts/:uid - Patch a contact (three-state per field). */
		patchContact: (abId: number, uid: string, data: Types.ContactPatch) =>
			this.request(
				'PATCH',
				`/address-books/${abId}/contacts/${encodeURIComponent(uid)}`,
				Types.tContactOutput,
				{ data }
			),

		/** DELETE /address-books/:abId/contacts/:uid - Delete a contact. */
		deleteContact: (abId: number, uid: string) =>
			this.request(
				'DELETE',
				`/address-books/${abId}/contacts/${encodeURIComponent(uid)}`,
				T.nullValue
			),

		/** POST /address-books/:abId/import - Import a multi-card vCard file. */
		importContacts: (
			abId: number,
			vcard: string,
			conflict: Types.ImportConflictMode = 'skip'
		) =>
			apiFetchHelper<Types.ImportContactsResult>(
				this.opts.idTag,
				'POST',
				`/address-books/${abId}/import`,
				{
					type: Types.tImportContactsResult,
					rawBody: vcard,
					query: { conflict },
					authToken: this.getAuthToken(),
					headers: { 'Content-Type': 'text/vcard; charset=utf-8' }
				}
			)
	}

	// ========================================================================
	// CALENDAR / CALDAV ENDPOINTS
	// ========================================================================

	/** Calendars and calendar objects (also reachable over CalDAV at /dav/...). */
	calendars = {
		/** GET /calendars - List calendars for the current tenant. */
		listCalendars: () => this.request('GET', '/calendars', Types.tCalendarList),

		/** POST /calendars - Create a calendar. */
		createCalendar: (data: Types.CalendarCreate) =>
			this.request('POST', '/calendars', Types.tCalendarOutput, { data }),

		/** GET /calendars/:calId - Get a single calendar. */
		getCalendar: (calId: number) =>
			this.request('GET', `/calendars/${calId}`, Types.tCalendarOutput),

		/** PATCH /calendars/:calId - Update calendar metadata. */
		updateCalendar: (calId: number, data: Types.CalendarPatch) =>
			this.request('PATCH', `/calendars/${calId}`, Types.tCalendarOutput, { data }),

		/** DELETE /calendars/:calId - Delete a calendar and all its objects. */
		deleteCalendar: (calId: number) =>
			this.request('DELETE', `/calendars/${calId}`, T.nullValue),

		/** GET /calendars/:calId/objects - List events / tasks with filtering, date range, pagination. */
		listObjects: (calId: number, query?: Types.ListCalendarObjectsQuery) =>
			this.requestWithMeta('GET', `/calendars/${calId}/objects`, Types.tCalendarObjectList, {
				query: query as Record<string, string | number | boolean | string[] | undefined>
			}),

		/** GET /calendars/:calId/objects/:uid - Get a single event / task. */
		getObject: (calId: number, uid: string) =>
			this.request(
				'GET',
				`/calendars/${calId}/objects/${encodeURIComponent(uid)}`,
				Types.tCalendarObjectOutput
			),

		/** POST /calendars/:calId/objects - Create an event or task. */
		createObject: (calId: number, data: Types.CalendarObjectInput) =>
			this.request('POST', `/calendars/${calId}/objects`, Types.tCalendarObjectOutput, {
				data
			}),

		/** PUT /calendars/:calId/objects/:uid - Replace an event / task (full overwrite). */
		replaceObject: (calId: number, uid: string, data: Types.CalendarObjectInput) =>
			this.request(
				'PUT',
				`/calendars/${calId}/objects/${encodeURIComponent(uid)}`,
				Types.tCalendarObjectOutput,
				{ data }
			),

		/** PATCH /calendars/:calId/objects/:uid - Update a subset of fields on
		 *  an event / task. Used by drag-and-resize where we only change
		 *  dtstart/dtend/allDay and don't want a full-body round-trip. */
		patchObject: (calId: number, uid: string, data: Types.CalendarObjectInput) =>
			this.request(
				'PATCH',
				`/calendars/${calId}/objects/${encodeURIComponent(uid)}`,
				Types.tCalendarObjectOutput,
				{ data }
			),

		/** DELETE /calendars/:calId/objects/:uid - Delete an event / task. */
		deleteObject: (calId: number, uid: string) =>
			this.request(
				'DELETE',
				`/calendars/${calId}/objects/${encodeURIComponent(uid)}`,
				T.nullValue
			),

		/** POST /calendars/:calId/objects/:uid/split - Atomically fork a recurring series.
		 *  Replaces the 3-step client dance (PATCH master, DELETE post-split overrides,
		 *  POST tail) with a single transactional call — no more half-split states. */
		splitSeries: (calId: number, uid: string, data: Types.SplitSeriesRequest) =>
			this.request(
				'POST',
				`/calendars/${calId}/objects/${encodeURIComponent(uid)}/split`,
				Types.tSplitSeriesResponse,
				{ data }
			),

		/** GET /calendars/:calId/objects/:uid/exceptions - List recurrence overrides for a series. */
		listExceptions: (calId: number, uid: string) =>
			this.request(
				'GET',
				`/calendars/${calId}/objects/${encodeURIComponent(uid)}/exceptions`,
				Types.tCalendarObjectOutputList
			),

		/** GET /calendars/:calId/objects/:uid/exceptions/:recurrenceId - Fetch a single override. */
		getException: (calId: number, uid: string, recurrenceId: string) =>
			this.request(
				'GET',
				`/calendars/${calId}/objects/${encodeURIComponent(uid)}/exceptions/${encodeURIComponent(recurrenceId)}`,
				Types.tCalendarObjectOutput
			),

		/** PUT /calendars/:calId/objects/:uid/exceptions/:recurrenceId - Create or replace an override. */
		createException: (
			calId: number,
			uid: string,
			recurrenceId: string,
			data: Types.CalendarObjectInput
		) =>
			this.request(
				'PUT',
				`/calendars/${calId}/objects/${encodeURIComponent(uid)}/exceptions/${encodeURIComponent(recurrenceId)}`,
				Types.tCalendarObjectOutput,
				{ data }
			),

		/** PATCH /calendars/:calId/objects/:uid/exceptions/:recurrenceId - Partial update of an override. */
		patchException: (
			calId: number,
			uid: string,
			recurrenceId: string,
			data: Types.CalendarObjectInput
		) =>
			this.request(
				'PATCH',
				`/calendars/${calId}/objects/${encodeURIComponent(uid)}/exceptions/${encodeURIComponent(recurrenceId)}`,
				Types.tCalendarObjectOutput,
				{ data }
			),

		/** DELETE /calendars/:calId/objects/:uid/exceptions/:recurrenceId - Remove an override. */
		deleteException: (calId: number, uid: string, recurrenceId: string) =>
			this.request(
				'DELETE',
				`/calendars/${calId}/objects/${encodeURIComponent(uid)}/exceptions/${encodeURIComponent(recurrenceId)}`,
				T.nullValue
			)
	}

	// ========================================================================
	// SETTINGS ENDPOINTS
	// ========================================================================

	/** Settings endpoints */
	settings = {
		/**
		 * GET /settings - List settings
		 * @param query - Optional prefix filter and resolution level.
		 *   `level` mirrors `get()`: omitted = full resolution chain;
		 *   `'global'` / `'tenant'` = raw rows at that level only.
		 * @returns Settings
		 */
		list: (query?: { prefix?: string; level?: 'global' | 'tenant'; tenant?: string }) =>
			this.request('GET', '/settings', Types.tListSettingsResult, { query }),

		/**
		 * GET /settings/:name - Get a single setting.
		 * @param name - Setting name
		 * @param opts.level - Optional resolution level.
		 *   - omitted: full resolution chain (tenant → global → schema default).
		 *     Always returns 200 for a known key with a default.
		 *   - `'tenant'`: raw per-tenant row only. **No fallback.** 404 if no override.
		 *   - `'global'`: raw global row only. **No fallback.** 404 if no global value.
		 *   The raw modes let callers distinguish "no override at this level"
		 *   from "explicit override that happens to equal the next level".
		 * @returns Setting value
		 */
		get: (name: string, opts?: { level?: 'global' | 'tenant'; tenant?: string }) =>
			this.request('GET', `/settings/${name}`, Types.tGetSettingResult, {
				query: {
					level: opts?.level,
					tenant: opts?.tenant
				}
			}),

		/**
		 * PUT /settings/:name - Update setting
		 * @param name - Setting name
		 * @param data - Setting value object
		 * @param opts.level - Optional resolution level. When omitted the server
		 *   infers the scope from the caller's role (site admin → global,
		 *   tenant → tenant). Pass `'global'` or `'tenant'` to make the scope
		 *   explicit, mirroring `get()` and `delete()`.
		 * @param opts.tenant - Optional target tenant idTag. Site-admin only.
		 *   When set, the write targets the named tenant's row instead of the
		 *   caller's own. Used by the per-tenant settings detail page.
		 */
		update: (
			name: string,
			data: { value: unknown },
			opts?: { level?: 'global' | 'tenant'; tenant?: string }
		) =>
			this.request('PUT', `/settings/${name}`, T.struct({}), {
				data,
				query: {
					level: opts?.level,
					tenant: opts?.tenant
				}
			}),

		/**
		 * DELETE /settings/:name - Clear a setting at a given level.
		 * Used by the UI's "Reset to default" affordance for tenant overrides.
		 * @param name - Setting name
		 * @param opts.level - Required level: `'tenant'` or `'global'`.
		 * @param opts.tenant - Optional target tenant idTag (site-admin only;
		 *   ignored for `level: 'global'` since the global row is shared).
		 */
		delete: (name: string, opts: { level: 'global' | 'tenant'; tenant?: string }) =>
			this.request('DELETE', `/settings/${name}`, T.nullValue, {
				query: {
					level: opts.level,
					tenant: opts.tenant
				}
			})
	}

	// ========================================================================
	// SITE ENDPOINTS
	// ========================================================================

	/**
	 * Site builder endpoints.
	 *
	 * A site is a per-tenant singleton, so the resource carries no id. The whole
	 * group is owner/leader only on the server; call it through the context-aware
	 * API client so a community leader configures the community's site rather than
	 * their own.
	 */
	site = {
		/** GET /sites - The tenant's site record and every document mounted into it. */
		get: () => this.request('GET', '/sites', Types.tSiteConfig),

		/** PATCH /sites - Set or clear the site's explicit main navigation. */
		update: (data: { nav?: Types.SiteNavItem[] | null }) =>
			this.request('PATCH', '/sites', Types.tSiteConfig, { data }),

		/** GET /sites/pages - Every published page of every mounted document, for the */
		pages: () => this.request('GET', '/sites/pages', Types.tSitePagesResult),

		/** POST /sites/mounts - Add a document to the site, or move one. */
		mount: (data: Types.SiteMountRequest) =>
			this.request('POST', '/sites/mounts', Types.tSiteMountResult, { data }),

		/** DELETE /sites/mounts - Take a document out of the site. */
		unmount: (data: Types.SiteUnmountRequest) =>
			this.request('DELETE', '/sites/mounts', Types.tSiteMountResult, { data }),

		/** POST /sites/publish - Commit an already-uploaded container as a */
		publish: (data: Types.SitePublishRequest) =>
			this.request('POST', '/sites/publish', Types.tSitePublishResult, { data }),

		/** POST /sites/rollback - Put a document's previous container back in */
		rollback: (data: Types.SiteRollbackRequest) =>
			this.request('POST', '/sites/rollback', Types.tSiteRollbackResult, { data })
	}

	// ========================================================================
	// NOTIFICATION ENDPOINTS
	// ========================================================================

	/** Notification endpoints */
	notifications = {
		/** POST /notifications/subscription - Subscribe to push notifications */
		subscribe: (data: { subscription: PushSubscription }) =>
			this.request('POST', '/notifications/subscription', T.struct({ id: T.number }), {
				data
			}),

		/** DELETE /notifications/subscription/:id - Remove a push subscription */
		unsubscribe: (subscriptionId: number) =>
			this.request('DELETE', `/notifications/subscription/${subscriptionId}`, T.nullValue)
	}

	// ========================================================================
	// REFERENCE ENDPOINTS
	// ========================================================================

	/** Reference endpoints */
	refs = {
		/** GET /ref - List references */
		list: (query?: Types.ListRefsQuery) =>
			this.request('GET', '/refs', T.array(Types.tRef), { query }),

		/** GET /ref/:refId - Get reference details */
		get: (refId: string) => this.request('GET', `/refs/${refId}`, Types.tRefResponse),

		/** GET /refs/:refId/idp-status - Unauthenticated IDP status lookup */
		idpStatus: (refId: string) =>
			this.request('GET', `/refs/${refId}/idp-status`, Types.tIdpStatusResponse),

		/** POST /refs/:refId/resend-activation - Unauthenticated resend */
		resendActivation: (refId: string) =>
			this.request(
				'POST',
				`/refs/${refId}/resend-activation`,
				Types.tResendActivationResponse
			),

		/** POST /ref - Create reference */
		create: (data: Types.CreateRefRequest) =>
			this.request('POST', '/refs', Types.tRef, { data }),

		/** PATCH /refs/:refId — patch a ref (omit = unchanged, null = clear). */
		update: (refId: string, data: Types.UpdateRefRequest) =>
			this.request('PATCH', `/refs/${refId}`, Types.tRef, { data }),

		/** DELETE /ref/:refId - Delete reference */
		delete: (refId: string) => this.request('DELETE', `/refs/${refId}`, Types.tDeleteRefResult)
	}

	// ========================================================================
	// SEARCH ENDPOINTS
	// ========================================================================

	/** Full-text search endpoints */
	search = {
		/** GET /search - Full-text search across files, document parts, actions */
		query: (query: Types.SearchQuery, opts?: { signal?: AbortSignal }) =>
			this.request('GET', '/search', T.array(Types.tSearchHit), {
				query: searchQueryParams(query),
				signal: opts?.signal
			}),

		/** GET /search with the pagination envelope preserved. */
		queryPaginated: async (query: Types.SearchQuery, opts?: { signal?: AbortSignal }) => {
			const result = await this.requestWithMeta('GET', '/search', T.array(Types.tSearchHit), {
				query: searchQueryParams(query),
				signal: opts?.signal
			})
			return { data: result.data, pagination: result.meta.pagination }
		},

		/** POST /search/reindex - Rebuild this tenant's full-text index. */
		reindex: () => this.request('POST', '/search/reindex', Types.tReindexResult)
	}

	// ========================================================================
	// ONBOARDING ENDPOINTS
	// ========================================================================

	/** Onboarding wizard endpoints */
	onboarding = {
		/** POST /onboarding/complete - Finish the reversible onboarding wizard. */
		complete: (data: Types.OnboardingCompleteRequest) =>
			this.request('POST', '/onboarding/complete', T.nullValue, { data })
	}

	// ========================================================================
	// IDP ENDPOINTS
	// ========================================================================

	/** Identity Provider endpoints */
	idp = {
		/** GET /idp/info on a remote provider - Get provider public info */
		getInfo: (providerDomain: string) =>
			apiFetchHelper<Types.IdpInfo, unknown>(providerDomain, 'GET', '/idp/info', {
				type: Types.tIdpInfo
			}),

		/** POST /idp/activate - Activate an identity using a ref token */
		activate: (data: Types.IdpActivateRequest) =>
			this.request('POST', '/idp/activate', Types.tIdpActivateResult, { data })
	}

	// ========================================================================
	// IDP MANAGEMENT ENDPOINTS (for identity provider administrators)
	// ========================================================================

	/** IDP Management endpoints for identity provider administrators */
	idpManagement = {
		/** GET /idp/identities - List identities managed by this IDP */
		listIdentities: (query?: Types.ListIdpIdentitiesQuery) =>
			this.request('GET', '/idp/identities', Types.tIdpIdentityList, {
				query: query as Record<string, string | number | boolean | undefined>
			}),

		/** POST /idp/identities - Create new identity */
		createIdentity: (data: Types.CreateIdpIdentityRequest) =>
			this.request('POST', '/idp/identities', Types.tIdpCreateIdentityResult, { data }),

		/** GET /idp/identities/{idTag} - Get identity details */
		getIdentity: (idTag: string) =>
			this.request('GET', `/idp/identities/${encodeURIComponent(idTag)}`, Types.tIdpIdentity),

		/** DELETE /idp/identities/{idTag} - Delete identity */
		deleteIdentity: (idTag: string) =>
			this.request('DELETE', `/idp/identities/${encodeURIComponent(idTag)}`, T.nullValue),

		/** PATCH /idp/identities/{idTag} - Update identity settings */
		updateIdentity: (idTag: string, data: { dyndns?: boolean }) =>
			this.request(
				'PATCH',
				`/idp/identities/${encodeURIComponent(idTag)}`,
				Types.tIdpIdentity,
				{ data }
			),

		/** GET /idp/api-keys - List API keys for a specified identity */
		listApiKeys: (idTag: string) =>
			this.request('GET', '/idp/api-keys', Types.tIdpApiKeyList, {
				query: { idTag }
			}),

		/** POST /idp/api-keys - Create API key for a specified identity */
		createApiKey: (data: Types.CreateIdpApiKeyRequest) =>
			this.request('POST', '/idp/api-keys', Types.tIdpCreateApiKeyResult, { data }),

		/** DELETE /idp/api-keys/{keyId} - Revoke API key */
		deleteApiKey: (keyId: number, idTag: string) =>
			this.request('DELETE', `/idp/api-keys/${keyId}`, T.nullValue, {
				query: { idTag }
			})
	}

	// ========================================================================
	// COMMUNITY ENDPOINTS
	// ========================================================================

	/** Community management endpoints */
	communities = {
		/** PUT /profiles/{id_tag} - Create community profile */
		create: (idTag: string, data: Types.CreateCommunityRequest) =>
			this.request('PUT', `/profiles/${idTag}`, Types.tCommunityProfileResponse, { data }),

		/** POST /profiles/verify - Verify community identity availability */
		verify: (data: Types.VerifyCommunityRequest) =>
			this.request('POST', '/profiles/verify', Types.tCommunityVerifyResult, { data })
	}

	// ========================================================================
	// CHANNEL (ROOM) ENDPOINTS
	// ========================================================================

	/** Channel (room) endpoints of this tenant */
	channels = {
		/** GET /channels - Porch listing: rooms with the caller's entry status */
		list: () =>
			this.request('GET', '/channels', T.array(Types.tPorchEntry)) as Promise<
				Types.PorchEntry[]
			>,

		/** POST /channels - Create a room */
		create: (data: Types.CreateChannelRequest) =>
			this.request('POST', '/channels', Types.tChannel, { data }),

		/** PATCH /channels/{name} - Update a room */
		update: (name: string, data: Types.PatchChannelRequest) =>
			this.request('PATCH', `/channels/${encodeURIComponent(name)}`, Types.tChannel, {
				data
			}),

		/** DELETE /channels/{name} - Delete a room. A room with live files rejects with a
		 *  `FetchError` 409, `apiErrorCode` `E-CORE-CONFLICT`, `details.fileCount`. */
		delete: (name: string) =>
			this.request('DELETE', `/channels/${encodeURIComponent(name)}`, T.nullValue),

		/** GET /channels/{name}/members - idTags of the room's members */
		members: (name: string) =>
			this.request('GET', `/channels/${encodeURIComponent(name)}/members`, T.array(T.string))
	}

	// ========================================================================
	// PARTNER ENDPOINTS
	// ========================================================================

	/** Partner communities and the connection map */
	partners = {
		/** GET /partners - This community's connected partner communities */
		list: () => this.request('GET', '/partners', T.array(Types.tPartnerProfile)),

		/** GET /partners/map - Own tenant's stored partner graph (owner only) */
		map: () => this.request('GET', '/partners/map', Types.tPartnerMap),

		/** POST /partners/sync - Schedule a partner graph sync (owner only) */
		sync: () => this.request('POST', '/partners/sync', T.struct({ scheduled: T.boolean }))
	}

	// ========================================================================
	// ADMIN ENDPOINTS
	// ========================================================================

	/** Admin endpoints for system administration */
	admin = {
		/** GET /admin/tenants - List all tenants */
		listTenants: (query?: Types.ListTenantsQuery) =>
			this.request('GET', '/admin/tenants', Types.tListTenantsResult, {
				query: query as Record<string, string | number | boolean | undefined>
			}),

		/** POST /admin/tenants/:idTag/password-reset - Send password reset email */
		sendPasswordReset: (idTag: string) =>
			this.request(
				'POST',
				`/admin/tenants/${encodeURIComponent(idTag)}/password-reset`,
				Types.tPasswordResetResponse
			),

		/** POST /admin/tenants/:idTag/purge - Permanently delete a tenant and all its data. */
		purgeTenant: (idTag: string, data: { confirmIdTag: string }) =>
			this.request(
				'POST',
				`/admin/tenants/${encodeURIComponent(idTag)}/purge`,
				Types.tPurgeTenantResponse,
				{
					data
				}
			),

		/** POST /admin/email/test - Send a test email to verify SMTP configuration */
		sendTestEmail: (to: string) =>
			this.request('POST', '/admin/email/test', Types.tTestEmailResult, { data: { to } }),

		/** POST /admin/db-maintenance - Compact the search index and reclaim */
		dbMaintenance: () =>
			this.request('POST', '/admin/db-maintenance', Types.tDbMaintenanceResult),

		/** GET /admin/proxy-sites - List all proxy sites */
		listProxySites: () =>
			this.request('GET', '/admin/proxy-sites', Types.tListProxySitesResult),

		/** POST /admin/proxy-sites - Create a new proxy site */
		createProxySite: (data: Types.CreateProxySiteRequest) =>
			this.request('POST', '/admin/proxy-sites', Types.tProxySiteData, { data }),

		/** GET /admin/proxy-sites/:siteId - Get a proxy site by ID */
		getProxySite: (siteId: number) =>
			this.request('GET', `/admin/proxy-sites/${siteId}`, Types.tProxySiteData),

		/** PATCH /admin/proxy-sites/:siteId - Update a proxy site */
		updateProxySite: (siteId: number, data: Types.UpdateProxySiteRequest) =>
			this.request('PATCH', `/admin/proxy-sites/${siteId}`, Types.tProxySiteData, { data }),

		/** DELETE /admin/proxy-sites/:siteId - Delete a proxy site */
		deleteProxySite: (siteId: number) =>
			this.request('DELETE', `/admin/proxy-sites/${siteId}`, Types.tDeleteProxySiteResult),

		/** POST /admin/proxy-sites/:siteId/renew-cert - Trigger certificate renewal */
		renewProxySiteCert: (siteId: number) =>
			this.request(
				'POST',
				`/admin/proxy-sites/${siteId}/renew-cert`,
				Types.tRenewProxySiteCertResult
			),

		/** POST /admin/invite-community - Send community creation invite to a connected user */
		inviteCommunity: (data: Types.InviteCommunityRequest) =>
			this.request('POST', '/admin/invite-community', Types.tInviteCommunityResult, { data })
	}
}

/**
 * Factory function to create an API client
 *
 * @param opts - Client options (idTag and optional authToken)
 * @returns API client instance
 *
 * @example
 * ```typescript
 * const api = createApiClient({
 *   idTag: 'alice',
 *   authToken: 'jwt-token'
 * })
 * ```
 */
export function createApiClient(opts: ApiClientOpts): ApiClient {
	return new ApiClient(opts)
}

// vim: ts=2

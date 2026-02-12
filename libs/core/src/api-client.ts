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
import { apiFetchHelper, ApiFetchResult } from './api.js'
import * as Types from './api-types.js'
import { getInstanceUrl } from './urls.js'

/**
 * Options for creating an API client
 */
export interface ApiClientOpts {
	/** Authentication token (optional, can be provided per-request) */
	authToken?: string
	/** Identity tag of the tenant */
	idTag: string
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

	constructor(opts: ApiClientOpts) {
		this.opts = opts
	}

	/**
	 * Get the idTag of the tenant this API client is configured for
	 */
	get idTag(): string {
		return this.opts.idTag
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
			query?: Record<string, string | number | boolean | undefined>
			authToken?: string
			requestId?: string
		}
	): Promise<Res> {
		return await apiFetchHelper<Res, unknown>(this.opts.idTag, method, path, {
			type: responseType,
			data: options?.data,
			query: options?.query,
			authToken: options?.authToken || this.opts.authToken,
			requestId: options?.requestId
		})
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
			query?: Record<string, string | number | boolean | undefined>
			authToken?: string
			requestId?: string
		}
	): Promise<ApiFetchResult<Res>> {
		return await apiFetchHelper<Res, unknown>(this.opts.idTag, method, path, {
			type: responseType,
			data: options?.data,
			query: options?.query,
			authToken: options?.authToken || this.opts.authToken,
			requestId: options?.requestId,
			returnMeta: true
		})
	}

	// ========================================================================
	// AUTH ENDPOINTS
	// ========================================================================

	/** Authentication endpoints */
	auth = {
		/**
		 * POST /auth/login - User login with password
		 * @param data - Login credentials
		 * @returns Login result with token and profile info
		 */
		login: (data: Types.LoginRequest) =>
			this.request('POST', '/auth/login', Types.tLoginResult, { data }),

		/**
		 * POST /auth/logout - User logout
		 * @param data - Optional data containing API key to delete on server
		 */
		logout: (data?: { apiKey?: string }) =>
			this.request('POST', '/auth/logout', T.nullValue, { data: data ?? {} }),

		/**
		 * GET /auth/login-token - Get login token for current session
		 * @returns Login result with token
		 */
		getLoginToken: () =>
			this.request('GET', '/auth/login-token', T.nullable(Types.tLoginResult)),

		/**
		 * GET /auth/access-token - Get access token
		 * @param query - Optional query parameters (scope, token, lifetime)
		 * @returns Token
		 */
		getAccessToken: (query?: { scope?: string; token?: string; lifetime?: number }) =>
			this.request('GET', '/auth/access-token', Types.tAccessTokenResult, {
				query
			}),

		/**
		 * GET /auth/access-token?refId={refId} - Exchange ref for scoped access token (unauthenticated)
		 * @param refId - Reference ID for shared resource
		 * @param options - Optional parameters (refresh: true to refresh without consuming usage count)
		 * @returns Scoped token with expiry
		 */
		getAccessTokenByRef: (refId: string, options?: { refresh?: boolean }) =>
			this.request('GET', '/auth/access-token', Types.tRefAccessTokenResult, {
				query: { refId, refresh: options?.refresh }
			}),

		/**
		 * GET /auth/proxy-token - Get proxy token for federation
		 * @param idTag - Optional target idTag for cross-server federation
		 * @returns Token and optionally roles (for local context)
		 */
		getProxyToken: (idTag?: string) =>
			this.request('GET', '/auth/proxy-token', Types.tProxyTokenResult, {
				query: idTag ? { idTag } : undefined
			}),

		/**
		 * GET /auth/vapid - Get VAPID public key for push notifications
		 * @returns VAPID public key
		 */
		getVapidPublicKey: () => this.request('GET', '/auth/vapid', Types.tGetVapidResult),

		/**
		 * POST /auth/password - Change password
		 * @param data - Password change request
		 */
		changePassword: (data: Types.PasswordChangeRequest) =>
			this.request('POST', '/auth/password', T.struct({}), { data }),

		/**
		 * POST /auth/set-password - Set password using a reference token
		 * @param data - Set password request with refId and password
		 */
		setPassword: (data: Types.SetPasswordRequest) =>
			this.request('POST', '/auth/set-password', Types.tSetPasswordResult, { data }),

		/**
		 * POST /auth/forgot-password - Request password reset email
		 * @param data - Email address to send reset link to
		 * @returns Success message (always succeeds for security)
		 */
		forgotPassword: (data: Types.ForgotPasswordRequest) =>
			this.request('POST', '/auth/forgot-password', Types.tPasswordResetResponse, { data }),

		// ====================================================================
		// WEBAUTHN ENDPOINTS
		// ====================================================================

		/**
		 * GET /auth/wa/reg - List WebAuthn credentials
		 * @returns List of registered WebAuthn credentials
		 */
		listWebAuthnCredentials: () =>
			this.request('GET', '/auth/wa/reg', Types.tWebAuthnCredentialList),

		/**
		 * GET /auth/wa/reg/challenge - Get WebAuthn registration challenge
		 * @returns Registration options and challenge token
		 */
		getWebAuthnRegChallenge: () =>
			this.request('GET', '/auth/wa/reg/challenge', Types.tWebAuthnRegChallengeResult),

		/**
		 * POST /auth/wa/reg - Register new WebAuthn credential
		 * @param data - Registration response with token and credential
		 * @returns Registered credential info
		 */
		registerWebAuthnCredential: (data: Types.WebAuthnRegisterRequest) =>
			this.request('POST', '/auth/wa/reg', Types.tWebAuthnCredential, { data }),

		/**
		 * DELETE /auth/wa/reg/{credentialId} - Delete WebAuthn credential
		 * @param credentialId - Credential ID to delete
		 */
		deleteWebAuthnCredential: (credentialId: string) =>
			this.request('DELETE', `/auth/wa/reg/${encodeURIComponent(credentialId)}`, T.nullValue),

		/**
		 * GET /auth/wa/login/challenge - Get WebAuthn login challenge (public)
		 * @returns Authentication options and challenge token
		 */
		getWebAuthnLoginChallenge: () =>
			this.request('GET', '/auth/wa/login/challenge', Types.tWebAuthnLoginChallengeResult),

		/**
		 * POST /auth/wa/login - Authenticate with WebAuthn
		 * @param data - Authentication response with token
		 * @returns Login result with session token
		 */
		webAuthnLogin: (data: Types.WebAuthnLoginRequest) =>
			this.request('POST', '/auth/wa/login', Types.tLoginResult, { data }),

		// ====================================================================
		// API KEY ENDPOINTS
		// ====================================================================

		/**
		 * GET /auth/api-keys - List API keys
		 * @returns List of API keys (without plaintext keys)
		 */
		listApiKeys: () => this.request('GET', '/auth/api-keys', Types.tApiKeyList),

		/**
		 * POST /auth/api-keys - Create new API key
		 * @param data - API key creation options
		 * @returns Created API key with plaintext key (shown only once)
		 */
		createApiKey: (data: Types.CreateApiKeyRequest) =>
			this.request('POST', '/auth/api-keys', Types.tCreateApiKeyResult, { data }),

		/**
		 * DELETE /auth/api-keys/{keyId} - Delete API key
		 * @param keyId - Key ID to delete
		 */
		deleteApiKey: (keyId: number) =>
			this.request('DELETE', `/auth/api-keys/${keyId}`, T.nullValue),

		/**
		 * GET /auth/access-token?apiKey=... - Exchange API key for access token (unauthenticated)
		 * @param apiKey - API key to exchange
		 * @returns Access token
		 */
		getAccessTokenByApiKey: (apiKey: string) =>
			this.request('GET', '/auth/access-token', Types.tLoginResult, {
				query: { apiKey }
			})
	}

	// ========================================================================
	// PROFILE ENDPOINTS
	// ========================================================================

	/** Profile creation endpoints (registration, community creation) */
	profile = {
		/**
		 * POST /profiles/verify - Verify profile identity availability (registration or community)
		 * @param data - Verification request (type: 'ref' | 'domain' | 'idp')
		 * @returns Verification result with identity providers and validation errors
		 */
		verify: (data: Types.VerifyProfileRequest) =>
			this.request('POST', '/profiles/verify', Types.tVerifyProfileResult, { data }),

		/**
		 * POST /profiles/register - Register new user or create community profile
		 * @param data - Registration request (includes type: person or community)
		 * @returns Empty object (user must verify email and set password before logging in)
		 */
		register: (data: Types.RegisterRequest) =>
			this.request('POST', '/profiles/register', Types.tRegisterResult, { data })
	}

	// ========================================================================
	// ACTION ENDPOINTS
	// ========================================================================

	/** Action endpoints */
	actions = {
		/**
		 * GET /actions - List actions
		 * @param query - Filter and pagination options
		 * @returns List of actions
		 */
		list: (query?: Types.ListActionsQuery) =>
			this.request('GET', '/actions', Types.tListActionsResult, {
				query: query as any
			}),

		/**
		 * GET /actions - List actions with cursor pagination
		 * @param query - Filter and pagination options (including cursor, limit)
		 * @returns Actions with cursor pagination info
		 */
		listPaginated: async (query?: Types.ListActionsQuery) => {
			const result = await this.requestWithMeta('GET', '/actions', Types.tListActionsResult, {
				query: query as any
			})
			return {
				data: result.data,
				cursorPagination: result.meta.cursorPagination
			}
		},

		/**
		 * POST /actions - Create action
		 * @param data - Action data
		 * @returns Created action
		 */
		create: (data: Types.NewAction) =>
			this.request('POST', '/actions', Types.tActionView, { data }),

		/**
		 * GET /actions/:actionId - Get single action
		 * @param actionId - Action ID
		 * @returns Action details
		 */
		get: (actionId: string) => this.request('GET', `/actions/${actionId}`, Types.tActionView),

		/**
		 * PATCH /actions/:actionId - Update action (draft only)
		 * @param actionId - Action ID
		 * @param patch - Patch data
		 * @returns Updated action
		 */
		update: (actionId: string, patch: unknown) =>
			this.request('PATCH', `/actions/${actionId}`, Types.tActionView, {
				data: patch
			}),

		/**
		 * DELETE /actions/:actionId - Delete action
		 * @param actionId - Action ID
		 */
		delete: (actionId: string) => this.request('DELETE', `/actions/${actionId}`, T.struct({})),

		/**
		 * POST /actions/:actionId/accept - Accept action
		 * @param actionId - Action ID
		 */
		accept: (actionId: string) =>
			this.request('POST', `/actions/${actionId}/accept`, T.nullValue),

		/**
		 * POST /actions/:actionId/reject - Reject action
		 * @param actionId - Action ID
		 */
		reject: (actionId: string) =>
			this.request('POST', `/actions/${actionId}/reject`, T.nullValue),

		/**
		 * POST /actions/:actionId/dismiss - Dismiss notification
		 * @param actionId - Action ID
		 */
		dismiss: (actionId: string) =>
			this.request('POST', `/actions/${actionId}/dismiss`, T.nullValue),

		/**
		 * POST /actions/:actionId/stat - Update action statistics
		 * @param actionId - Action ID
		 * @param data - Statistics update
		 */
		updateStat: (actionId: string, data: Types.ActionStatUpdate) =>
			this.request('POST', `/actions/${actionId}/stat`, T.struct({}), {
				data
			}),

		/**
		 * POST /actions/:actionId/reaction - Add reaction to action
		 * @param actionId - Action ID
		 * @param data - Reaction data
		 * @returns Reaction ID
		 */
		addReaction: (actionId: string, data: Types.ReactionRequest) =>
			this.request('POST', `/actions/${actionId}/reaction`, Types.tReactionResponse, { data })
	}

	// ========================================================================
	// FILE ENDPOINTS
	// ========================================================================

	/** File endpoints */
	files = {
		/**
		 * GET /files - List files
		 * @param query - Filter and pagination options
		 * @returns List of files
		 */
		list: (query?: Types.ListFilesQuery) =>
			this.request('GET', '/files', Types.tListFilesResult, {
				query: query as any
			}),

		/**
		 * GET /files - List files with cursor pagination
		 * @param query - Filter and pagination options (including cursor, limit)
		 * @returns Files with cursor pagination info
		 */
		listPaginated: async (query?: Types.ListFilesQuery) => {
			const result = await this.requestWithMeta('GET', '/files', Types.tListFilesResult, {
				query: query as any
			})
			return {
				data: result.data,
				cursorPagination: result.meta.cursorPagination
			}
		},

		/**
		 * POST /files - Create file (metadata-only: CRDT, RTDB, etc.)
		 * @param data - File creation request
		 * @returns Created file ID
		 */
		create: (data: Types.CreateFileRequest) =>
			this.request('POST', '/files', Types.tCreateFileResult, { data }),

		/**
		 * POST /files/{preset}/{fileName} - Upload file blob
		 * @param preset - File preset (e.g., "profile", "cover", "gallery")
		 * @param fileName - File name
		 * @param fileData - File data (Blob, File, or ArrayBuffer)
		 * @param contentType - Content type of the file
		 * @returns Upload result with file ID and optional thumbnail variant ID
		 */
		uploadBlob: async (
			preset: string,
			fileName: string,
			fileData: Blob | File | ArrayBuffer,
			contentType?: string
		) => {
			const url = `${getInstanceUrl(this.opts.idTag)}/api/files/${preset}/${fileName}`
			const body =
				fileData instanceof ArrayBuffer ? fileData : await (fileData as Blob).arrayBuffer()

			const headers: Record<string, string> = {
				'Content-Type':
					contentType ||
					(fileData instanceof File ? fileData.type : 'application/octet-stream')
			}
			if (this.opts.authToken) {
				headers['Authorization'] = `Bearer ${this.opts.authToken}`
			}

			const res = await fetch(url, {
				method: 'POST',
				headers,
				credentials: 'include',
				body
			})

			if (!res.ok) {
				throw new Error(`Upload failed: ${res.status} ${res.statusText}`)
			}

			const result = await res.json()
			// Backend wraps response in ApiResponse envelope with data, time, req_id fields
			const decoded = T.decode(Types.tUploadFileResult, result.data)
			if (T.isErr(decoded)) {
				throw new Error(`Invalid response: ${decoded.err.map((e) => e.error).join(', ')}`)
			}
			return decoded.ok
		},

		/**
		 * GET /files/variant/:variantId - Get specific file variant
		 * @param variantId - Variant ID
		 * @returns Binary file data
		 */
		getVariant: (variantId: string) =>
			fetch(`${getInstanceUrl(this.opts.idTag)}/api/files/variant/${variantId}`, {
				headers: {
					Authorization: `Bearer ${this.opts.authToken}`
				}
			}),

		/**
		 * GET /files/:fileId/descriptor - Get file descriptor and variants
		 * @param fileId - File ID
		 * @returns File descriptor
		 */
		getDescriptor: (fileId: string) =>
			this.request('GET', `/files/${fileId}/descriptor`, Types.tFileDescriptor),

		/**
		 * GET /files/:fileId - Get file (best variant selected)
		 * @param fileId - File ID
		 * @param selector - Optional variant selector
		 * @returns Binary file data
		 */
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

			return fetch(`${getInstanceUrl(this.opts.idTag)}/api/files/${fileId}`, {
				headers: {
					Authorization: `Bearer ${this.opts.authToken}`
				}
			})
		},

		/**
		 * PATCH /files/:fileId - Update file metadata
		 * @param fileId - File ID
		 * @param data - Patch data
		 * @returns Updated file data
		 */
		update: (fileId: string, data: Types.PatchFileRequest) =>
			this.request('PATCH', `/files/${fileId}`, Types.tPatchFileResult, {
				data
			}),

		/**
		 * DELETE /files/:fileId - Move file to trash (soft delete)
		 * @param fileId - File ID
		 * @returns Deleted file result with permanent flag
		 */
		delete: (fileId: string) =>
			this.request('DELETE', `/files/${fileId}`, Types.tDeleteFileResult),

		/**
		 * DELETE /files/:fileId?permanent=true - Permanently delete file (must be in trash)
		 * @param fileId - File ID
		 * @returns Deleted file result
		 */
		permanentDelete: (fileId: string) =>
			this.request('DELETE', `/files/${fileId}`, Types.tDeleteFileResult, {
				query: { permanent: true }
			}),

		/**
		 * POST /files/:fileId/restore - Restore file from trash
		 * @param fileId - File ID
		 * @param parentId - Optional target folder (null = root)
		 * @returns Restored file info
		 */
		restore: (fileId: string, parentId?: string) =>
			this.request('POST', `/files/${fileId}/restore`, Types.tRestoreFileResult, {
				data: { parentId }
			}),

		/**
		 * PATCH /files/:fileId/user - Update user-specific file data
		 * @param fileId - File ID
		 * @param data - User data (pinned, starred)
		 * @returns Updated user data
		 */
		updateUserData: (fileId: string, data: Types.UpdateFileUserDataRequest) =>
			this.request('PATCH', `/files/${fileId}/user`, Types.tUpdateFileUserDataResult, {
				data
			}),

		/**
		 * Set starred status for a file
		 * @param fileId - File ID
		 * @param starred - New starred state
		 * @returns Updated user data
		 */
		setStarred: (fileId: string, starred: boolean) =>
			this.request('PATCH', `/files/${fileId}/user`, Types.tUpdateFileUserDataResult, {
				data: { starred }
			}),

		/**
		 * Set pinned status for a file
		 * @param fileId - File ID
		 * @param pinned - New pinned state
		 * @returns Updated user data
		 */
		setPinned: (fileId: string, pinned: boolean) =>
			this.request('PATCH', `/files/${fileId}/user`, Types.tUpdateFileUserDataResult, {
				data: { pinned }
			}),

		/**
		 * PUT /files/:fileId/tag/:tag - Add tag to file
		 * @param fileId - File ID
		 * @param tag - Tag name
		 * @returns File tags
		 */
		addTag: (fileId: string, tag: string) =>
			this.request('PUT', `/files/${fileId}/tag/${tag}`, Types.tTagResult),

		/**
		 * DELETE /files/:fileId/tag/:tag - Remove tag from file
		 * @param fileId - File ID
		 * @param tag - Tag name
		 * @returns File tags
		 */
		removeTag: (fileId: string, tag: string) =>
			this.request('DELETE', `/files/${fileId}/tag/${tag}`, Types.tTagResult)
	}

	// ========================================================================
	// TRASH ENDPOINTS
	// ========================================================================

	/** Trash management endpoints */
	trash = {
		/**
		 * GET /files?parentId=__trash__ - List files in trash
		 * @returns List of trashed files
		 */
		list: (query?: { limit?: number }) =>
			this.request('GET', '/files', Types.tListFilesResult, {
				query: { ...query, parentId: '__trash__' }
			}),

		/**
		 * DELETE /trash - Empty trash (permanently delete all trashed files)
		 * @returns Number of files deleted
		 */
		empty: () => this.request('DELETE', '/trash', Types.tEmptyTrashResult)
	}

	// ========================================================================
	// TAG ENDPOINTS
	// ========================================================================

	/** Tag endpoints */
	tags = {
		/**
		 * GET /tags - List tags
		 * @param query - Optional filters (prefix, withCounts, limit)
		 * @returns List of tags with optional counts
		 */
		list: (query?: Types.ListTagsQuery) =>
			this.request('GET', '/tags', Types.tListTagsResult, { query: query as any })
	}

	// ========================================================================
	// PROFILE ENDPOINTS
	// ========================================================================

	/** Profile endpoints */
	profiles = {
		/**
		 * GET /me - Get own profile
		 * @returns Own profile with keys
		 */
		getOwn: () => this.request('GET', '/me', Types.tProfileKeys),

		/**
		 * GET /me/full - Get full own profile
		 * @returns Full own profile
		 */
		getOwnFull: () => this.request('GET', '/me/full', Types.tProfileKeys),

		/**
		 * GET /me/full on another node - Get remote profile's full data
		 * @param idTag - Identity tag of the remote profile
		 * @returns Full profile from the remote node
		 */
		getRemoteFull: (idTag: string) =>
			apiFetchHelper<Types.ProfileKeys, unknown>(idTag, 'GET', '/me/full', {
				type: Types.tProfileKeys
			}),

		/**
		 * PATCH /me - Update own profile
		 * @param data - Profile patch
		 * @returns Updated profile
		 */
		updateOwn: (data: Types.ProfilePatch) =>
			this.request('PATCH', '/me', Types.tUpdateProfileResult, { data }),

		/**
		 * GET /profiles - List profiles
		 * @param query - Filter options
		 * @returns List of profiles
		 */
		list: (query?: Types.ListProfilesQuery) =>
			this.request('GET', '/profiles', Types.tListProfilesResult, {
				query: query as any
			}),

		/**
		 * GET /profiles/:idTag - Get profile by ID tag (local relationship state)
		 * @param idTag - Identity tag
		 * @returns Profile or null if not found locally
		 */
		get: (idTag: string) => this.request('GET', `/profiles/${idTag}`, Types.tOptionalProfile),

		/**
		 * PATCH /profiles/:idTag - Update profile connection/relationship
		 * @param idTag - Identity tag
		 * @param data - Patch data
		 */
		updateConnection: (idTag: string, data: Types.PatchProfileConnection) =>
			this.request('PATCH', `/profiles/${idTag}`, T.struct({}), { data }),

		/**
		 * PATCH /admin/profiles/:idTag - Admin update profile (roles, status)
		 * @param idTag - Identity tag
		 * @param data - Admin profile patch data (roles, status, ban_reason)
		 * @returns Updated profile
		 */
		adminUpdate: (idTag: string, data: Types.AdminProfilePatch) =>
			this.request('PATCH', `/admin/profiles/${idTag}`, Types.tUpdateProfileResult, { data })
	}

	// ========================================================================
	// SETTINGS ENDPOINTS
	// ========================================================================

	/** Settings endpoints */
	settings = {
		/**
		 * GET /settings - List settings
		 * @param query - Optional prefix filter
		 * @returns Settings
		 */
		list: (query?: { prefix?: string }) =>
			this.request('GET', '/settings', Types.tListSettingsResult, { query }),

		/**
		 * GET /settings/:name - Get single setting
		 * @param name - Setting name
		 * @returns Setting value
		 */
		get: (name: string) => this.request('GET', `/settings/${name}`, Types.tGetSettingResult),

		/**
		 * PUT /settings/:name - Update setting
		 * @param name - Setting name
		 * @param data - Setting value object
		 */
		update: (name: string, data: { value: unknown }) =>
			this.request('PUT', `/settings/${name}`, T.struct({}), { data })
	}

	// ========================================================================
	// NOTIFICATION ENDPOINTS
	// ========================================================================

	/** Notification endpoints */
	notifications = {
		/**
		 * POST /notifications/subscription - Subscribe to push notifications
		 * @param data - Push subscription object
		 */
		subscribe: (data: { subscription: PushSubscription }) =>
			this.request('POST', '/notifications/subscription', T.struct({}), { data })
	}

	// ========================================================================
	// REFERENCE ENDPOINTS
	// ========================================================================

	/** Reference endpoints */
	refs = {
		/**
		 * GET /ref - List references
		 * @param query - Optional type and resourceId filter
		 * @returns List of references
		 */
		list: (query?: Types.ListRefsQuery) =>
			this.request('GET', '/refs', T.array(Types.tRef), { query }),

		/**
		 * GET /ref/:refId - Get reference details
		 * @param refId - Reference ID
		 * @returns Reference details
		 */
		get: (refId: string) => this.request('GET', `/refs/${refId}`, Types.tRefResponse),

		/**
		 * POST /ref - Create reference
		 * @param data - Reference creation request
		 * @returns Created reference
		 */
		create: (data: Types.CreateRefRequest) =>
			this.request('POST', '/refs', Types.tRef, { data }),

		/**
		 * DELETE /ref/:refId - Delete reference
		 * @param refId - Reference ID
		 * @returns Deleted reference ID
		 */
		delete: (refId: string) => this.request('DELETE', `/refs/${refId}`, Types.tDeleteRefResult)
	}

	// ========================================================================
	// IDP ENDPOINTS
	// ========================================================================

	/** Identity Provider endpoints */
	idp = {
		/**
		 * GET /idp/info on a remote provider - Get provider public info
		 * @param providerDomain - The domain of the identity provider
		 * @returns Provider info (name, info text, optional URL)
		 */
		getInfo: (providerDomain: string) =>
			apiFetchHelper<Types.IdpInfo, unknown>(providerDomain, 'GET', '/idp/info', {
				type: Types.tIdpInfo
			}),

		/**
		 * POST /idp/activate - Activate an identity using a ref token
		 * @param data - Activation request with refId
		 * @returns Activation result with identity status
		 */
		activate: (data: Types.IdpActivateRequest) =>
			this.request('POST', '/idp/activate', Types.tIdpActivateResult, { data })
	}

	// ========================================================================
	// IDP MANAGEMENT ENDPOINTS (for identity provider administrators)
	// ========================================================================

	/** IDP Management endpoints for identity provider administrators */
	idpManagement = {
		/**
		 * GET /idp/identities - List identities managed by this IDP
		 * @param query - Filter and pagination options (q, status, cursor, limit)
		 * @returns List of identities
		 */
		listIdentities: (query?: Types.ListIdpIdentitiesQuery) =>
			this.request('GET', '/idp/identities', Types.tIdpIdentityList, {
				query: query as Record<string, string | number | boolean | undefined>
			}),

		/**
		 * POST /idp/identities - Create new identity
		 * @param data - Identity creation data (idTag, email, ownerIdTag?, createApiKey?, apiKeyName?)
		 * @returns Created identity (with apiKey field if API key was created)
		 */
		createIdentity: (data: Types.CreateIdpIdentityRequest) =>
			this.request('POST', '/idp/identities', Types.tIdpCreateIdentityResult, { data }),

		/**
		 * GET /idp/identities/{idTag} - Get identity details
		 * @param idTag - Identity tag (e.g., "alice.cloudillo.net")
		 * @returns Identity details
		 */
		getIdentity: (idTag: string) =>
			this.request('GET', `/idp/identities/${encodeURIComponent(idTag)}`, Types.tIdpIdentity),

		/**
		 * DELETE /idp/identities/{idTag} - Delete identity
		 * @param idTag - Identity tag (e.g., "alice.cloudillo.net")
		 */
		deleteIdentity: (idTag: string) =>
			this.request('DELETE', `/idp/identities/${encodeURIComponent(idTag)}`, T.nullValue),

		/**
		 * PATCH /idp/identities/{idTag} - Update identity settings
		 * @param idTag - Identity tag (e.g., "alice.cloudillo.net")
		 * @param data - Settings to update (dyndns)
		 * @returns Updated identity
		 */
		updateIdentity: (idTag: string, data: { dyndns?: boolean }) =>
			this.request(
				'PATCH',
				`/idp/identities/${encodeURIComponent(idTag)}`,
				Types.tIdpIdentity,
				{ data }
			),

		/**
		 * GET /idp/api-keys - List API keys for a specified identity
		 * @param idTag - Identity tag to list API keys for (e.g., "alice.cloudillo.net")
		 * @returns List of API keys (without plaintext keys)
		 */
		listApiKeys: (idTag: string) =>
			this.request('GET', '/idp/api-keys', Types.tIdpApiKeyList, {
				query: { idTag }
			}),

		/**
		 * POST /idp/api-keys - Create API key for a specified identity
		 * @param data - API key creation request (idTag, name?)
		 * @returns Created API key with plaintext key (shown only once)
		 */
		createApiKey: (data: { idTag: string; name?: string }) =>
			this.request('POST', '/idp/api-keys', Types.tIdpCreateApiKeyResult, { data }),

		/**
		 * DELETE /idp/api-keys/{keyId} - Revoke API key
		 * @param keyId - Key ID to revoke
		 * @param idTag - Identity tag the key belongs to (e.g., "alice.cloudillo.net")
		 */
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
		/**
		 * PUT /profiles/{id_tag} - Create community profile
		 * @param idTag - Community identity tag to create
		 * @param data - Community creation request
		 * @returns Created community profile
		 */
		create: (idTag: string, data: Types.CreateCommunityRequest) =>
			this.request('PUT', `/profiles/${idTag}`, Types.tCommunityProfileResponse, { data }),

		/**
		 * POST /profiles/verify - Verify community identity availability
		 * @deprecated Use profile.verify() instead
		 * @param data - Verification request
		 * @returns Verification result with errors and server addresses
		 */
		verify: (data: Types.VerifyCommunityRequest) =>
			this.request('POST', '/profiles/verify', Types.tCommunityVerifyResult, { data })
	}

	// ========================================================================
	// ADMIN ENDPOINTS
	// ========================================================================

	/** Admin endpoints for system administration */
	admin = {
		/**
		 * GET /admin/tenants - List all tenants
		 * @param query - Optional filter query
		 * @returns List of tenants with combined auth and meta data
		 */
		listTenants: (query?: Types.ListTenantsQuery) =>
			this.request('GET', '/admin/tenants', Types.tListTenantsResult, {
				query: query as Record<string, string | number | boolean | undefined>
			}),

		/**
		 * POST /admin/tenants/:idTag/password-reset - Send password reset email
		 * @param idTag - Identity tag of the tenant
		 * @returns Password reset response message
		 */
		sendPasswordReset: (idTag: string) =>
			this.request(
				'POST',
				`/admin/tenants/${idTag}/password-reset`,
				Types.tPasswordResetResponse
			),

		/**
		 * POST /admin/email/test - Send a test email to verify SMTP configuration
		 * @param to - Recipient email address
		 * @returns Empty response on success
		 */
		sendTestEmail: (to: string) =>
			this.request('POST', '/admin/email/test', T.struct({}), { data: { to } }),

		/**
		 * GET /admin/proxy-sites - List all proxy sites
		 * @returns List of proxy site configurations
		 */
		listProxySites: () =>
			this.request('GET', '/admin/proxy-sites', Types.tListProxySitesResult),

		/**
		 * POST /admin/proxy-sites - Create a new proxy site
		 * @param data - Proxy site configuration
		 * @returns Created proxy site data
		 */
		createProxySite: (data: Types.CreateProxySiteRequest) =>
			this.request('POST', '/admin/proxy-sites', Types.tProxySiteData, { data }),

		/**
		 * GET /admin/proxy-sites/:siteId - Get a proxy site by ID
		 * @param siteId - Proxy site ID
		 * @returns Proxy site data
		 */
		getProxySite: (siteId: number) =>
			this.request('GET', `/admin/proxy-sites/${siteId}`, Types.tProxySiteData),

		/**
		 * PATCH /admin/proxy-sites/:siteId - Update a proxy site
		 * @param siteId - Proxy site ID
		 * @param data - Fields to update
		 * @returns Updated proxy site data
		 */
		updateProxySite: (siteId: number, data: Types.UpdateProxySiteRequest) =>
			this.request('PATCH', `/admin/proxy-sites/${siteId}`, Types.tProxySiteData, { data }),

		/**
		 * DELETE /admin/proxy-sites/:siteId - Delete a proxy site
		 * @param siteId - Proxy site ID
		 * @returns Deleted site ID
		 */
		deleteProxySite: (siteId: number) =>
			this.request('DELETE', `/admin/proxy-sites/${siteId}`, Types.tDeleteProxySiteResult),

		/**
		 * POST /admin/proxy-sites/:siteId/renew-cert - Trigger certificate renewal
		 * @param siteId - Proxy site ID
		 * @returns Renewal result
		 */
		renewProxySiteCert: (siteId: number) =>
			this.request(
				'POST',
				`/admin/proxy-sites/${siteId}/renew-cert`,
				Types.tRenewProxySiteCertResult
			)
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

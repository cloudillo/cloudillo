// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as T from '@symbion/runtype'

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * API error response
 */
export const tApiError = T.struct({
	error: T.struct({
		code: T.string,
		message: T.string
	})
})
export type ApiError = T.TypeOf<typeof tApiError>

/**
 * Known error codes for type-safe error handling
 */
export type ErrorCode =
	| 'E-AUTH-UNAUTH' // 401 - Authentication required
	| 'E-AUTH-NOPERM' // 403 - Permission denied
	| 'E-CORE-NOTFOUND' // 404 - Resource not found
	| 'E-VAL-INVALID' // 400 - Validation failed
	| 'E-CORE-CONFLICT' // 409 - Conflict
	| 'E-NET-TIMEOUT' // 408 - Timeout
	| 'E-SYS-UNAVAIL' // 503 - Service unavailable
	| 'E-CORE-DBERR' // 500 - Database error
	| 'E-CORE-UNKNOWN' // 500 - Unknown error

// Import types from @cloudillo/types
import {
	Action,
	ActionStatus,
	ActionType,
	ActionView,
	AppCapability,
	AppKind,
	AppManifest,
	ContentTypeAction,
	ContentTypeHandler,
	LaunchMode,
	NewAction,
	Profile,
	ProfileTrust,
	tAction,
	tActionStatus,
	tActionType,
	tActionView,
	tAppCapability,
	// App manifest types
	tAppKind,
	tAppManifest,
	tContentTypeAction,
	tContentTypeHandler,
	tLaunchMode,
	tNewAction,
	tOptionalProfile,
	tProfile,
	tProfileTrust
} from '@cloudillo/types'

// Re-export types from @cloudillo/types
export {
	Action,
	ActionStatus,
	ActionType,
	ActionView,
	AppCapability,
	AppKind,
	AppManifest,
	ContentTypeAction,
	ContentTypeHandler,
	LaunchMode,
	NewAction,
	Profile,
	ProfileTrust,
	tAction,
	tActionStatus,
	tActionType,
	tActionView,
	tAppCapability,
	// App manifest types
	tAppKind,
	tAppManifest,
	tContentTypeAction,
	tContentTypeHandler,
	tLaunchMode,
	tNewAction,
	tOptionalProfile,
	tProfile,
	tProfileTrust
}

// ============================================================================
// AUTH ENDPOINTS
// ============================================================================

// Request types (TypeScript interfaces only - compile-time validation)
export interface LoginRequest {
	idTag: string
	password: string
}

export interface RegisterRequest {
	type: 'idp' | 'domain'
	idTag: string
	appDomain?: string
	email: string
	token: string
}

export interface RegisterVerifyRequest {
	type: 'ref' | 'idp' | 'domain'
	idTag: string
	appDomain?: string
	token: string
}

/**
 * Unified profile verification request (replaces RegisterVerifyRequest and VerifyCommunityRequest)
 * Used for both user registration and community creation verification
 */
export interface VerifyProfileRequest {
	type: 'ref' | 'idp' | 'domain'
	idTag: string
	appDomain?: string
	token?: string // Optional for community creation
}

export interface PasswordChangeRequest {
	currentPassword: string
	newPassword: string
}

export interface SetPasswordRequest {
	refId: string
	newPassword: string
}

export interface ForgotPasswordRequest {
	email: string
}

// Response types (with runtype validators - runtime validation)
export const tLoginResult = T.struct({
	tnId: T.number,
	idTag: T.string,
	roles: T.optional(T.array(T.string)),
	token: T.string,
	name: T.string,
	profilePic: T.string,
	swEncryptionKey: T.optional(T.string)
})
export type LoginResult = T.TypeOf<typeof tLoginResult>

export const tAccessTokenResult = T.struct({
	token: T.string
})
export type AccessTokenResult = T.TypeOf<typeof tAccessTokenResult>

export const tProxyTokenResult = T.struct({
	token: T.string,
	roles: T.optional(T.array(T.string))
})
export type ProxyTokenResult = T.TypeOf<typeof tProxyTokenResult>

export const tIdTagResult = T.struct({
	idTag: T.string
})
export type IdTagResult = T.TypeOf<typeof tIdTagResult>

export const tGetVapidResult = T.struct({
	vapidPublicKey: T.string
})
export type GetVapidResult = T.TypeOf<typeof tGetVapidResult>

export const tSetPasswordResult = tLoginResult
export type SetPasswordResult = T.TypeOf<typeof tSetPasswordResult>

export const tRegisterVerifyResult = T.struct({
	address: T.array(T.string),
	identityProviders: T.array(T.string),
	idTagError: T.optional(
		T.union(T.literal('invalid', 'used', 'nodns', 'address'), T.literal(''))
	),
	appDomainError: T.optional(
		T.union(T.literal('invalid', 'used', 'nodns', 'address'), T.literal(''))
	),
	apiAddress: T.optional(T.string),
	apiAddressType: T.optional(T.string),
	appAddress: T.optional(T.string),
	appAddressType: T.optional(T.string)
})
export type RegisterVerifyResult = T.TypeOf<typeof tRegisterVerifyResult>

// Registration result - server returns empty object for both IDP and domain registration
// User must verify email and set password before they can log in
export const tRegisterResult = T.struct({})
export type RegisterResult = T.TypeOf<typeof tRegisterResult>

/**
 * Unified profile verification result (replaces RegisterVerifyResult and CommunityVerifyResult)
 * Used for both user registration and community creation verification
 */
export const tVerifyProfileResult = T.struct({
	address: T.array(T.string),
	identityProviders: T.array(T.string),
	idTagError: T.optional(
		T.union(T.literal('invalid', 'used', 'nodns', 'address'), T.literal(''))
	),
	appDomainError: T.optional(
		T.union(T.literal('invalid', 'used', 'nodns', 'address'), T.literal(''))
	),
	apiAddress: T.optional(T.string),
	apiAddressType: T.optional(T.string),
	appAddress: T.optional(T.string),
	appAddressType: T.optional(T.string)
})
export type VerifyProfileResult = T.TypeOf<typeof tVerifyProfileResult>

// Identity Provider info (fetched from provider's /api/idp/info endpoint)
export const tIdpInfo = T.struct({
	domain: T.string,
	name: T.string,
	info: T.string,
	url: T.optional(T.string)
})
export type IdpInfo = T.TypeOf<typeof tIdpInfo>

// IDP Activation request/response
export const tIdpActivateRequest = T.struct({
	refId: T.string
})
export type IdpActivateRequest = T.TypeOf<typeof tIdpActivateRequest>

export const tIdpActivateResult = T.struct({
	idTag: T.string,
	status: T.string
})
export type IdpActivateResult = T.TypeOf<typeof tIdpActivateResult>

// Live IDP identity status pulled by the tenant home for the active tenant
// Returned by GET /api/profiles/me/idp-status
export const tIdpStatus = T.literal('pending', 'active', 'suspended')
export type IdpStatus = T.TypeOf<typeof tIdpStatus>

export const tIdpStatusResponse = T.struct({
	status: tIdpStatus,
	// Deletion deadline. Always present for status=pending; may be omitted by
	// the backend once the identity has activated and the value is no longer
	// load-bearing.
	expiresAt: T.optional(T.string),
	// Display name of the IDP, surfaced for the verify-idp UI. Carried on the
	// authenticated idp-status response (not /me) so the recovery email does
	// not leak to federation clients fetching the public profile.
	providerName: T.optional(T.string),
	// Recovery email captured at registration. Optional — communities don't
	// have a recovery email at all.
	email: T.optional(T.string),
	// When the tenant home advanced ui.onboarding to the next step in this same
	// request, the new value is echoed back so the client can release the gate
	// without an extra round-trip to /api/settings.
	onboarding: T.optional(T.nullable(T.string))
})
export type IdpStatusResponse = T.TypeOf<typeof tIdpStatusResponse>

// Returned by POST /api/profiles/me/resend-activation
export const tResendActivationResponse = T.struct({
	expiresAt: T.string
})
export type ResendActivationResponse = T.TypeOf<typeof tResendActivationResponse>

// ============================================================================
// IDP MANAGEMENT TYPES (for identity provider administrators)
// ============================================================================

// IDP Identity status
export const tIdpIdentityStatus = T.literal('pending', 'active', 'suspended')
export type IdpIdentityStatus = T.TypeOf<typeof tIdpIdentityStatus>

// IDP Identity address type
export const tIdpAddressType = T.literal('ipv4', 'ipv6', 'hostname')
export type IdpAddressType = T.TypeOf<typeof tIdpAddressType>

// IDP Identity
export const tIdpIdentity = T.struct({
	idTag: T.string,
	email: T.optional(T.string),
	registrarIdTag: T.string,
	ownerIdTag: T.optional(T.string),
	address: T.optional(T.string),
	addressUpdatedAt: T.optional(T.string),
	dyndns: T.boolean,
	status: tIdpIdentityStatus,
	createdAt: T.string,
	updatedAt: T.string,
	expiresAt: T.string,
	apiKey: T.optional(T.string)
})
export type IdpIdentity = T.TypeOf<typeof tIdpIdentity>

export const tIdpIdentityList = T.array(tIdpIdentity)
export type IdpIdentityList = T.TypeOf<typeof tIdpIdentityList>

// IDP API Key (list item - no plaintext key)
export const tIdpApiKey = T.struct({
	id: T.number,
	idTag: T.string,
	keyPrefix: T.string,
	name: T.optional(T.string),
	createdAt: T.string,
	lastUsedAt: T.optional(T.string),
	expiresAt: T.optional(T.string)
})
export type IdpApiKey = T.TypeOf<typeof tIdpApiKey>

export const tIdpApiKeyList = T.array(tIdpApiKey)
export type IdpApiKeyList = T.TypeOf<typeof tIdpApiKeyList>

// IDP API Key creation result (includes plaintext key shown only once)
export const tIdpCreateApiKeyResult = T.struct({
	apiKey: tIdpApiKey,
	plaintextKey: T.string
})
export type IdpCreateApiKeyResult = T.TypeOf<typeof tIdpCreateApiKeyResult>

// IDP Identity creation result is the same as IdpIdentity (apiKey field is included when created)
export const tIdpCreateIdentityResult = tIdpIdentity
export type IdpCreateIdentityResult = IdpIdentity

// Request types for IDP management
export interface CreateIdpIdentityRequest {
	idTag: string
	email: string
	ownerIdTag?: string
	sendActivationEmail?: boolean
	createApiKey?: boolean
	apiKeyName?: string
}

export interface CreateIdpApiKeyRequest {
	idTag: string
	name?: string
}

export interface ListIdpIdentitiesQuery {
	q?: string
	status?: string
	cursor?: string
	limit?: number
}

// ============================================================================
// WEBAUTHN ENDPOINTS
// ============================================================================

// WebAuthn credential info
export const tWebAuthnCredential = T.struct({
	credentialId: T.string,
	description: T.string
})
export type WebAuthnCredential = T.TypeOf<typeof tWebAuthnCredential>

export const tWebAuthnCredentialList = T.array(tWebAuthnCredential)
export type WebAuthnCredentialList = T.TypeOf<typeof tWebAuthnCredentialList>

// WebAuthn registration challenge response
export const tWebAuthnRegChallengeResult = T.struct({
	options: T.unknown, // CreationChallengeResponse from webauthn-rs
	token: T.string
})
export type WebAuthnRegChallengeResult = T.TypeOf<typeof tWebAuthnRegChallengeResult>

// WebAuthn login challenge response
export const tWebAuthnLoginChallengeResult = T.struct({
	options: T.unknown, // RequestChallengeResponse from webauthn-rs
	token: T.string
})
export type WebAuthnLoginChallengeResult = T.TypeOf<typeof tWebAuthnLoginChallengeResult>

// WebAuthn registration request
export interface WebAuthnRegisterRequest {
	token: string
	response: unknown // RegisterPublicKeyCredential
	description?: string
}

// WebAuthn login request
export interface WebAuthnLoginRequest {
	token: string
	response: unknown // PublicKeyCredential
}

// ============================================================================
// API KEY ENDPOINTS
// ============================================================================

// API key list item
export const tApiKeyListItem = T.struct({
	keyId: T.number,
	keyPrefix: T.string,
	name: T.optional(T.string),
	scopes: T.optional(T.string),
	expiresAt: T.optional(T.number),
	lastUsedAt: T.optional(T.number),
	createdAt: T.number
})
export type ApiKeyListItem = T.TypeOf<typeof tApiKeyListItem>

export const tApiKeyList = T.array(tApiKeyListItem)
export type ApiKeyList = T.TypeOf<typeof tApiKeyList>

// Create API key request
export interface CreateApiKeyRequest {
	name?: string
	scopes?: string
	expiresAt?: number
}

// Update API key request (all fields optional; omitted = unchanged, null = clear)
export interface UpdateApiKeyRequest {
	name?: string | null
	scopes?: string | null
	expiresAt?: number | null
}

// Create API key result (includes plaintext key shown only once)
export const tCreateApiKeyResult = T.struct({
	keyId: T.number,
	keyPrefix: T.string,
	plaintextKey: T.string,
	name: T.optional(T.string),
	scopes: T.optional(T.string),
	expiresAt: T.optional(T.number),
	createdAt: T.number
})
export type CreateApiKeyResult = T.TypeOf<typeof tCreateApiKeyResult>

// ============================================================================
// CURSOR PAGINATION
// ============================================================================

/**
 * Cursor-based pagination info returned by API
 */
export const tCursorPaginationInfo = T.struct({
	nextCursor: T.union(T.string, T.nullValue),
	hasMore: T.boolean
})
export type CursorPaginationInfo = T.TypeOf<typeof tCursorPaginationInfo>

/**
 * API response with cursor pagination
 */
export interface PaginatedResponse<T> {
	data: T[]
	cursorPagination?: CursorPaginationInfo
}

// ============================================================================
// ACTION ENDPOINTS
// ============================================================================

// Request types
export interface PublishActionRequest {
	publishAt?: number // Unix timestamp for scheduled publish (omit for immediate)
}

export interface ActionStatUpdate {
	commentsRead?: number
}

export interface ReactionRequest {
	type: string
	content?: string
}

export interface ListActionsQuery {
	type?: string | string[]
	status?: string | string[]
	issuer?: string
	audience?: string
	involved?: string
	parentId?: string
	rootId?: string
	subject?: string
	createdAfter?: string | number
	tag?: string
	search?: string
	visibility?: string
	cursor?: string // Cursor for pagination
	limit?: number // Items per page (replaces _limit)
	_limit?: number // @deprecated Use limit instead
}

// Response types
export const tReactionResponse = T.struct({
	reactionId: T.string
})
export type ReactionResponse = T.TypeOf<typeof tReactionResponse>

/*
export const tListActionsResult = T.struct({
  actions: T.array(tActionView),
})
*/
export const tListActionsResult = T.array(tActionView)
export type ListActionsResult = T.TypeOf<typeof tListActionsResult>

export const tInboundAction = T.struct({
	token: T.string,
	related: T.optional(T.array(T.string))
})
export type InboundAction = T.TypeOf<typeof tInboundAction>

// ============================================================================
// FILE ENDPOINTS
// ============================================================================

// Request types
export interface CreateFileRequest {
	fileTp: string // "CRDT", "RTDB", "BLOB", "FLDR", etc.
	contentType?: string
	fileName?: string // File name (required for FLDR)
	parentId?: string // Parent folder ID (null = root)
	rootId?: string // Document tree root file ID
	createdAt?: number
	tags?: string
}

export interface PatchFileRequest {
	fileName?: string
	parentId?: string | null // Move file to folder (null = root)
	visibility?: 'D' | 'P' | 'V' | '2' | 'F' | 'C' | null // File visibility level
}

export interface GetFileVariantSelector {
	variant?: string // "orig", "hd", "sd", "tn", "ic"
	minX?: number
	minY?: number
	minRes?: number // minimum resolution in kpx
}

export interface ListFilesQuery {
	fileId?: string
	parentId?: string // Filter by folder: null=root, "__trash__"=trash, or folder fileId
	rootId?: string // Filter by document tree root
	preset?: string
	tag?: string
	status?: ('P' | 'A')[]
	fileTp?: string // File type: 'BLOB', 'CRDT', 'RTDB', 'FLDR'
	contentType?: string
	fileName?: string // Substring search in file name
	ownerIdTag?: string // Filter by owner idTag
	notOwnerIdTag?: string // Exclude files by this owner idTag
	createdAfter?: string | number
	createdBefore?: string | number
	pinned?: boolean // Filter by pinned status (user-specific)
	starred?: boolean // Filter by starred status (user-specific)
	sort?: 'name' | 'created' | 'modified' | 'recent' // Sort field
	sortDir?: 'asc' | 'desc' // Sort direction
	cursor?: string // Cursor for pagination
	limit?: number // Items per page (replaces _limit)
	_limit?: number // @deprecated Use limit instead
}

// User-specific file data (pinned, starred, per-user timestamps)
export const tFileUserData = T.struct({
	accessedAt: T.optional(T.union(T.string, T.date)),
	modifiedAt: T.optional(T.union(T.string, T.date)),
	pinned: T.optional(T.boolean),
	starred: T.optional(T.boolean)
})
export type FileUserData = T.TypeOf<typeof tFileUserData>

// Response types
export const tFileView = T.struct({
	fileId: T.string,
	parentId: T.optional(T.string), // Parent folder ID (null = root, "__trash__" = in trash)
	rootId: T.optional(T.string), // Document tree root file ID
	status: T.literal('P', 'A'),
	preset: T.optional(T.string),
	contentType: T.string,
	fileName: T.string,
	fileTp: T.optional(T.string), // 'BLOB', 'CRDT', 'RTDB', 'FLDR'
	createdAt: T.union(T.string, T.date),
	accessedAt: T.optional(T.union(T.string, T.date)), // Global access timestamp
	modifiedAt: T.optional(T.union(T.string, T.date)), // Global modification timestamp
	userData: T.optional(tFileUserData), // User-specific data (pinned, starred, etc.)
	tags: T.optional(T.array(T.string)),
	x: T.optional(
		T.struct({
			dim: T.optional(T.tuple(T.number, T.number)) // Image dimensions [width, height]
		})
	),
	owner: T.optional(
		T.struct({
			idTag: T.string,
			name: T.optional(T.string),
			profilePic: T.optional(T.string),
			type: T.optional(T.string)
		})
	),
	creator: T.optional(
		T.struct({
			idTag: T.string,
			name: T.optional(T.string),
			profilePic: T.optional(T.string),
			type: T.optional(T.string)
		})
	),
	accessLevel: T.optional(T.literal('read', 'write', 'none')),
	visibility: T.optional(T.union(T.literal('D', 'P', 'V', '2', 'F', 'C'), T.nullValue)) // null/D=Direct, P=Public, V=Verified, 2=2nd degree, F=Followers, C=Connected
})
export type FileView = T.TypeOf<typeof tFileView>

/*
export const tListFilesResult = T.struct({
  files: T.array(tFileView),
})
*/
export const tListFilesResult = T.array(tFileView)
export type ListFilesResult = T.TypeOf<typeof tListFilesResult>

export const tCreateFileResult = T.struct({
	fileId: T.string
})
export type CreateFileResult = T.TypeOf<typeof tCreateFileResult>

export const tUploadFileResult = T.struct({
	fileId: T.string,
	thumbnailVariantId: T.optional(T.string),
	dim: T.optional(T.tuple(T.number, T.number))
})
export type UploadFileResult = T.TypeOf<typeof tUploadFileResult>

export const tFileDescriptor = T.struct({
	file: T.unknown
})
export type FileDescriptor = T.TypeOf<typeof tFileDescriptor>

export const tPatchFileResult = T.struct({
	fileId: T.string,
	fileName: T.optional(T.string)
})
export type PatchFileResult = T.TypeOf<typeof tPatchFileResult>

export const tDeleteFileResult = T.struct({
	fileId: T.string,
	permanent: T.optional(T.boolean) // True if permanently deleted, false if moved to trash
})
export type DeleteFileResult = T.TypeOf<typeof tDeleteFileResult>

// Restore file from trash
export const tRestoreFileResult = T.struct({
	fileId: T.string,
	parentId: T.optional(T.string) // Target folder after restore (null = root)
})
export type RestoreFileResult = T.TypeOf<typeof tRestoreFileResult>

// Duplicate file request
export interface DuplicateFileRequest {
	fileName?: string
	parentId?: string
}

// Empty trash result
export const tEmptyTrashResult = T.struct({
	deleted_count: T.number
})
export type EmptyTrashResult = T.TypeOf<typeof tEmptyTrashResult>

// Update user-specific file data request
export interface UpdateFileUserDataRequest {
	pinned?: boolean
	starred?: boolean
}

// Update user-specific file data result
export const tUpdateFileUserDataResult = T.struct({
	fileId: T.string,
	accessedAt: T.optional(T.union(T.string, T.date)),
	modifiedAt: T.optional(T.union(T.string, T.date)),
	pinned: T.optional(T.boolean),
	starred: T.optional(T.boolean)
})
export type UpdateFileUserDataResult = T.TypeOf<typeof tUpdateFileUserDataResult>

export const tTagResult = T.struct({
	tags: T.array(T.string)
})
export type TagResult = T.TypeOf<typeof tTagResult>

// ============================================================================
// SHARE ENTRY ENDPOINTS
// ============================================================================

// Request types
export interface CreateShareEntryRequest {
	subjectType: string // 'U' (user) | 'L' (link) | 'F' (file)
	subjectId: string
	permission: string // 'R' (read) | 'W' (write) | 'A' (admin)
	expiresAt?: string // ISO timestamp
}

// Response types
export const tShareEntry = T.struct({
	id: T.number,
	resourceType: T.string,
	resourceId: T.string,
	subjectType: T.string,
	subjectId: T.string,
	permission: T.string,
	expiresAt: T.optional(T.union(T.string, T.date)),
	createdBy: T.string,
	createdAt: T.union(T.string, T.date),
	subjectFileName: T.optional(T.string),
	subjectContentType: T.optional(T.string),
	subjectFileTp: T.optional(T.string)
})
export type ShareEntry = T.TypeOf<typeof tShareEntry>

export const tListShareEntriesResult = T.array(tShareEntry)
export type ListShareEntriesResult = T.TypeOf<typeof tListShareEntriesResult>

// ============================================================================
// TAG ENDPOINTS
// ============================================================================

// Request types
export interface ListTagsQuery {
	prefix?: string
	withCounts?: boolean
	limit?: number
}

// Response types
export const tTagInfo = T.struct({
	tag: T.string,
	count: T.optional(T.number)
})
export type TagInfo = T.TypeOf<typeof tTagInfo>

export const tListTagsResult = T.struct({
	tags: T.array(tTagInfo)
})
export type ListTagsResult = T.TypeOf<typeof tListTagsResult>

// ============================================================================
// PROFILE ENDPOINTS
// ============================================================================

// Request types
export interface ProfilePatch {
	name?: string
	x?: Record<string, string | null>
}

// Admin profile update (for role changes, status updates)
export interface AdminProfilePatch {
	name?: string
	roles?: string[]
	status?: 'A' | 'T' | 'B' | 'S' | null // Active, Trusted, Blocked, Suspended
	ban_reason?: string | null
}

export interface PatchProfileConnection {
	status?: 'A' | 'B' | 'T' | null
	following?: boolean | null
	connected?: true | 'R' | null
	trust?: ProfileTrust | null
}

export interface ListProfilesQuery {
	idTag?: string
	type?: 'person' | 'community'
	status?: ('A' | 'B' | 'T')[]
	connected?: boolean | 'R'
	following?: boolean
	q?: string
	/** When true, returns only profiles with a non-null trust preference; when false, only profiles with no trust set. */
	trustSet?: boolean
}

// Response types
export const tProfileKey = T.struct({
	keyId: T.string,
	publicKey: T.string
})
export type ProfileKey = T.TypeOf<typeof tProfileKey>

export const tProfileKeys = T.struct({
	idTag: T.string,
	name: T.optional(T.string),
	type: T.optional(T.literal('person', 'community')),
	profilePic: T.optional(T.string),
	coverPic: T.optional(T.string),
	keys: T.array(tProfileKey),
	settings: T.optional(
		T.struct({
			connectionMode: T.optional(T.literal('M', 'A', 'I')),
			allowFollowers: T.optional(T.boolean)
		})
	),
	x: T.optional(T.record(T.string))
})
export type ProfileKeys = T.TypeOf<typeof tProfileKeys>

export const tImageVariants = T.struct({
	hd: T.optional(T.string),
	sd: T.optional(T.string),
	tn: T.optional(T.string),
	ic: T.optional(T.string)
})
export type ImageVariants = T.TypeOf<typeof tImageVariants>

/*
export const tListProfilesResult = T.struct({
  profiles: T.array(tProfile),
  total: T.optional(T.number),
  limit: T.optional(T.number),
  offset: T.optional(T.number),
})
*/
export const tListProfilesResult = T.array(tProfile)
export type ListProfilesResult = T.TypeOf<typeof tListProfilesResult>

export const tUpdateProfileResult = T.struct({
	profile: tProfile
})
export type UpdateProfileResult = T.TypeOf<typeof tUpdateProfileResult>

// ============================================================================
// SETTINGS ENDPOINTS
// ============================================================================

// Request types
export interface ListSettingsQuery {
	prefix?: string[]
}

export interface PutSettingRequest {
	value: string | number | boolean | null
}

// Response types

// SettingValue can be boolean, integer, string, or JSON
export const tSettingValue = T.union(
	T.boolean,
	T.number,
	T.string,
	T.unknown // JSON object support
)
export type SettingValue = T.TypeOf<typeof tSettingValue>

// Individual setting response with metadata
export const tSettingResponse = T.struct({
	key: T.string,
	value: tSettingValue,
	scope: T.string,
	permission: T.string,
	description: T.string
})
export type SettingResponse = T.TypeOf<typeof tSettingResponse>

// List all settings returns an array of SettingResponse objects
export const tListSettingsResult = T.array(tSettingResponse)
export type ListSettingsResult = T.TypeOf<typeof tListSettingsResult>

// Get single setting returns a SettingResponse
export const tGetSettingResult = tSettingResponse
export type GetSettingResult = T.TypeOf<typeof tGetSettingResult>

// ============================================================================
// REFERENCE ENDPOINTS
// ============================================================================

// Request types
export interface CreateRefRequest {
	type: string
	description?: string
	resourceId?: string // file ID for share.file
	accessLevel?: 'read' | 'comment' | 'write'
	expiresAt?: number // Unix timestamp
	count?: number | null // max uses (null = unlimited, omit = default to 1)
	params?: string // Serialized query string for launch params (e.g., "mode=present&follow=some.id.tag")
}

export interface ListRefsQuery {
	type?: string
	resourceId?: string
	[key: string]: string | undefined
}

// Response types
export const tRef = T.struct({
	refId: T.string,
	type: T.string,
	description: T.optional(T.string),
	resourceId: T.optional(T.string),
	accessLevel: T.optional(T.literal('read', 'comment', 'write')),
	createdAt: T.union(T.string, T.date),
	expiresAt: T.optional(T.union(T.string, T.date)),
	count: T.optional(T.number),
	used: T.optional(T.boolean),
	params: T.optional(T.string)
})
export type Ref = T.TypeOf<typeof tRef>

export const tRefResponse = T.struct({
	refId: T.string,
	type: T.string,
	description: T.optional(T.string),
	resourceId: T.optional(T.string),
	accessLevel: T.optional(T.literal('read', 'comment', 'write')),
	createdAt: T.optional(T.string),
	expiresAt: T.optional(T.string),
	count: T.optional(T.number),
	params: T.optional(T.string)
})
export type RefResponse = T.TypeOf<typeof tRefResponse>

// Token exchange response for ref-based access
export const tRefAccessTokenResult = T.struct({
	token: T.string,
	resourceId: T.string,
	accessLevel: T.literal('read', 'comment', 'write'),
	scope: T.optional(T.string),
	expiresAt: T.optional(T.number),
	params: T.optional(T.string)
})
export type RefAccessTokenResult = T.TypeOf<typeof tRefAccessTokenResult>

export const tDeleteRefResult = T.union(T.struct({ refId: T.string }), T.nullValue)
export type DeleteRefResult = T.TypeOf<typeof tDeleteRefResult>

// ============================================================================
// COMMUNITY CREATION ENDPOINTS
// ============================================================================

// Request types
export interface CreateCommunityRequest {
	type: 'idp' | 'domain'
	name?: string
	appDomain?: string
	token: string
	inviteRef?: string
}

export interface VerifyCommunityRequest {
	type: 'idp' | 'domain'
	idTag: string
	appDomain?: string
}

// Response types
export const tCommunityProfileResponse = T.struct({
	idTag: T.string,
	name: T.string,
	type: T.literal('community'),
	createdAt: T.string,
	// Mirrors the community tenant's initial ui.onboarding value. For an IDP-
	// typed community this is 'verify-idp' until the IDP activation email is
	// clicked; the frontend uses this to show the activation banner and gate
	// content-creation CTAs in the community context.
	onboarding: T.optional(T.nullable(T.string))
})
export type CommunityProfileResponse = T.TypeOf<typeof tCommunityProfileResponse>

export const tCommunityVerifyResult = T.struct({
	address: T.array(T.string),
	identityProviders: T.array(T.string),
	idTagError: T.optional(
		T.union(T.literal('invalid', 'used', 'nodns', 'address'), T.literal(''))
	),
	appDomainError: T.optional(
		T.union(T.literal('invalid', 'used', 'nodns', 'address'), T.literal(''))
	)
})
export type CommunityVerifyResult = T.TypeOf<typeof tCommunityVerifyResult>

// Community invite types (SADM sends invite to connected user)
export interface InviteCommunityRequest {
	targetIdTag: string
	expiresInDays?: number
	message?: string
}

export const tInviteCommunityResult = T.struct({
	refId: T.string,
	inviteUrl: T.string,
	targetIdTag: T.string,
	expiresAt: T.optional(T.number)
})
export type InviteCommunityResult = T.TypeOf<typeof tInviteCommunityResult>

// ============================================================================
// ADMIN TENANT ENDPOINTS
// ============================================================================

// Request types
export interface ListTenantsQuery {
	status?: string
	q?: string
	limit?: number
	offset?: number
}

// Response types
export const tTenantView = T.struct({
	tnId: T.number,
	idTag: T.string,
	name: T.string,
	type: T.literal('person', 'community'),
	email: T.optional(T.string),
	status: T.optional(T.string),
	roles: T.optional(T.array(T.string)),
	profilePic: T.optional(T.string),
	createdAt: T.number
})
export type TenantView = T.TypeOf<typeof tTenantView>

export const tListTenantsResult = T.array(tTenantView)
export type ListTenantsResult = T.TypeOf<typeof tListTenantsResult>

export const tPasswordResetResponse = T.struct({
	message: T.string
})
export type PasswordResetResponse = T.TypeOf<typeof tPasswordResetResponse>

export const tPurgeTenantResponse = T.struct({
	tnId: T.number,
	idTag: T.string,
	blobsRemoved: T.number
})
export type PurgeTenantResponse = T.TypeOf<typeof tPurgeTenantResponse>

// ============================================================================
// ADMIN PROXY SITE ENDPOINTS
// ============================================================================

// Proxy site status: A=Active, D=Disabled
export const tProxySiteStatus = T.literal('A', 'D')
export type ProxySiteStatus = T.TypeOf<typeof tProxySiteStatus>

// Proxy site type
export const tProxySiteType = T.literal('basic', 'advanced')
export type ProxySiteType = T.TypeOf<typeof tProxySiteType>

// Proxy site configuration
export const tProxySiteConfig = T.struct({
	connectTimeoutSecs: T.optional(T.number),
	readTimeoutSecs: T.optional(T.number),
	preserveHost: T.optional(T.boolean),
	proxyProtocol: T.optional(T.boolean),
	customHeaders: T.optional(T.unknown),
	forwardHeaders: T.optional(T.boolean),
	websocket: T.optional(T.boolean)
})
export type ProxySiteConfig = T.TypeOf<typeof tProxySiteConfig>

// Proxy site data (returned by API)
export const tProxySiteData = T.struct({
	siteId: T.number,
	domain: T.string,
	backendUrl: T.string,
	status: tProxySiteStatus,
	type: tProxySiteType,
	certExpiresAt: T.optional(T.string),
	config: tProxySiteConfig,
	createdAt: T.string,
	updatedAt: T.string
})
export type ProxySiteData = T.TypeOf<typeof tProxySiteData>

// List proxy sites result
export const tListProxySitesResult = T.array(tProxySiteData)
export type ListProxySitesResult = T.TypeOf<typeof tListProxySitesResult>

// Delete proxy site result
export const tDeleteProxySiteResult = T.struct({
	siteId: T.number
})
export type DeleteProxySiteResult = T.TypeOf<typeof tDeleteProxySiteResult>

// Renew cert result
export const tRenewProxySiteCertResult = T.struct({
	siteId: T.number,
	message: T.optional(T.string)
})
export type RenewProxySiteCertResult = T.TypeOf<typeof tRenewProxySiteCertResult>

// Request types for proxy site management
export interface CreateProxySiteRequest {
	domain: string
	backendUrl: string
	type?: 'basic' | 'advanced'
	config?: {
		connectTimeoutSecs?: number
		readTimeoutSecs?: number
		preserveHost?: boolean
		proxyProtocol?: boolean
		customHeaders?: Record<string, string>
		forwardHeaders?: boolean
		websocket?: boolean
	}
}

export interface UpdateProxySiteRequest {
	backendUrl?: string
	status?: 'A' | 'D'
	type?: 'basic' | 'advanced'
	config?: {
		connectTimeoutSecs?: number
		readTimeoutSecs?: number
		preserveHost?: boolean
		proxyProtocol?: boolean
		customHeaders?: Record<string, string>
		forwardHeaders?: boolean
		websocket?: boolean
	}
}

// ============================================================================
// LOGIN INIT (combined endpoint)
// ============================================================================

export const tLoginInitAuthenticated = T.struct({
	status: T.literal('authenticated'),
	login: tLoginResult
})

export const tLoginInitUnauthenticated = T.struct({
	status: T.literal('unauthenticated'),
	qrLogin: T.struct({
		sessionId: T.string,
		secret: T.string
	}),
	webAuthn: T.nullable(
		T.struct({
			options: T.unknown,
			token: T.string
		})
	)
})

export const tLoginInitResult = T.union(tLoginInitAuthenticated, tLoginInitUnauthenticated)
export type LoginInitResult = T.TypeOf<typeof tLoginInitResult>

// ============================================================================
// QR LOGIN ENDPOINTS
// ============================================================================

export const tQrLoginInitResult = T.struct({
	sessionId: T.string,
	secret: T.string
})
export type QrLoginInitResult = T.TypeOf<typeof tQrLoginInitResult>

export const tQrLoginStatusResult = T.struct({
	status: T.literal('pending', 'approved', 'denied', 'expired'),
	login: T.optional(
		T.struct({
			tnId: T.optional(T.number),
			idTag: T.optional(T.string),
			roles: T.optional(T.array(T.string)),
			token: T.optional(T.string),
			name: T.optional(T.string),
			profilePic: T.optional(T.string),
			swEncryptionKey: T.optional(T.string)
		})
	)
})
export type QrLoginStatusResult = T.TypeOf<typeof tQrLoginStatusResult>

export const tQrLoginDetailsResult = T.struct({
	userAgent: T.optional(T.string),
	ipAddress: T.optional(T.string)
})
export type QrLoginDetailsResult = T.TypeOf<typeof tQrLoginDetailsResult>

export const tQrLoginRespondResult = T.struct({
	status: T.string
})
export type QrLoginRespondResult = T.TypeOf<typeof tQrLoginRespondResult>

export interface QrLoginRespondRequest {
	approved: boolean
}

// ============================================================================
// CONTACT / ADDRESS BOOK ENDPOINTS
// ============================================================================

// Structured sub-types
export const tContactName = T.struct({
	given: T.optional(T.string),
	family: T.optional(T.string),
	additional: T.optional(T.string),
	prefix: T.optional(T.string),
	suffix: T.optional(T.string)
})
export type ContactName = T.TypeOf<typeof tContactName>

/** vCard EMAIL/TEL/URL with TYPE/PREF parameters. */
export const tTypedValue = T.struct({
	value: T.string,
	type: T.optional(T.array(T.string)),
	pref: T.optional(T.number)
})
export type TypedValue = T.TypeOf<typeof tTypedValue>

/** Live profile data merged onto contacts that link to a Cloudillo profile. */
export const tProfileOverlay = T.struct({
	idTag: T.string,
	name: T.optional(T.string),
	type: T.optional(T.string),
	profilePic: T.optional(T.string),
	connected: T.optional(T.boolean),
	following: T.optional(T.boolean)
})
export type ProfileOverlay = T.TypeOf<typeof tProfileOverlay>

// Contact response types
export const tContactOutput = T.struct({
	cId: T.number,
	abId: T.number,
	uid: T.string,
	etag: T.string,
	fn: T.optional(T.string),
	n: T.optional(tContactName),
	emails: T.optional(T.array(tTypedValue)),
	phones: T.optional(T.array(tTypedValue)),
	org: T.optional(T.string),
	title: T.optional(T.string),
	note: T.optional(T.string),
	photo: T.optional(T.string),
	profileIdTag: T.optional(T.string),
	profile: T.optional(tProfileOverlay),
	/** Set when the stored vCard blob could not be parsed. Clients should render
	 * "record unreadable" rather than treating an empty projection as authoritative. */
	parseError: T.optional(T.string),
	createdAt: T.string,
	updatedAt: T.string
})
export type ContactOutput = T.TypeOf<typeof tContactOutput>

export const tContactListItem = T.struct({
	cId: T.number,
	abId: T.number,
	uid: T.string,
	etag: T.string,
	fn: T.optional(T.string),
	email: T.optional(T.string),
	tel: T.optional(T.string),
	org: T.optional(T.string),
	photo: T.optional(T.string),
	profileIdTag: T.optional(T.string),
	profile: T.optional(tProfileOverlay),
	updatedAt: T.string
})
export type ContactListItem = T.TypeOf<typeof tContactListItem>

export const tContactList = T.array(tContactListItem)
export type ContactList = T.TypeOf<typeof tContactList>

// Contact request types
/**
 * Body for POST (create) and PUT (replace).
 * Field absence means "leave empty" — no merge semantics on full replace.
 */
export interface ContactInput {
	uid?: string
	fn?: string
	n?: ContactName
	emails?: TypedValue[]
	phones?: TypedValue[]
	org?: string
	title?: string
	note?: string
	photo?: string
	profileIdTag?: string
}

/**
 * Body for PATCH. Each field uses three-state semantics:
 * - omitted (field uses `?:`): leave alone
 * - `null`: clear the value
 * - value: replace the value
 */
export type Patch<T> = T | null

export interface ContactPatch {
	fn?: Patch<string>
	n?: Patch<ContactName>
	emails?: Patch<TypedValue[]>
	phones?: Patch<TypedValue[]>
	org?: Patch<string>
	title?: Patch<string>
	note?: Patch<string>
	photo?: Patch<string>
	profileIdTag?: Patch<string>
}

export interface ListContactsQuery {
	q?: string
	cursor?: string
	limit?: number
}

// Address book types
export const tAddressBookOutput = T.struct({
	abId: T.number,
	name: T.string,
	description: T.optional(T.string),
	ctag: T.string,
	createdAt: T.string,
	updatedAt: T.string
})
export type AddressBookOutput = T.TypeOf<typeof tAddressBookOutput>

export const tAddressBookList = T.array(tAddressBookOutput)
export type AddressBookList = T.TypeOf<typeof tAddressBookList>

export interface AddressBookCreate {
	name: string
	description?: string
}

export interface AddressBookPatch {
	name?: Patch<string>
	description?: Patch<string>
}

// Import
export type ImportConflictMode = 'skip' | 'replace' | 'add'

export const tImportContactsError = T.struct({
	index: T.number,
	uid: T.optional(T.string),
	message: T.string
})
export type ImportContactsError = T.TypeOf<typeof tImportContactsError>

export const tImportContactsResult = T.struct({
	total: T.number,
	imported: T.number,
	updated: T.number,
	skipped: T.number,
	errors: T.array(tImportContactsError)
})
export type ImportContactsResult = T.TypeOf<typeof tImportContactsResult>

// ============================================================================
// CALENDAR / CALDAV ENDPOINTS
// ============================================================================

/** iCalendar ATTENDEE / ORGANIZER reference (CAL-ADDRESS URI like mailto:…). */
export const tAttendee = T.struct({
	address: T.string,
	cn: T.optional(T.string),
	/** PARTSTAT — RFC 5545 standard values: `ACCEPTED`, `DECLINED`, `TENTATIVE`,
	 *  `NEEDS-ACTION`, `DELEGATED`. Kept as string because RFC 5545 permits
	 *  iana-token / x-name extensions from imported calendars. */
	partstat: T.optional(T.string),
	/** ROLE — RFC 5545 standard values: `CHAIR`, `REQ-PARTICIPANT`,
	 *  `OPT-PARTICIPANT`, `NON-PARTICIPANT`. Extensions allowed (see above). */
	role: T.optional(T.string),
	rsvp: T.optional(T.boolean)
})
export type Attendee = T.TypeOf<typeof tAttendee>

/** VALARM reminder. Trigger is raw RFC 5545 value (`-PT15M`, absolute DATE-TIME, …). */
export const tAlarm = T.struct({
	/** ACTION: AUDIO / DISPLAY / EMAIL. */
	action: T.optional(T.string),
	trigger: T.optional(T.string),
	description: T.optional(T.string)
})
export type Alarm = T.TypeOf<typeof tAlarm>

// Calendar collection
export const tCalendarOutput = T.struct({
	calId: T.number,
	name: T.string,
	description: T.optional(T.string),
	color: T.optional(T.string),
	/** IANA timezone identifier (e.g. `Europe/Budapest`). Not a TZ abbreviation. */
	timezone: T.optional(T.string),
	/** CSV of supported components, e.g. `"VEVENT,VTODO"`. */
	components: T.string,
	ctag: T.string,
	createdAt: T.string,
	updatedAt: T.string
})
export type CalendarOutput = T.TypeOf<typeof tCalendarOutput>

export const tCalendarList = T.array(tCalendarOutput)
export type CalendarList = T.TypeOf<typeof tCalendarList>

export interface CalendarCreate {
	name: string
	description?: string
	color?: string
	timezone?: string
	/** Defaults to both `VEVENT` + `VTODO` if omitted. */
	components?: string[]
}

export interface CalendarPatch {
	name?: Patch<string>
	description?: Patch<string>
	color?: Patch<string>
	timezone?: Patch<string>
	components?: Patch<string[]>
}

// Calendar object — write (one of `event` / `todo` populated)
export interface EventInput {
	summary?: string
	description?: string
	location?: string
	/** ISO-8601. `allDay=true` uses `VALUE=DATE` semantics. */
	dtstart?: string
	dtend?: string
	allDay?: boolean
	rrule?: string
	/** EXDATE exclusions on the master (ISO-8601); occurrences matching these are skipped. */
	exdate?: string[]
	status?: string
	organizer?: string
	attendees?: Attendee[]
	categories?: string[]
	alarms?: Alarm[]
}

export interface TodoInput {
	summary?: string
	description?: string
	dtstart?: string
	due?: string
	completed?: string
	/** 0–9 (0=undefined, 1=high, 9=low). */
	priority?: number
	status?: string
	rrule?: string
	categories?: string[]
	alarms?: Alarm[]
}

export interface CalendarObjectInput {
	uid?: string
	/** RECURRENCE-ID (ISO-8601) when writing a recurrence-override row; omitted for the master. */
	recurrenceId?: string
	event?: EventInput
	todo?: TodoInput
}

// Calendar object — read (unified VEVENT + VTODO shape)
export const tCalendarObjectOutput = T.struct({
	coId: T.number,
	calId: T.number,
	uid: T.string,
	etag: T.string,
	/** `VEVENT` or `VTODO`. */
	component: T.string,
	summary: T.optional(T.string),
	description: T.optional(T.string),
	location: T.optional(T.string),
	dtstart: T.optional(T.string),
	dtend: T.optional(T.string),
	allDay: T.optional(T.boolean),
	status: T.optional(T.string),
	priority: T.optional(T.number),
	organizer: T.optional(T.string),
	rrule: T.optional(T.string),
	/** RECURRENCE-ID (ISO-8601) for override rows; absent on masters. */
	recurrenceId: T.optional(T.string),
	/** EXDATE list (ISO-8601) on masters; absent on overrides. */
	exdate: T.optional(T.array(T.string)),
	attendees: T.optional(T.array(tAttendee)),
	categories: T.optional(T.array(T.string)),
	alarms: T.optional(T.array(tAlarm)),
	/** Set when the stored iCalendar blob could not be parsed. */
	parseError: T.optional(T.string),
	createdAt: T.string,
	updatedAt: T.string
})
export type CalendarObjectOutput = T.TypeOf<typeof tCalendarObjectOutput>

export const tCalendarObjectListItem = T.struct({
	coId: T.number,
	calId: T.number,
	uid: T.string,
	etag: T.string,
	component: T.string,
	summary: T.optional(T.string),
	location: T.optional(T.string),
	dtstart: T.optional(T.string),
	dtend: T.optional(T.string),
	allDay: T.optional(T.boolean),
	status: T.optional(T.string),
	priority: T.optional(T.number),
	rrule: T.optional(T.string),
	recurrenceId: T.optional(T.string),
	exdate: T.optional(T.array(T.string)),
	categories: T.optional(T.array(T.string)),
	updatedAt: T.string
})
export type CalendarObjectListItem = T.TypeOf<typeof tCalendarObjectListItem>

export const tCalendarObjectList = T.array(tCalendarObjectListItem)
export type CalendarObjectList = T.TypeOf<typeof tCalendarObjectList>

export const tCalendarObjectOutputList = T.array(tCalendarObjectOutput)
export type CalendarObjectOutputList = T.TypeOf<typeof tCalendarObjectOutputList>

/**
 * Body for POST /calendars/:calId/objects/:uid/split. Atomically forks a recurring
 * series at `splitAt`: applies `masterPatch` to the existing master, soft-deletes
 * every override with `recurrenceId >= splitAt`, then creates a new master from
 * `tail` (its `uid` is server-minted). All three steps commit in one transaction.
 */
export interface SplitSeriesRequest {
	/** RECURRENCE-ID of the first occurrence belonging to the new tail series (ISO-8601). */
	splitAt: string
	/** Patch applied to the existing master. Typically sets `event.rrule` to a
	 *  client-computed UNTIL-bounded rule. Optional — omit for no master change. */
	masterPatch?: CalendarObjectInput
	/** Full input for the new tail master. `uid` is ignored; server mints a fresh one. */
	tail: CalendarObjectInput
}

export const tSplitSeriesResponse = T.struct({
	master: tCalendarObjectOutput,
	tail: tCalendarObjectOutput
})
export type SplitSeriesResponse = T.TypeOf<typeof tSplitSeriesResponse>

export interface ListCalendarObjectsQuery {
	/** Restrict to `VEVENT` or `VTODO`. */
	component?: 'VEVENT' | 'VTODO'
	q?: string
	/** Time-range start as ISO-8601. */
	start?: string
	/** Time-range end as ISO-8601. */
	end?: string
	cursor?: string
	limit?: number
	/** Include recurrence-override rows (each with a `recurrenceId`) alongside masters. */
	includeExceptions?: boolean
}

// ============================================================================
// WEBSOCKET TYPES
// vim: ts=2

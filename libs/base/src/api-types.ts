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
	tProfile,
	tOptionalProfile,
	tAction,
	tNewAction,
	tActionView,
	tActionType,
	tActionStatus,
	Profile,
	Action,
	NewAction,
	ActionView,
	ActionType,
	ActionStatus
} from '@cloudillo/types'

// Re-export types from @cloudillo/types
export {
	tProfile,
	tOptionalProfile,
	tAction,
	tNewAction,
	tActionView,
	tActionType,
	tActionStatus,
	Profile,
	Action,
	NewAction,
	ActionView,
	ActionType,
	ActionStatus
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
	registerToken: string
}

export interface RegisterVerifyRequest {
	type: 'ref' | 'idp' | 'domain'
	idTag: string
	appDomain?: string
	registerToken: string
}

export interface PasswordChangeRequest {
	currentPassword: string
	newPassword: string
}

export interface SetPasswordRequest {
	refId: string
	newPassword: string
}

// Response types (with runtype validators - runtime validation)
export const tLoginResult = T.struct({
	tnId: T.number,
	idTag: T.string,
	roles: T.optional(T.array(T.string)),
	token: T.string,
	name: T.string,
	profilePic: T.string
})
export type LoginResult = T.TypeOf<typeof tLoginResult>

export const tAccessTokenResult = T.struct({
	token: T.string
})
export type AccessTokenResult = T.TypeOf<typeof tAccessTokenResult>

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

// Identity Provider info (fetched from provider's /api/idp/info endpoint)
export const tIdpInfo = T.struct({
	domain: T.string,
	name: T.string,
	info: T.string,
	url: T.optional(T.string)
})
export type IdpInfo = T.TypeOf<typeof tIdpInfo>

// ============================================================================
// ACTION ENDPOINTS
// ============================================================================

// Request types
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
	audience?: string
	involved?: string
	parentId?: string
	rootId?: string
	subject?: string
	createdAfter?: string | number
	_limit?: number
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
	fileTp: string // "CRDT", "RTDB", "BLOB", etc.
	contentType?: string
	createdAt?: number
	tags?: string
}

export interface PatchFileRequest {
	fileName?: string
}

export interface GetFileVariantSelector {
	variant?: string // "orig", "hd", "sd", "tn", "ic"
	min_x?: number
	min_y?: number
	min_res?: number // minimum resolution in kpx
}

export interface ListFilesQuery {
	fileId?: string
	preset?: string
	tag?: string
	status?: ('P' | 'A')[]
	contentType?: string
	createdAfter?: string | number
	createdBefore?: string | number
	_limit?: number
}

// Response types
export const tFileView = T.struct({
	fileId: T.string,
	status: T.literal('P', 'A'),
	preset: T.optional(T.string),
	contentType: T.string,
	fileName: T.string,
	fileTp: T.optional(T.string),
	createdAt: T.union(T.string, T.date),
	tags: T.optional(T.array(T.string)),
	x: T.optional(T.unknown),
	owner: T.optional(
		T.struct({
			idTag: T.string,
			name: T.optional(T.string),
			profilePic: T.optional(T.string),
			type: T.optional(T.string)
		})
	)
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
	thumbnailVariantId: T.optional(T.string)
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
	fileId: T.string
})
export type DeleteFileResult = T.TypeOf<typeof tDeleteFileResult>

export const tTagResult = T.struct({
	tags: T.array(T.string)
})
export type TagResult = T.TypeOf<typeof tTagResult>

// ============================================================================
// TAG ENDPOINTS
// ============================================================================

// Request types
export interface ListTagsQuery {
	prefix?: string
}

// Response types
export const tTagInfo = T.struct({
	tag: T.string,
	count: T.optional(T.number)
})
export type TagInfo = T.TypeOf<typeof tTagInfo>

/*
export const tListTagsResult = T.struct({
  tags: T.array(tTagInfo),
})
*/
export const tListTagsResult = T.array(tTagInfo)
export type ListTagsResult = T.TypeOf<typeof tListTagsResult>

// ============================================================================
// PROFILE ENDPOINTS
// ============================================================================

// Request types
export interface ProfilePatch {
	name?: string
	x?: {
		category?: string | null
		intro?: string | null
	}
}

export interface PatchProfileConnection {
	status?: 'A' | 'B' | 'T' | null
	following?: boolean | null
	connected?: true | 'R' | null
}

export interface ListProfilesQuery {
	idTag?: string
	type?: 'person' | 'community'
	status?: ('A' | 'B' | 'T')[]
	connected?: boolean | 'R'
	following?: boolean
	q?: string
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
	keys: T.array(tProfileKey)
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
	accessLevel?: 'read' | 'write'
	expiresAt?: number // Unix timestamp
	count?: number // max uses
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
	accessLevel: T.optional(T.literal('read', 'write')),
	createdAt: T.union(T.string, T.date),
	expiresAt: T.optional(T.union(T.string, T.date)),
	count: T.optional(T.number),
	used: T.optional(T.boolean)
})
export type Ref = T.TypeOf<typeof tRef>

export const tRefResponse = T.struct({
	refId: T.string,
	type: T.string,
	description: T.optional(T.string),
	resourceId: T.optional(T.string),
	accessLevel: T.optional(T.literal('read', 'write')),
	createdAt: T.optional(T.number),
	expiresAt: T.optional(T.number),
	count: T.optional(T.number)
})
export type RefResponse = T.TypeOf<typeof tRefResponse>

// Token exchange response for ref-based access
export const tRefAccessTokenResult = T.struct({
	token: T.string,
	resourceId: T.string,
	accessLevel: T.literal('read', 'write'),
	scope: T.optional(T.string),
	expiresAt: T.optional(T.number)
})
export type RefAccessTokenResult = T.TypeOf<typeof tRefAccessTokenResult>

export const tDeleteRefResult = T.struct({
	refId: T.string
})
export type DeleteRefResult = T.TypeOf<typeof tDeleteRefResult>

// ============================================================================
// WEBSOCKET TYPES
// vim: ts=2

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

import { PushSubscription } from 'web-push'
import * as T from '@symbion/runtype'
import { Action, ActionView } from '@cloudillo/types'

export { Action, ActionView }

export interface Auth {
	idTag?: string
	roles: string[]
}

/* Metadata */
export interface File {
	fileId: string
	owner?: {
		idTag: string
		profilePic?: string
	}
	preset?: string
	contentType: string
	fileName: string
	createdAt: Date
	status: 'M' | 'I' | 'P' | 'D'
	tags: string[]
	x?: Record<string, unknown>
}

export const tListFilesOptions = T.struct({
	_limit: T.optional(T.number),
	fileId: T.optional(T.string),
	variantId: T.optional(T.string),
	filter: T.optional(T.literal('mut', 'imm')),
	tag: T.optional(T.string),
	preset: T.optional(T.string),
	variant: T.optional(T.string),
	includeVariants: T.optional(T.boolean)
})
export type ListFilesOptions = T.TypeOf<typeof tListFilesOptions>

export interface CreateFileOptions {
	status: 'M' | 'I' | 'P'
	ownerTag?: string
	preset?: string
	contentType: string
	fileName?: string
	createdAt?: Date
	tags?: string[]
	x?: Record<string, unknown>
}

export interface CreateFileVariantOptions {
	variant: string
	format: string
	size: number
}

export interface UpdateFileOptions {
	fileName?: string
	createdAt?: Date
	meta?: Record<string, unknown>
	status?: 'I'
}

/* Tags */
export interface Tag {
	tag: string
	privileged: boolean
}

/* Tenants */
export interface Tenant {
	tnId: number
	idTag: string
	name: string
	type: 'person' | 'community'
	profilePic?: {
		ic: string
		sd?: string
		hd?: string
	}
	coverPic?: {
		sd: string
		hd?: string
	}
	createdAt: Date
	x?: Record<string, unknown>
}
export type TenantData = Omit<Tenant, 'tnId' | 'idTag' | 'createdAt'>
export type TenantPatch = T.PatchStruct<TenantData>

/* Profiles */
export type ProfileStatus =
	'A'			// Active
	| 'B'		// Blocked
	| 'T'		// Trusted

export type ProfilePerm =
	| 'M'		// Moderated
	| 'W'		// Write
	| 'A'		// Admin

export interface Profile {
	idTag: string
	name: string
	type?: 'person' | 'community'
	profilePic?: string
	status?: ProfileStatus
	connected?: boolean | 'R'
	following?: boolean
	perm?: ProfilePerm
}

export interface ListProfilesOptions {
	type?: 'person' | 'community'
	status?: ProfileStatus[]
	connected?: boolean | 'R'
	following?: boolean
	q?: string
	idTag?: string
}

export interface UpdateProfileOptions {
	status?: ProfileStatus | null
	perm?: ProfilePerm | null
	synced?: boolean
	following?: boolean | null
	connected?: true | 'R' | null
}

/* Refs */
export interface ListRefsOptions {
	type?: string
	filter?: 'active' | 'used' | 'expired' | 'all'
}

export interface Ref {
	refId: string
	type: string
	description?: string
	createdAt: Date
	expiresAt?: Date
	count: number
}

export interface CreateRefOptions {
	type: string
	description?: string
	expiresAt?: Date
	count?: number
}

/* Actions */
export interface ListActionsOptions {
	types?: string[]
	tag?: string
	statuses?: string[]
	audience?: string
	involved?: string
	actionId?: string
	parentId?: string
	rootId?: string
	subject?: string
	createdAfter?: string | number
	_limit?: number
}

export interface UpdateActionDataOptions {
	status?: string | null
	reactions?: number | null
	comments?: number | null
	commentsRead?: number | null
}

export interface CreateOutboundActionOptions {
	followTag?: string
	audienceTag?: string
}

/* Settinsgs */
export interface ListSettingsOptions {
	prefix?: string[]
}

/* Subscriptions */
export interface Subscription {
	id: number
	subscription: PushSubscription
	idTag: string
}

export interface MetaAdapter {
	// Files
	listFiles: (tnId: number, auth: Auth | undefined, opts: ListFilesOptions) => Promise<(File & { variantId?: string, variant?: string, variantFormat?: string })[]>
	getFileVariant: (tnId: number, fileId: string, variant: string) => Promise<string | undefined>
	readFile: (tnId: number, fileId: string) => Promise<File | undefined>
	readFileAuth: (tnId: number, auth: Auth | undefined, fileId: string) => Promise<File | undefined>
	createFile: (tnId: number, fileId: string, opts: CreateFileOptions) => Promise<void>
	createFileVariant: (tnId: number, fileId: string | undefined, variantId: string, opts: CreateFileVariantOptions) => Promise<void>
	updateFile: (tnId: number, fileId: string, opts: UpdateFileOptions) => Promise<void>
	deleteFile: (tnId: number, fileId: string) => Promise<void>
	processPendingFilesPrepare: (callback: (tnId: number, meta: File) => Promise<boolean>) => Promise<number>

	// Tags
	listTags: (tnId: number, prefix?: string) => Promise<Tag[]>
	addTag: (tnId: number, fileId: string, tag: string) => Promise<void>
	removeTag: (tnId: number, fileId: string, tag: string) => Promise<void>
	setTagPerm: (tnId: number, tag: string, perm: 'read' | 'write' | 'admin', userId: number) => Promise<void>

	// Tenants
	readTenant: (tnId: number) => Promise<Tenant | undefined>
	getTenantIdentityTag: (tnId: number) => Promise<string>
	createTenant: (tnId: number, idTag: string, tenant: TenantData) => Promise<number>
	updateTenant: (tnId: number, tenant: TenantPatch) => Promise<Tenant | undefined>
	deleteTenant: (tnId: number) => Promise<void>

	// Profiles
	listProfiles: (tnId: number, opts: ListProfilesOptions) => Promise<Profile[]>
	readProfile: (tnId: number, idTag: string) => Promise<Profile & { eTag?: string } | undefined>
	createProfile: (tnId: number, profile: Profile, eTag: string | undefined) => Promise<void>
	updateProfile: (tnId: number, idTag: string, opts: UpdateProfileOptions) => Promise<void>
	getProfilePublicKey: (tnId: number, idTag: string, keyId: string) => Promise<{ publicKey: string, expires?: number } | undefined>
	addProfilePublicKey: (tnId: number, idTag: string, key: { keyId: string, publicKey: string, expires?: number }) => Promise<void>
	processProfileRefresh: (callback: (tnId: number, idTag: string, eTag: string | undefined) => Promise<boolean>) => Promise<number>

	// Refs
	listRefs: (tnId: number, opts?: ListRefsOptions) => Promise<Ref[]>
	createRef: (tnId: number, refId: string, opts: CreateRefOptions) => Promise<Ref>
	getRef: (tnId: number, refId: string) => Promise<{ refId: string, type: string } | undefined>
	useRef: (tnId: number, refId: string) => Promise<{ count: number }>
	deleteRef: (tnId: number, refId: string) => Promise<void>

	// Actions
	listActions: (tnId: number, auth: Auth | undefined, opts: ListActionsOptions) => Promise<ActionView[]>
	listActionTokens: (tnId: number, auth: Auth | undefined, opts: ListActionsOptions) => Promise<string[]>
	getActionRootId: (tnId: number, actionId: string) => Promise<string>
	getActionData: (tnId: number, actionId: string) => Promise<{ subject?: string, reactions?: number, comments?: number } | undefined>
	getActionByKey: (tnId: number, actionKey: string) => Promise<Action | undefined>
	getActionToken: (tnId: number, actionId: string) => Promise<string | undefined>
	createAction: (tnId: number, action: Action, key?: string) => Promise<void>
	updateActionData: (tnId: number, actionId: string, opts: UpdateActionDataOptions) => Promise<void>
	// Inbound actions
	createInboundAction: (tnId: number, actionId: string, token: string, rel?: string) => Promise<void>
	processPendingInboundActions: (callback: (tnId: number, actionId: string, token: string) => Promise<boolean>) => Promise<number>
	updateInboundAction: (tnId: number, actionId: string, opts: { status: 'R' | 'P' | 'D' | null }) => Promise<void>
	// Outbound actions
	createOutboundAction: (tnId: number, actionId: string, token: string, opts: CreateOutboundActionOptions) => Promise<void>
	processPendingOutboundActions: (callback: (tnId: number, actionId: string, type: string, token: string, recipientTag: string) => Promise<boolean>) => Promise<number>

	// Settings
	listSettings: (tnId: number, opts: ListSettingsOptions) => Promise<Record<string, string | number | boolean | undefined>>
	readSetting: (tnId: number, name: string) => Promise<string | number | boolean | undefined>
	updateSetting: (tnId: number, name: string, value?: string | number | boolean | null) => Promise<void>

	// Subscriprions
	listSubscriptions: (tnId: number) => Promise<Subscription[]>
	createSubscription: (tnId: number, subscription: string) => Promise<void>
	deleteSubscription: (tnId: number, subscription: number) => Promise<void>
}

// vim: ts=4

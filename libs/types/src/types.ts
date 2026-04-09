// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as T from '@symbion/runtype'

// Profile connection status: true = connected, 'R' = request pending, undefined = not connected
export const tProfileConnectionStatus = T.union(T.boolean, T.literal('R'))
export type ProfileConnectionStatus = T.TypeOf<typeof tProfileConnectionStatus>

// Profile status: A = Active, T = Trusted, B = Blocked, M = Muted, S = Suspended
export const tProfileStatus = T.literal('A', 'T', 'B', 'M', 'S')
export type ProfileStatus = T.TypeOf<typeof tProfileStatus>

// Community role hierarchy (matches backend core/roles.rs)
export const tCommunityRole = T.literal(
	'public',
	'follower',
	'supporter',
	'contributor',
	'moderator',
	'leader'
)
export type CommunityRole = T.TypeOf<typeof tCommunityRole>

// Numeric role levels for permission comparison
export const ROLE_LEVELS: Record<CommunityRole, number> = {
	public: 0,
	follower: 1,
	supporter: 2,
	contributor: 3,
	moderator: 4,
	leader: 5
}

// ============================================================================
// PROFILE SECTIONS
// ============================================================================

// Section types available for profile about page
export const tSectionType = T.literal(
	'about',
	'contact',
	'location',
	'links',
	'work',
	'education',
	'skills',
	'rules',
	'custom'
)
export type SectionType = T.TypeOf<typeof tSectionType>

// Section visibility for personal profiles
export const tPersonalVisibility = T.literal('P', 'F', 'C')
export type PersonalVisibility = T.TypeOf<typeof tPersonalVisibility>

// Section visibility for community profiles (role-based)
export const tCommunityVisibility = T.literal(
	'P',
	'follower',
	'supporter',
	'contributor',
	'moderator',
	'leader'
)
export type CommunityVisibility = T.TypeOf<typeof tCommunityVisibility>

// Generic link icon options
export const tLinkIcon = T.literal(
	'globe',
	'mail',
	'phone',
	'map-pin',
	'code',
	'video',
	'music',
	'book',
	'briefcase',
	'heart',
	'star',
	'message',
	'rss',
	'file'
)
export type LinkIcon = T.TypeOf<typeof tLinkIcon>

// Tab configuration entry
export const tTabEntry = T.struct({
	id: T.string,
	visible: T.boolean,
	order: T.number,
	label: T.optional(T.string)
})
export type TabEntry = T.TypeOf<typeof tTabEntry>

// Tab configuration
export const tTabConfig = T.struct({
	tabs: T.array(tTabEntry),
	defaultTab: T.optional(T.string)
})
export type TabConfig = T.TypeOf<typeof tTabConfig>

// Section content types (structured sections store JSON-encoded content)
export interface ContactContent {
	email?: string
	phone?: string
	website?: string
}

export interface LinkEntry {
	label: string
	url: string
	icon?: LinkIcon
}

export interface LinksContent {
	links: LinkEntry[]
}

export interface LocationContent {
	city?: string
	country?: string
	address?: string
}

export interface WorkEntry {
	org: string
	role?: string
	from?: string
	to?: string
}

export interface WorkContent {
	entries: WorkEntry[]
}

export interface EducationEntry {
	school: string
	degree?: string
	from?: string
	to?: string
}

export interface EducationContent {
	entries: EducationEntry[]
}

export interface SkillsContent {
	tags: string[]
}

// ============================================================================
// PROFILE
// ============================================================================

export const tProfile = T.struct({
	idTag: T.string,
	name: T.optional(T.string),
	type: T.optional(T.literal('person', 'community')),
	profilePic: T.optional(T.string),
	status: T.optional(tProfileStatus),
	connected: T.optional(tProfileConnectionStatus),
	following: T.optional(T.boolean),
	roles: T.optional(T.array(T.string)), // Community roles (e.g., ['leader'], ['moderator'])
	x: T.optional(T.record(T.string))
})
export type Profile = T.TypeOf<typeof tProfile>

export const tOptionalProfile = T.nullable(tProfile)
export type OptionalProfile = T.TypeOf<typeof tOptionalProfile>

export const tActionType = T.literal(
	'CONN',
	'FLLW',
	'POST',
	'REPOST',
	'REACT',
	'CMNT',
	'SHRE',
	'MSG',
	'FSHR',
	'PRINVT'
)
export type ActionType = T.TypeOf<typeof tActionType>

export const tActionStatus = T.literal(
	'P', // Pending (draft/unpublished)
	'A', // Active (default when NULL - published/finalized)
	'D', // Deleted (soft delete)
	'C', // Created (pending approval - e.g. connection requests)
	'N', // New (notification - awaiting user acknowledgment)
	'R', // Draft (saved but not yet published)
	'S' // Scheduled (draft with confirmed publish time)
)
export type ActionStatus = T.TypeOf<typeof tActionStatus>

export const tAction = T.struct({
	actionId: T.string,
	type: T.string,
	subType: T.optional(T.string),
	parentId: T.optional(T.string),
	rootId: T.optional(T.string),
	issuerTag: T.string,
	audienceTag: T.optional(T.string),
	content: T.optional(T.unknown),
	attachments: T.optional(T.array(T.string)),
	subject: T.optional(T.string),
	createdAt: T.number,
	expiresAt: T.optional(T.number)
})
export type Action = T.TypeOf<typeof tAction>

export const tNewAction = T.struct({
	type: T.string,
	subType: T.optional(T.string),
	parentId: T.optional(T.string),
	rootId: T.optional(T.string),
	audienceTag: T.optional(T.string),
	content: T.optional(T.unknown),
	attachments: T.optional(T.array(T.string)),
	subject: T.optional(T.string),
	expiresAt: T.optional(T.number),
	visibility: T.optional(T.string), // 'P' = Public, 'C' = Connected, 'F' = Followers
	draft: T.optional(T.boolean), // true = save as draft (status 'R')
	publishAt: T.optional(T.number) // Unix timestamp for scheduled publishing
})
export type NewAction = T.TypeOf<typeof tNewAction>

// Profile info embedded in actions (subset of Profile)
export const tProfileInfo = T.struct({
	idTag: T.string,
	name: T.optional(T.string),
	profilePic: T.optional(T.string),
	type: T.optional(T.literal('person', 'community'))
})
export type ProfileInfo = T.TypeOf<typeof tProfileInfo>

export const tActionView = T.struct({
	actionId: T.string,
	type: T.string,
	subType: T.optional(T.string),
	parentId: T.optional(T.string),
	rootId: T.optional(T.string),
	issuer: tProfileInfo,
	audience: T.optional(tProfileInfo),
	content: T.optional(T.unknown),
	attachments: T.optional(
		T.array(
			T.struct({
				fileId: T.string,
				dim: T.optional(T.union(T.tuple(T.number, T.number), T.nullValue)),
				localVariants: T.optional(T.array(T.string)) // Locally available variants: ["vis.tn", "vis.sd", ...]
			})
		)
	),
	subject: T.optional(T.string),
	createdAt: T.union(T.string, T.number),
	expiresAt: T.optional(T.union(T.string, T.number)),
	status: T.optional(tActionStatus),
	stat: T.optional(
		T.struct({
			ownReaction: T.optional(T.string),
			reactions: T.optional(T.string),
			comments: T.optional(T.number),
			commentsRead: T.optional(T.number)
		})
	),
	visibility: T.optional(T.string),
	x: T.optional(T.unknown) // Extensible metadata (x.role for SUBS, etc.)
})
export type ActionView = T.TypeOf<typeof tActionView>

// Action types //
//////////////////

// User relations
export const tConnectAction = T.struct({
	type: T.literal('CONN'),
	subType: T.undefinedValue,
	content: T.optional(T.string),
	attachments: T.undefinedValue,
	parentId: T.undefinedValue,
	audience: T.undefinedValue,
	subject: T.string
})
export type ConnectAction = T.TypeOf<typeof tConnectAction>

export const tFollowAction = T.struct({
	type: T.literal('FLLW'),
	subType: T.undefinedValue,
	content: T.undefinedValue,
	attachments: T.undefinedValue,
	parentId: T.undefinedValue,
	audience: T.undefinedValue,
	subject: T.string
})
export type FollowAction = T.TypeOf<typeof tFollowAction>

// Posts
export const tPostAction = T.struct({
	type: T.literal('POST'),
	subType: T.string,
	content: T.string,
	attachments: T.optional(T.array(T.string)),
	parentId: T.undefinedValue,
	audience: T.optional(T.string),
	subject: T.undefinedValue
})
export type PostAction = T.TypeOf<typeof tPostAction>

// Content spreading
export const tAckAction = T.struct({
	type: T.literal('ACK'),
	subType: T.undefinedValue,
	content: T.undefinedValue,
	attachments: T.undefinedValue,
	parentId: T.string,
	audience: T.optional(T.string),
	subject: T.undefinedValue
})
export type AckAction = T.TypeOf<typeof tAckAction>

export const tRepostAction = T.struct({
	type: T.literal('REPOST'),
	subType: T.undefinedValue,
	content: T.optional(T.string),
	attachments: T.optional(T.array(T.string)),
	parentId: T.string,
	audience: T.optional(T.string),
	subject: T.undefinedValue
})
export type RepostAction = T.TypeOf<typeof tRepostAction>

export const tShareAction = T.struct({
	type: T.literal('SHRE'),
	subType: T.undefinedValue,
	content: T.optional(T.string),
	attachments: T.undefinedValue,
	parentId: T.undefinedValue,
	audience: T.string,
	subject: T.string
})
export type ShareAction = T.TypeOf<typeof tShareAction>

// Content reactions
export const tCommentAction = T.struct({
	type: T.literal('CMNT'),
	subType: T.undefinedValue,
	content: T.string,
	attachments: T.optional(T.array(T.string)),
	parentId: T.string,
	audience: T.undefinedValue,
	subject: T.undefinedValue
})
export type CommentAction = T.TypeOf<typeof tCommentAction>

export const tReactAction = T.struct({
	type: T.literal('REACT'),
	subType: T.literal('LIKE', 'LOVE', 'LAUGH', 'WOW', 'SAD', 'ANGRY', 'DEL'),
	content: T.undefinedValue,
	attachments: T.undefinedValue,
	parentId: T.string,
	audience: T.undefinedValue,
	subject: T.undefinedValue
})
export type ReactAction = T.TypeOf<typeof tReactAction>

export const tReactionStatAction = T.struct({
	type: T.literal('RSTAT'),
	subType: T.undefinedValue,
	content: T.struct({ comment: T.number, reactions: T.array(T.number) }),
	attachments: T.undefinedValue,
	parentId: T.string,
	audience: T.undefinedValue,
	subject: T.undefinedValue
})
export type ReactionStatAction = T.TypeOf<typeof tReactionStatAction>

// Messages
export const tMessageAction = T.struct({
	type: T.literal('MSG'),
	subType: T.string,
	content: T.string,
	attachments: T.optional(T.array(T.string)),
	parentId: T.optional(T.string), // CONV_id for group messages, MSG_id for replies
	audience: T.optional(T.string), // For DMs only
	subject: T.undefinedValue // Forbidden (use parentId for CONV hierarchy)
})
export type MessageAction = T.TypeOf<typeof tMessageAction>

// Files
export const tFileShareAction = T.struct({
	type: T.literal('FSHR'),
	subType: T.optional(T.literal('READ', 'COMMENT', 'WRITE')),
	content: T.struct({ fileName: T.string, contentType: T.string, fileTp: T.optional(T.string) }),
	attachments: T.undefinedValue,
	parentId: T.undefinedValue,
	audience: T.string,
	subject: T.string
})

export const tBaseAction = T.taggedUnion('type')({
	// User relations
	CONN: tConnectAction,
	FLLW: tFollowAction,

	// Posts
	POST: tPostAction,
	// Content spreading
	ACK: tAckAction,
	REPOST: tRepostAction,
	SHRE: tShareAction,
	// Content reactions
	CMNT: tCommentAction,
	REACT: tReactAction,
	RSTAT: tReactionStatAction,

	// Messages
	MSG: tMessageAction,

	// Files
	FSHR: tFileShareAction
})
export type BaseAction = T.TypeOf<typeof tBaseAction>

// ============================================
// APP MANIFEST
// ============================================

// App kinds
export const tAppKind = T.literal('internal', 'bundled', 'installed')
export type AppKind = T.TypeOf<typeof tAppKind>

// Well-known capabilities
export const tAppCapability = T.literal(
	'storage',
	'settings',
	'crdt',
	'rtdb',
	'camera',
	'sensor',
	'media',
	'document',
	'embed',
	'notification'
)
export type AppCapability = T.TypeOf<typeof tAppCapability>

// Well-known content type actions
export const tContentTypeAction = T.literal('view', 'edit', 'create')
export type ContentTypeAction = T.TypeOf<typeof tContentTypeAction>

// Import source declaration — external MIME types an app can convert from
export const tImportSource = T.struct({
	mimeType: T.string,
	label: T.string,
	extensions: T.optional(T.array(T.string))
})
export type ImportSource = T.TypeOf<typeof tImportSource>

// Content type handler
export const tContentTypeHandler = T.struct({
	mimeType: T.string,
	actions: T.optional(T.array(T.string)),
	priority: T.optional(T.string),
	importFrom: T.optional(T.array(tImportSource))
})
export type ContentTypeHandler = T.TypeOf<typeof tContentTypeHandler>

// Launch mode — a broad declaration of how the app can be started
export const tLaunchMode = T.struct({
	id: T.string,
	label: T.string,
	description: T.optional(T.string),
	accept: T.optional(T.array(T.string)),
	translations: T.optional(
		T.record(
			T.struct({
				label: T.optional(T.string),
				description: T.optional(T.string)
			})
		)
	)
})
export type LaunchMode = T.TypeOf<typeof tLaunchMode>

// Main app manifest
export const tAppManifest = T.struct({
	// Core identity
	id: T.string,
	name: T.string,
	version: T.string,
	kind: tAppKind,

	// Loading (external/bundled apps)
	url: T.optional(T.string),

	// Display
	icon: T.optional(T.string),
	description: T.optional(T.string),
	translations: T.optional(
		T.record(
			T.struct({
				name: T.optional(T.string),
				description: T.optional(T.string)
			})
		)
	),

	// Content type handling
	contentTypes: T.optional(T.array(tContentTypeHandler)),

	// Launch modes
	launchModes: T.optional(T.array(tLaunchMode)),

	// Menu hint (default order for initial menu config; undefined = not in menu)
	defaultOrder: T.optional(T.number),

	// Bus capabilities this app uses
	capabilities: T.optional(T.array(T.string)),

	// Extensibility
	meta: T.optional(T.record(T.unknown))
})
export type AppManifest = T.TypeOf<typeof tAppManifest>

// vim: ts=4

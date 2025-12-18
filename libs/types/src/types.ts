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

// Profile connection status: true = connected, 'R' = request pending, undefined = not connected
export const tProfileConnectionStatus = T.union(T.boolean, T.literal('R'))
export type ProfileConnectionStatus = T.TypeOf<typeof tProfileConnectionStatus>

// Profile status: A = Active, T = Trusted, B = Blocked, M = Muted, S = Suspended
export const tProfileStatus = T.literal('A', 'T', 'B', 'M', 'S')
export type ProfileStatus = T.TypeOf<typeof tProfileStatus>

export const tProfile = T.struct({
	idTag: T.string,
	name: T.optional(T.string),
	type: T.optional(T.literal('person', 'community')),
	profilePic: T.optional(T.string),
	status: T.optional(tProfileStatus),
	connected: T.optional(tProfileConnectionStatus),
	following: T.optional(T.boolean)
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
	'FLLW',
	'SHRE',
	'MSG',
	'FSHR'
)
export type ActionType = T.TypeOf<typeof tActionType>

export const tActionStatus = T.literal(
	'P', // Pending (draft/unpublished)
	'A', // Active (default when NULL - published/finalized)
	'D', // Deleted (soft delete)
	'C', // Created (pending approval - e.g. connection requests)
	'N' // New (notification - awaiting user acknowledgment)
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
	visibility: T.optional(T.string) // 'P' = Public, 'C' = Connected, 'F' = Followers
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
			reactions: T.optional(T.number),
			comments: T.optional(T.number),
			commentsRead: T.optional(T.number)
		})
	),
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
	subType: T.undefinedValue,
	content: T.literal('LOVE'),
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
	subType: T.optional(T.literal('READ', 'WRITE')),
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

// vim: ts=4

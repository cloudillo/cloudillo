// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ActionView, ConvContent, Profile, ProfileConnectionStatus } from '@cloudillo/types'

export type { ConvContent }

//////////////////////
// Action datatypes //
//////////////////////
export interface MsgAction extends ActionView {
	type: 'MSG'
	parentId?: undefined
	content: string
	// Optimistic-send fields (client-only; never sent to the server). `tempId`
	// matches the optimistic row to its eventual create result; `sendStatus`
	// drives the send-status indicator in `Msg` (named to avoid colliding with
	// ActionView.status, the server action lifecycle status).
	sendStatus?: 'sending' | 'sent' | 'failed'
	tempId?: string
}

export interface MsgTextAction extends MsgAction {
	type: 'MSG'
	subType: undefined | 'TEXT'
	parentId?: undefined
	content: string
}

export interface MsgImageAction extends MsgAction {
	type: 'MSG'
	subType: 'IMG'
	parentId?: undefined
	content: string
	attachments: ActionView['attachments']
}
export type ActionEvt = MsgAction | MsgTextAction | MsgImageAction

//////////////////////
// Conversation types
//////////////////////
export type ConversationType = 'direct' | 'group'
export type ConversationTab = 'all' | 'direct' | 'groups'
export type MemberRole = 'observer' | 'member' | 'moderator' | 'admin'

export interface Conversation {
	id: string // actionId for CONV, idTag for direct
	type: ConversationType
	ownerTag?: string // Group node idTag (CONV issuer) — audience for membership actions
	name?: string // Group name (from CONV content)
	description?: string // Group description
	profiles: Profile[] // Participants
	memberCount?: number // For groups
	isOpen?: boolean // Open to join (O flag)
	lastMessage?: MsgAction
	// Stale DM or left group → shown in the collapsed "Archived" section.
	archived?: boolean
	// Left group (SUBS:DEL): read-only history + "Left" badge.
	left?: boolean
	// Direct peer connection state (drives the "Not connected" badge).
	connected?: ProfileConnectionStatus
	// Newest message timestamp (recency sort + stale-DM split).
	lastMessageAt?: string | number
	// CONV `stat` (group unread is derived from lastCommentAt > commentsReadAt,
	// mirroring the feed's comment dot). Populated for groups from the embedded
	// subjectAction when the conversation list is loaded.
	stat?: ActionView['stat']
}

export type MemberStatus = 'active' | 'invited'

export interface ConversationMember {
	profile: Profile
	role: MemberRole
	status: MemberStatus
	actionId: string // SUBS actionId for members, INVT actionId for invited
	joinedAt?: string
}

// Helper to extract role from action's x metadata
export function getActionRole(action: ActionView): MemberRole {
	const xRole = (action as ActionView & { x?: { role?: string } }).x?.role
	return (xRole || 'member') as MemberRole
}

// vim: ts=4

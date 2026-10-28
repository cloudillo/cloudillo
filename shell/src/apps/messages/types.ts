// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type {
	ActionView,
	CommunityRole,
	ConvContent,
	Profile,
	ProfileConnectionStatus,
	ReaderState
} from '@cloudillo/types'
import { ROLE_LEVELS, roleLevel } from '@cloudillo/types'

export type { ConvContent }

//////////////////////
// Action datatypes //
//////////////////////
export interface MsgAction extends ActionView {
	type: 'MSG'
	parentId?: undefined
	// null once deleted (MSG:DEL blanks the row in place)
	content: string | null
	// In-place edit/delete markers written by the backend on MSG:UPD / MSG:DEL
	// (`editedAt` = epoch s of the edit; `deletedBy` = deleter's idTag).
	x?: { editedAt?: number; deletedBy?: string }
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
	// Newest message (reader-state `last` embed) for the row preview.
	lastMessage?: MsgAction
	// Newest activity timestamp (reader-state `lastAt`; recency sort).
	lastMessageAt?: string | number
	// Explicit archive pref (user action; the backend clears it on a new message).
	archived?: boolean
	// Left group (SUBS:DEL, no reader-state row): read-only history + "Left" badge.
	// Independent of `archived`.
	left?: boolean
	pinned?: boolean
	// Effective mute (an expired `notifyUntil` already folded to unmuted):
	// 'mentions' = notify T, 'none' = notify M; absent = all messages.
	muteLevel?: 'mentions' | 'none'
	muteUntil?: number // epoch seconds; absent = until turned back on
	ignoreAll?: boolean // ignore @all mentions
	// Backend unread count as loaded (≥1 when the manual unread flag is set).
	// Live/local-read adjusted values are in `unreadCountAtom` (useConversationUnread).
	unreadCount?: number
	mentioned?: boolean // mentionedAt > readAt as loaded
	// Community idTag when the CONV is issued by a community (groups only).
	communityTag?: string
	// CONV content, groups only (set by useMessages): avatar file id (served by `ownerTag`)
	// and the community join policy (absent `join` = private).
	picture?: string
	join?: 'role' | 'request' | 'private'
	joinMinRole?: CommunityRole
	// idTag of whoever last changed the group settings (CONV `x.editedBy`).
	editedBy?: string
	// Direct peer connection state (drives the "Not connected" badge).
	connected?: ProfileConnectionStatus
	// CONV `stat` (groups only).
	stat?: ActionView['stat']
	// The reader's own reader-state row: `P:MSG` (direct) or `A:CONV` (group).
	readerState?: ReaderState
}

// 'requested' = a knock (SUBS status 'C' on the community node), moderator+ only.
export type MemberStatus = 'active' | 'invited' | 'requested'

export interface ConversationMember {
	profile: Profile
	role: MemberRole
	status: MemberStatus
	actionId: string // SUBS actionId for members and requests, INVT actionId for invited
	joinedAt?: string
}

// Helper to extract role from action's x metadata
export function getActionRole(action: ActionView): MemberRole {
	const xRole = (action as ActionView & { x?: { role?: string } }).x?.role
	return (xRole || 'member') as MemberRole
}

export const MEMBER_ROLES: MemberRole[] = ['observer', 'member', 'moderator', 'admin']

/** The group role a community role maps to (leader → admin, moderator → moderator). */
export function communityMappedRole(
	communityRoles: readonly string[] | undefined
): MemberRole | undefined {
	const level = roleLevel(communityRoles)
	return level >= ROLE_LEVELS.leader
		? 'admin'
		: level >= ROLE_LEVELS.moderator
			? 'moderator'
			: undefined
}

/**
 * Effective group role, mirroring the backend's `helpers::effective_role`: the higher of the
 * SUBS role and the community-mapped role. Pass `communityRoles` only for a community group
 * (the mapping applies only to CONVs with `x.createdBy`).
 */
export function effectiveRole(
	subsRole: MemberRole | undefined,
	communityRoles?: readonly string[]
): MemberRole | undefined {
	const mapped = communityMappedRole(communityRoles)
	if (!mapped || !subsRole) return subsRole ?? mapped
	return MEMBER_ROLES.indexOf(mapped) > MEMBER_ROLES.indexOf(subsRole) ? mapped : subsRole
}

/**
 * The user's own effective group role: none once `left`; the CONV owner is admin, everyone
 * else their active SUBS role, raised per `effectiveRole` by `communityRoles`.
 */
export function myGroupRole({
	ownerTag,
	members,
	me,
	communityRoles,
	left
}: {
	ownerTag?: string
	members?: ConversationMember[]
	me?: string
	communityRoles?: readonly string[]
	left?: boolean
}): MemberRole | undefined {
	if (left) return undefined
	const subsRole =
		me && ownerTag === me
			? 'admin'
			: members?.find((m) => m.profile.idTag === me && m.status === 'active')?.role
	return effectiveRole(subsRole, communityRoles)
}

// vim: ts=4

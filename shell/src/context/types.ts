// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Multi-Context UI - Type Definitions
 *
 * Defines types for the multi-context architecture that enables
 * switching between user's own profile and communities.
 */

/**
 * Type of context (user's own profile or community)
 */
export type ContextType = 'me' | 'community'

/**
 * Active context information
 * Represents the currently active community or user profile
 */
export interface ActiveContext {
	/** ID tag of the context (e.g., 'alice', 'community.example') */
	idTag: string

	/** Type of context */
	type: ContextType

	/** Display name */
	name: string

	/** Profile picture URL or file ID */
	profilePic?: string

	/** User's roles in this context */
	roles: string[]

	/** User's permissions in this context */
	permissions: string[]

	/** Additional metadata */
	metadata?: Record<string, unknown>
}

/**
 * Reference to a community that user is a member of
 */
export interface CommunityRef {
	/** ID tag of the community */
	idTag: string

	/** Display name */
	name: string

	/** Profile picture URL or file ID */
	profilePic?: string

	/** Whether this community is favorited/pinned */
	isFavorite: boolean

	/**
	 * Whether this community's posts appear in the merged home feed.
	 * Defaults to true; false opts the community out of home (shown only in its
	 * own feed). Backed by `profiles.hidden_in_home` (NULL = shown, 1 = hidden).
	 */
	showInHome: boolean

	/** Number of unread notifications in this community */
	unreadCount: number

	/** Last activity timestamp */
	lastActivityAt: Date | null

	/** Number of members (optional) */
	memberCount?: number

	/** Description (optional) */
	description?: string

	/** Whether the community is pending (not yet usable) */
	isPending?: boolean

	/**
	 * Why the community is pending — 'dns' means DNS propagation hasn't
	 * resolved the new domain yet, 'verify-idp' means the community's IDP
	 * identity is still in Pending state and will be auto-deleted at the IDP
	 * deadline if the activation email isn't clicked.
	 */
	pendingReason?: 'dns' | 'verify-idp'

	/** When the community was created (for pending communities) */
	pendingSince?: Date
}

/**
 * Sidebar state
 */
export interface SidebarState {
	/** Whether sidebar is open (mobile) */
	isOpen: boolean

	/** Whether sidebar is pinned (desktop) */
	isPinned: boolean
}

/**
 * Context switch event
 */
export interface ContextSwitchEvent {
	/** Context switched from */
	from: string

	/** Context switched to */
	to: string

	/** Timestamp of the switch */
	timestamp: Date
}

/**
 * Context info response from backend
 */
export interface ContextInfo {
	/** ID tag */
	idTag: string

	/** Context type */
	type: 'user' | 'community'

	/** Display name */
	name: string

	/** Profile picture */
	profilePic?: string

	/** User's roles in this context */
	userRoles: string[]

	/** User's permissions in this context */
	userPermissions: string[]

	/** Additional metadata */
	metadata?: {
		memberCount?: number
		description?: string
		createdAt?: string
		[key: string]: unknown
	}
}

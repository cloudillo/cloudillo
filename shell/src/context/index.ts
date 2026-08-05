// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Multi-Context UI - Public API
 *
 * Exports all types, atoms, and hooks for multi-context functionality.
 */

// Atoms
export {
	activeContextAtom,
	activeContextDisplayAtom,
	communitiesAtom,
	contextIdpEnabledAtom,
	contextIdpEnabledCacheAtom,
	contextOnboardingAtom,
	contextRolesAtom,
	contextSwitchingAtom,
	favoriteCommunitiesAtom,
	favoritesAtom,
	fileViewUpdateAtom,
	lastContextSwitchAtom,
	previewCommunityAtom,
	recentCommunitiesAtom,
	recentContextsAtom,
	sessionTrustAtom,
	sidebarAtom,
	storedTrustAtom,
	totalUnreadCountAtom
} from './atoms'
// Constants
export { HOME_CONTEXT } from './constants'
// Context-aware API
export { useContextAwareApi } from './context-aware-api'
export type { GuestDocumentInfo, GuestFileType } from './guest-document'
// Guest document state (for guest ref link navigation)
export { guestDocumentAtom, useGuestDocument } from './guest-document'
// Hooks
export {
	isContextLeader,
	LEADER_ONLY_APPS,
	loadIdpEnabled,
	useApiContext,
	useCommunitiesList,
	useContextPath,
	useContextSwitch,
	useSidebar
} from './hooks'
// Components
export { Sidebar } from './sidebar'
export type { EffectiveTrust, UseProfileTrust } from './trust'
// Trust
export { useProfileTrust, useProfileTrustBootstrap } from './trust'
// Types
export type {
	ActiveContext,
	CommunityRef,
	ContextInfo,
	ContextSwitchEvent,
	ContextType,
	SidebarState
} from './types'
// Route synchronization
export {
	useContextFromRoute,
	useCurrentContextIdTag,
	useUrlContextIdTag
} from './use-context-from-route'
// Proactive proxy-token renewal
export { useContextTokenRenewal } from './useContextTokenRenewal'
// Community verify-idp gate
export { CommunityVerifyIdpBanner, useCommunityContentGate } from './verify-idp-banner'

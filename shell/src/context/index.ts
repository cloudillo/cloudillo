// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Multi-Context UI - Public API
 *
 * What the rest of the shell may reach for. The sidebar state, the switch log and the
 * context caches stay unexported on purpose — they are this module's own bookkeeping, and
 * a cross-module writer would race `setActiveContext`.
 */

// Atoms
export {
	activeContextAtom,
	activeContextDisplayAtom,
	communitiesAtom,
	contextIdpEnabledAtom,
	contextOnboardingAtom,
	contextRolesAtom,
	favoriteCommunitiesAtom,
	favoritesAtom,
	fileViewUpdateAtom,
	partnerCommunitiesAtom,
	previewCommunityAtom,
	recentCommunitiesAtom,
	sessionTrustAtom,
	storedTrustAtom
} from './atoms'
// Constants
export { HOME_CONTEXT } from './constants'
// Context-aware API
export { useContextAwareApi } from './context-aware-api'
// Which context the URL names
export type { Ctx } from './ctx'
export { CtxProvider, useCtx } from './ctx'
export type { GuestFileType } from './guest-document'
// Guest document state (for guest ref link navigation)
export { isGuestDocumentPath, useGuestDocument } from './guest-document'
// Hooks
export {
	canAdminContext,
	contextToolAllowed,
	isContextLeader,
	LEADER_ONLY_APPS,
	loadIdpEnabled,
	useActiveCommunity,
	useApiContext,
	useCommunitiesList,
	useContextRolesFor,
	useContextSwitch,
	useContextSwitchNav,
	useCurrentContextIdTag,
	useSidebar
} from './hooks'
// Components
export { ContextTools, Sidebar } from './sidebar'
// Trust
export { useProfileTrust, useProfileTrustBootstrap } from './trust'
// Types
export type { ActiveContext, CommunityRef } from './types'
// Proactive proxy-token renewal
export { useContextTokenRenewal } from './useContextTokenRenewal'
// Community verify-idp gate
export { CommunityVerifyIdpBanner } from './verify-idp-banner'

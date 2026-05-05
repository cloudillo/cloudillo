// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Multi-Context UI - Jotai Atoms
 *
 * State management atoms for multi-context architecture.
 */

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { ProfileTrust } from '@cloudillo/types'
import type {
	ActiveContext,
	CommunityRef,
	ContextToken,
	ContextDataCache,
	SidebarState,
	ContextSwitchEvent
} from './types'

/**
 * Active context atom
 * Represents the currently active community or user profile
 *
 * Default: null (will be initialized to user's own context on auth)
 */
export const activeContextAtom = atom<ActiveContext | null>(null)

/**
 * Per-context `ui.onboarding` value, keyed by idTag.
 *
 * Populated from the per-context settings API right after a context switch
 * completes (or when its proxy token refreshes), and consumed by the activation
 * banner. A value of `'verify-idp'` means the community context's IDP identity
 * has not yet been activated — content-creation CTAs in that context should be
 * disabled. `null` (or absent) means no gating.
 */
export const contextOnboardingAtom = atom<Record<string, string | null>>({})

/**
 * Context tokens cache
 * Maps idTag -> token data
 *
 * This stores proxy tokens for accessing different communities.
 * The user's own token is stored in authAtom and not duplicated here.
 */
export const contextTokensAtom = atom<Map<string, ContextToken>>(new Map())

/**
 * Communities list
 * All communities the user is a member of
 *
 * Persisted to localStorage for quick loading
 */
export const communitiesAtom = atomWithStorage<CommunityRef[]>('cloudillo:communities', [])

/**
 * Pinned communities
 * Array of idTags that are pinned to sidebar
 *
 * Backend sync handled in hooks - stored via settings API as 'ui.pinned_communities'
 */
export const favoritesAtom = atom<string[]>([])

/**
 * Recent contexts (LRU)
 * Array of idTags in order of recent access (most recent first)
 * Limited to 10 entries
 *
 * Persisted to localStorage
 */
export const recentContextsAtom = atomWithStorage<string[]>('cloudillo:recent-contexts', [])

/**
 * Sidebar state
 *
 * Persisted to localStorage
 */
export const sidebarAtom = atomWithStorage<SidebarState>('cloudillo:sidebar', {
	isOpen: false,
	isPinned: true
})

/**
 * Context data cache
 * Maps contextIdTag -> dataType -> cached data
 *
 * This is an in-memory cache (not persisted) for quick context switching.
 * Cache entries expire after 5 minutes.
 */
export const contextDataCacheAtom = atom<ContextDataCache>({})

/**
 * Last context switch event
 * Used for analytics and debugging
 */
export const lastContextSwitchAtom = atom<ContextSwitchEvent | null>(null)

/**
 * Context switching in progress flag
 * True while switching contexts
 */
export const contextSwitchingAtom = atom<boolean>(false)

/**
 * Session-scoped trust decisions for foreign profiles.
 *
 * Values:
 *   'S' — "this session": proxy token may be attached to passive reads for this tab
 *   'X' — "continue anonymous": proxy token must NOT be attached, even if persisted trust is 'always'
 *
 * A map entry for a given idTag takes precedence over the persisted `profiles.trust` field
 * for the lifetime of the tab. Cleared on reload.
 */
export const sessionTrustAtom = atom<Map<string, 'S' | 'X'>>(new Map())

/**
 * Known-value cache of the persisted `profiles.trust` column, keyed by foreign idTag.
 *
 * A key is present only when the server has told us `'always'` or `'never'` for that profile.
 * Missing keys mean "unknown or unset" — both are treated as "ask" by the fetch gate.
 *
 * Populated from profile responses (list, get, settings page) via
 * `useProfileTrust().rememberStoredTrust`, and kept in sync with setTrust mutations.
 */
export const storedTrustAtom = atom<Map<string, ProfileTrust>>(new Map())

/**
 * Trust-cache seed status. Keyed by idTag so an effect race during a user
 * switch cannot read user B's trust against user A's `ready=true` flag.
 */
export const trustBootstrapAtom = atom<{ idTag: string | null; ready: boolean }>({
	idTag: null,
	ready: false
})

/**
 * Derived atom: Pinned communities
 * Returns communities that are pinned, preserving user's custom order
 */
export const favoriteCommunitiesAtom = atom((get) => {
	const communities = get(communitiesAtom)
	const favorites = get(favoritesAtom)
	// Map favorites array to communities, preserving order from favorites
	return favorites
		.map((idTag) => communities.find((c) => c.idTag === idTag))
		.filter((c): c is CommunityRef => c !== undefined)
})

/**
 * Derived atom: Preview community
 *
 * Returns a CommunityRef when the active context is a community NOT in
 * favorites, otherwise null. Avoids duplicating the logic in the sidebar
 * component.
 */
export const previewCommunityAtom = atom((get) => {
	const active = get(activeContextAtom)
	if (!active || active.type !== 'community') return null
	const favorites = get(favoritesAtom)
	if (favorites.includes(active.idTag)) return null
	const communities = get(communitiesAtom)
	const found = communities.find((c) => c.idTag === active.idTag)
	if (found) return found
	// Fallback: synthesize a minimal CommunityRef from ActiveContext so the
	// slot still renders even before communitiesAtom is populated on a cold
	// load.
	return {
		idTag: active.idTag,
		name: active.name,
		profilePic: active.profilePic,
		isFavorite: false,
		unreadCount: 0,
		lastActivityAt: null
	} satisfies CommunityRef
})

/**
 * Derived atom: Recent communities
 * Returns communities in order of recent access
 */
export const recentCommunitiesAtom = atom((get) => {
	const communities = get(communitiesAtom)
	const recentIdTags = get(recentContextsAtom)

	// Map recent idTags to communities
	const recentCommunities: CommunityRef[] = []
	for (const idTag of recentIdTags) {
		const community = communities.find((c) => c.idTag === idTag)
		if (community) {
			recentCommunities.push(community)
		}
	}

	return recentCommunities
})

/**
 * Derived atom: Total unread count
 * Sum of unread counts across all communities
 */
export const totalUnreadCountAtom = atom((get) => {
	const communities = get(communitiesAtom)
	return communities.reduce((sum, c) => sum + c.unreadCount, 0)
})

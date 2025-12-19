/**
 * Multi-Context UI - Jotai Atoms
 *
 * State management atoms for multi-context architecture.
 */

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
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

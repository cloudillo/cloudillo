/**
 * Multi-Context UI - React Hooks
 *
 * Custom hooks for managing multi-context state and operations.
 */

import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { useNavigate } from 'react-router-dom'
import { createApiClient, ApiClient } from '@cloudillo/base'
import { useApi, useAuth } from '@cloudillo/react'

import {
	activeContextAtom,
	contextTokensAtom,
	communitiesAtom,
	favoritesAtom,
	recentContextsAtom,
	sidebarAtom,
	contextDataCacheAtom,
	lastContextSwitchAtom,
	contextSwitchingAtom,
	favoriteCommunitiesAtom,
	recentCommunitiesAtom,
	totalUnreadCountAtom
} from './atoms'

import type { ActiveContext, CommunityRef, ContextToken, ContextSwitchEvent } from './types'

/**
 * Hook for managing API context and multi-context operations
 *
 * Provides methods to switch contexts, get tokens, and manage API clients
 * for different communities.
 *
 * @example
 * ```typescript
 * const {
 *   activeContext,
 *   setActiveContext,
 *   getTokenFor,
 *   getClientFor
 * } = useApiContext()
 *
 * // Switch to a community
 * await setActiveContext('alice.community')
 *
 * // Get API client for specific context
 * const aliceApi = getClientFor('alice.community')
 * ```
 */
export function useApiContext() {
	const [activeContext, setActiveContextState] = useAtom(activeContextAtom)
	const [contextTokens, setContextTokens] = useAtom(contextTokensAtom)
	const { api: primaryApi } = useApi()
	const [auth] = useAuth()
	const [isLoading, setIsLoading] = React.useState(false)
	const [error, setError] = React.useState<Error | undefined>()

	// Cache API clients per idTag
	const apiClientsRef = React.useRef<Map<string, ApiClient>>(new Map())

	/**
	 * Get API client for specific context
	 * @param idTag - ID tag of the context
	 * @param token - Optional token to use (bypasses cache lookup)
	 */
	const getClientFor = React.useCallback(
		(idTag: string, token?: string): ApiClient | null => {
			// Return cached client if exists
			if (apiClientsRef.current.has(idTag)) {
				return apiClientsRef.current.get(idTag)!
			}

			// User's own context uses primary API
			if (idTag === auth?.idTag) {
				return primaryApi
			}

			// Use provided token or get from cache
			let authToken = token
			if (!authToken) {
				const tokenData = contextTokens.get(idTag)
				if (!tokenData) {
					console.warn(`No token available for context: ${idTag}`)
					return null
				}

				// Check if token is expired
				if (tokenData.expiresAt <= new Date()) {
					console.warn(`Token expired for context: ${idTag}`)
					return null
				}
				authToken = tokenData.token
			}

			// Create new client
			const client = createApiClient({
				idTag,
				authToken
			})

			// Cache it
			apiClientsRef.current.set(idTag, client)

			return client
		},
		[contextTokens, auth?.idTag, primaryApi]
	)

	/**
	 * Get proxy token for specific context
	 * Fetches from backend if not cached or expired
	 * @returns Object with token and roles (roles may be empty for federated tokens)
	 */
	const getTokenFor = React.useCallback(
		async (idTag: string): Promise<{ token: string; roles: string[] } | null> => {
			// User's own context uses primary token
			if (idTag === auth?.idTag) {
				return auth?.token ? { token: auth.token, roles: [] } : null
			}

			// Check if we have primary API
			if (!primaryApi) {
				throw new Error('Not authenticated')
			}

			// Check cache (roles are now cached alongside token)
			const cached = contextTokens.get(idTag)
			if (cached && cached.expiresAt > new Date()) {
				// Return cached token with cached roles
				return { token: cached.token, roles: cached.roles || [] }
			}

			try {
				// Fetch new proxy token for the target idTag
				const result = await primaryApi.auth.getProxyToken(idTag)

				// Cache it (proxy tokens expire after 24h, cache for 23h)
				const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000)
				const tokenData: ContextToken = {
					token: result.token,
					tnId: 0, // TODO: Get tnId from result if available
					roles: result.roles || [],
					expiresAt
				}

				setContextTokens((prev) => {
					const next = new Map(prev)
					next.set(idTag, tokenData)
					return next
				})

				return { token: result.token, roles: result.roles || [] }
			} catch (err) {
				console.error(`Failed to get proxy token for ${idTag}:`, err)
				throw err
			}
		},
		[contextTokens, auth, primaryApi, setContextTokens]
	)

	/**
	 * Switch to different context
	 * Fetches token if needed and updates active context
	 */
	const setActiveContext = React.useCallback(
		async (idTag: string) => {
			setIsLoading(true)
			setError(undefined)

			try {
				// Get token and roles (will fetch if needed)
				const tokenResult = await getTokenFor(idTag)
				if (!tokenResult) {
					throw new Error(`Failed to get token for context: ${idTag}`)
				}

				// Get API client - pass token directly since state update may be async
				const contextApi = getClientFor(idTag, tokenResult.token)
				if (!contextApi) {
					throw new Error(`Failed to create API client for context: ${idTag}`)
				}

				// Create context with roles from proxy token response
				const newContext: ActiveContext = {
					idTag,
					type: idTag === auth?.idTag ? 'me' : 'community',
					name: idTag,
					roles: tokenResult.roles,
					permissions: [],
					metadata: {}
				}

				// Update active context
				setActiveContextState(newContext)
			} catch (err) {
				setError(err as Error)
				console.error('Failed to switch context:', err)
				throw err
			} finally {
				setIsLoading(false)
			}
		},
		[getTokenFor, getClientFor, setActiveContextState, auth?.idTag]
	)

	return {
		activeContext,
		setActiveContext,
		getTokenFor,
		getClientFor,
		isLoading,
		error
	}
}

/**
 * Hook for managing communities list
 *
 * Provides access to communities, favorites, and methods to manage them.
 *
 * @example
 * ```typescript
 * const {
 *   communities,
 *   favorites,
 *   recent,
 *   toggleFavorite
 * } = useCommunitiesList()
 * ```
 */
export function useCommunitiesList() {
	const { api } = useApi()
	const [communities, setCommunities] = useAtom(communitiesAtom)
	const [favorites, setFavorites] = useAtom(favoritesAtom)
	const [favoriteCommunities] = useAtom(favoriteCommunitiesAtom)
	const [recentCommunities] = useAtom(recentCommunitiesAtom)
	const [totalUnread] = useAtom(totalUnreadCountAtom)
	const [isLoading, setIsLoading] = React.useState(false)
	const [error, setError] = React.useState<Error | undefined>()

	/**
	 * Save pinned communities to backend
	 */
	const savePinnedCommunities = React.useCallback(
		async (newFavorites: string[]) => {
			if (!api) return
			try {
				await api.settings.update('ui.pinned_communities', { value: newFavorites })
			} catch (err) {
				console.error('Failed to save pinned communities:', err)
			}
		},
		[api]
	)

	/**
	 * Load pinned communities from backend
	 */
	const loadPinnedCommunities = React.useCallback(async () => {
		if (!api) return
		try {
			const result = await api.settings.get('ui.pinned_communities')
			if (result?.value && Array.isArray(result.value)) {
				setFavorites(result.value as string[])
			}
		} catch (err) {
			// Setting may not exist yet - that's OK
			console.log('No pinned communities setting found, using empty list')
			setFavorites([])
		}
	}, [api, setFavorites])

	/**
	 * Load communities from backend (called on app init)
	 */
	const loadCommunities = React.useCallback(async () => {
		if (!api) return

		setIsLoading(true)
		setError(undefined)

		try {
			// Fetch community profiles from backend
			const profiles = await api.profiles.list({ type: 'community' })

			// Convert profiles to CommunityRef format and update atom
			setCommunities((prev) => {
				// Create a map of existing communities for quick lookup
				const existingMap = new Map(prev.map((c) => [c.idTag, c]))

				// Only sync connected communities
				const connectedProfiles = profiles.filter((p) => p.connected === true)

				// Update or add communities
				const updated: CommunityRef[] = connectedProfiles.map((profile) => {
					const existing = existingMap.get(profile.idTag)
					return {
						idTag: profile.idTag,
						name: profile.name || profile.idTag, // Fallback to idTag if name is missing
						profilePic: profile.profilePic,
						// Preserve existing metadata if available
						isFavorite: existing?.isFavorite || false,
						unreadCount: existing?.unreadCount || 0,
						lastActivityAt: existing?.lastActivityAt || null,
						isPending: existing?.isPending || false,
						pendingSince: existing?.pendingSince
					}
				})

				return updated
			})
		} catch (err) {
			setError(err as Error)
			console.error('Failed to load communities:', err)
		} finally {
			setIsLoading(false)
		}
	}, [api, setCommunities])

	/**
	 * Refresh communities list from backend (alias for loadCommunities)
	 */
	const refresh = loadCommunities

	/**
	 * Toggle pinned status of a community (with backend sync)
	 */
	const toggleFavorite = React.useCallback(
		(idTag: string) => {
			setFavorites((prev) => {
				const newFavorites = prev.includes(idTag)
					? prev.filter((id) => id !== idTag)
					: [...prev, idTag]
				// Save to backend (async, non-blocking)
				savePinnedCommunities(newFavorites)
				return newFavorites
			})
		},
		[setFavorites, savePinnedCommunities]
	)

	/**
	 * Reorder pinned communities (with backend sync)
	 */
	const reorderFavorites = React.useCallback(
		(fromIndex: number, toIndex: number) => {
			setFavorites((prev) => {
				const result = [...prev]
				const [removed] = result.splice(fromIndex, 1)
				result.splice(toIndex, 0, removed)
				// Save to backend (async, non-blocking)
				savePinnedCommunities(result)
				return result
			})
		},
		[setFavorites, savePinnedCommunities]
	)

	/**
	 * Add a community to the list
	 */
	const addCommunity = React.useCallback(
		(community: CommunityRef) => {
			setCommunities((prev) => {
				// Don't add duplicates
				if (prev.some((c) => c.idTag === community.idTag)) {
					return prev
				}
				return [...prev, community]
			})
		},
		[setCommunities]
	)

	/**
	 * Remove a community from the list
	 */
	const removeCommunity = React.useCallback(
		(idTag: string) => {
			setCommunities((prev) => prev.filter((c) => c.idTag !== idTag))
			setFavorites((prev) => prev.filter((id) => id !== idTag))
		},
		[setCommunities, setFavorites]
	)

	/**
	 * Add a newly created community (potentially pending DNS propagation)
	 */
	const addPendingCommunity = React.useCallback(
		(community: Omit<CommunityRef, 'unreadCount' | 'lastActivityAt' | 'isFavorite'>) => {
			const newCommunity: CommunityRef = {
				...community,
				isFavorite: false,
				unreadCount: 0,
				lastActivityAt: new Date(),
				pendingSince: community.isPending ? new Date() : undefined
			}

			setCommunities((prev) => {
				// Update existing or add new
				if (prev.some((c) => c.idTag === community.idTag)) {
					return prev.map((c) => (c.idTag === community.idTag ? newCommunity : c))
				}
				return [...prev, newCommunity]
			})
		},
		[setCommunities]
	)

	/**
	 * Mark a pending community as active (DNS resolved)
	 */
	const activatePendingCommunity = React.useCallback(
		(idTag: string) => {
			setCommunities((prev) =>
				prev.map((c) =>
					c.idTag === idTag ? { ...c, isPending: false, pendingSince: undefined } : c
				)
			)
		},
		[setCommunities]
	)

	return {
		communities,
		favorites: favoriteCommunities,
		pinnedIdTags: favorites,
		recent: recentCommunities,
		totalUnread,
		isLoading,
		error,
		refresh,
		loadCommunities,
		loadPinnedCommunities,
		toggleFavorite,
		reorderFavorites,
		addCommunity,
		removeCommunity,
		addPendingCommunity,
		activatePendingCommunity
	}
}

/**
 * Hook for managing sidebar state
 *
 * @example
 * ```typescript
 * const { isOpen, toggle, pin } = useSidebar()
 * ```
 */
export function useSidebar() {
	const [sidebar, setSidebar] = useAtom(sidebarAtom)

	const open = React.useCallback(() => {
		setSidebar((prev) => ({ ...prev, isOpen: true }))
	}, [setSidebar])

	const close = React.useCallback(() => {
		setSidebar((prev) => ({ ...prev, isOpen: false }))
	}, [setSidebar])

	const toggle = React.useCallback(() => {
		setSidebar((prev) => ({ ...prev, isOpen: !prev.isOpen }))
	}, [setSidebar])

	const pin = React.useCallback(() => {
		setSidebar((prev) => ({ ...prev, isPinned: true }))
	}, [setSidebar])

	const unpin = React.useCallback(() => {
		setSidebar((prev) => ({ ...prev, isPinned: false }))
	}, [setSidebar])

	return {
		...sidebar,
		open,
		close,
		toggle,
		pin,
		unpin
	}
}

/**
 * Hook for context switching with navigation
 *
 * High-level helper that handles context switching and navigation together.
 *
 * @example
 * ```typescript
 * const { switchTo, isSwitching } = useContextSwitch()
 *
 * // Switch to community and navigate to feed
 * await switchTo('alice.community', '/feed')
 * ```
 */
export function useContextSwitch() {
	const { setActiveContext } = useApiContext()
	const [isSwitching, setIsSwitching] = useAtom(contextSwitchingAtom)
	const [lastSwitch, setLastSwitch] = useAtom(lastContextSwitchAtom)
	const [recentContexts, setRecentContexts] = useAtom(recentContextsAtom)
	const [activeContext] = useAtom(activeContextAtom)
	const navigate = useNavigate()

	/**
	 * Switch to a different context and optionally navigate
	 *
	 * @param idTag - ID tag of the context to switch to
	 * @param path - Optional path to navigate to (default: '/feed')
	 */
	const switchTo = React.useCallback(
		async (idTag: string, path: string = '/feed') => {
			if (activeContext?.idTag === idTag) {
				// Already in this context, just navigate
				navigate(`/app/${idTag}${path}`)
				return
			}

			setIsSwitching(true)

			try {
				const fromContext = activeContext?.idTag || 'none'

				// Optimistic navigation - navigate first for faster perceived performance
				navigate(`/app/${idTag}${path}`)

				// Switch context (fetches token if needed)
				await setActiveContext(idTag)

				// Update recent contexts (LRU)
				setRecentContexts((prev) => {
					const filtered = prev.filter((id) => id !== idTag)
					const updated = [idTag, ...filtered].slice(0, 10) // Keep max 10
					return updated
				})

				// Record switch event
				const switchEvent: ContextSwitchEvent = {
					from: fromContext,
					to: idTag,
					timestamp: new Date()
				}
				setLastSwitch(switchEvent)

				console.log('✅ Context switched:', switchEvent)
			} catch (err) {
				console.error('❌ Context switch failed:', err)
				// Navigation already happened optimistically, user can still interact
				// API calls in the view components will use the primary API as fallback
				throw err
			} finally {
				setIsSwitching(false)
			}
		},
		[
			activeContext,
			setActiveContext,
			setRecentContexts,
			setLastSwitch,
			setIsSwitching,
			navigate
		]
	)

	return {
		switchTo,
		isSwitching,
		lastSwitch
	}
}

/**
 * Hook for context-aware data caching
 *
 * Provides get/set/invalidate methods for caching data per context.
 *
 * @example
 * ```typescript
 * const cache = useContextCache<File[]>('files')
 *
 * // Get cached data
 * const cached = cache.get()
 *
 * // Store data in cache
 * cache.set(files)
 *
 * // Invalidate cache
 * cache.invalidate()
 * ```
 */
/**
 * Hook for generating context-aware paths
 *
 * Transforms paths to include the current context idTag where appropriate.
 * This consolidates the path transformation logic that was duplicated across components.
 *
 * @example
 * ```typescript
 * const { getContextPath, contextIdTag } = useContextPath()
 *
 * // Transform paths
 * getContextPath('/app/files') // => '/app/alice.example/files' (if in 'alice.example' context)
 * getContextPath('/settings')  // => '/settings/alice.example'
 * ```
 */
export function useContextPath() {
	const [activeContext] = useAtom(activeContextAtom)
	const [auth] = useAuth()

	const contextIdTag = activeContext?.idTag || auth?.idTag

	const getContextPath = React.useCallback(
		(path: string): string => {
			if (!contextIdTag) return path

			// If path starts with /app/, insert contextIdTag
			if (path.startsWith('/app/')) {
				return path.replace('/app/', `/app/${contextIdTag}/`)
			}

			// Handle other context-aware routes
			if (path === '/users') return `/users/${contextIdTag}`
			if (path === '/communities') return `/communities/${contextIdTag}`
			if (path === '/settings') return `/settings/${contextIdTag}`
			if (path === '/idp') return `/idp/${contextIdTag}`

			// Profile routes
			if (path.startsWith('/profile/')) {
				// Transform /profile/:idTag to /profile/:contextIdTag/:idTag
				const parts = path.split('/')
				if (parts.length >= 3) {
					return `/profile/${contextIdTag}/${parts.slice(2).join('/')}`
				}
			}

			return path
		},
		[contextIdTag]
	)

	return {
		contextIdTag,
		getContextPath
	}
}

export function useContextCache<T>(key: string) {
	const [activeContext] = useAtom(activeContextAtom)
	const [cache, setCache] = useAtom(contextDataCacheAtom)

	/**
	 * Get cached data for active context
	 * Returns undefined if not cached or stale (> 5 min)
	 */
	const get = React.useCallback((): T | undefined => {
		if (!activeContext) return undefined

		const contextCache = cache[activeContext.idTag]
		if (!contextCache) return undefined

		const entry = contextCache[key]
		if (!entry) return undefined

		// Check if stale (5 min)
		const age = Date.now() - entry.lastUpdated.getTime()
		if (age > 5 * 60 * 1000) {
			return undefined
		}

		return entry.data as T
	}, [cache, activeContext, key])

	/**
	 * Store data in cache for active context
	 */
	const set = React.useCallback(
		(data: T) => {
			if (!activeContext) return

			setCache((prev) => {
				const contextCache = prev[activeContext.idTag] || {}
				return {
					...prev,
					[activeContext.idTag]: {
						...contextCache,
						[key]: {
							data: data as any[],
							lastUpdated: new Date()
						}
					}
				}
			})
		},
		[setCache, activeContext, key]
	)

	/**
	 * Invalidate cached data for active context
	 */
	const invalidate = React.useCallback(() => {
		if (!activeContext) return

		setCache((prev) => {
			const next = { ...prev }
			if (next[activeContext.idTag]) {
				const { [key]: _, ...rest } = next[activeContext.idTag]
				next[activeContext.idTag] = rest
			}
			return next
		})
	}, [setCache, activeContext, key])

	/**
	 * Invalidate all cached data for active context
	 */
	const invalidateAll = React.useCallback(() => {
		if (!activeContext) return

		setCache((prev) => {
			const { [activeContext.idTag]: _, ...rest } = prev
			return rest
		})
	}, [setCache, activeContext])

	return {
		get,
		set,
		invalidate,
		invalidateAll
	}
}

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

import type {
  ActiveContext,
  CommunityRef,
  ContextToken,
  ContextSwitchEvent
} from './types'

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
   */
  const getClientFor = React.useCallback((idTag: string): ApiClient | null => {
    // Return cached client if exists
    if (apiClientsRef.current.has(idTag)) {
      return apiClientsRef.current.get(idTag)!
    }

    // User's own context uses primary API
    if (idTag === auth?.idTag) {
      return primaryApi
    }

    // Get token for context
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

    // Create new client
    const client = createApiClient({
      idTag,
      authToken: tokenData.token
    })

    // Cache it
    apiClientsRef.current.set(idTag, client)

    return client
  }, [contextTokens, auth?.idTag, primaryApi])

  /**
   * Get proxy token for specific context
   * Fetches from backend if not cached or expired
   */
  const getTokenFor = React.useCallback(async (idTag: string): Promise<string | null> => {
    // User's own context uses primary token
    if (idTag === auth?.idTag) {
      return auth?.token || null
    }

    // Check if we have primary API
    if (!primaryApi) {
      throw new Error('Not authenticated')
    }

    // Check cache
    const cached = contextTokens.get(idTag)
    if (cached && cached.expiresAt > new Date()) {
      return cached.token
    }

    try {
      // Fetch new proxy token
      const result = await primaryApi.auth.getProxyToken()

      // Cache it (proxy tokens expire after 24h, cache for 23h)
      const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000)
      const tokenData: ContextToken = {
        token: result.token,
        tnId: 0, // TODO: Get tnId from result if available
        expiresAt
      }

      setContextTokens(prev => {
        const next = new Map(prev)
        next.set(idTag, tokenData)
        return next
      })

      return result.token
    } catch (err) {
      console.error(`Failed to get proxy token for ${idTag}:`, err)
      throw err
    }
  }, [contextTokens, auth, primaryApi, setContextTokens])

  /**
   * Switch to different context
   * Fetches token if needed and updates active context
   */
  const setActiveContext = React.useCallback(async (idTag: string) => {
    setIsLoading(true)
    setError(undefined)

    try {
      // Get token (will fetch if needed)
      const token = await getTokenFor(idTag)
      if (!token) {
        throw new Error(`Failed to get token for context: ${idTag}`)
      }

      // Get API client
      const contextApi = getClientFor(idTag)
      if (!contextApi) {
        throw new Error(`Failed to create API client for context: ${idTag}`)
      }

      // For now, create a basic context without fetching metadata
      // TODO: Add API endpoint to fetch context metadata
      const newContext: ActiveContext = {
        idTag,
        type: idTag === auth?.idTag ? 'me' : 'community',
        name: idTag,
        roles: [],
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
  }, [getTokenFor, getClientFor, setActiveContextState, auth?.idTag])

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
  const [communities, setCommunities] = useAtom(communitiesAtom)
  const [favorites, setFavorites] = useAtom(favoritesAtom)
  const [favoriteCommunities] = useAtom(favoriteCommunitiesAtom)
  const [recentCommunities] = useAtom(recentCommunitiesAtom)
  const [totalUnread] = useAtom(totalUnreadCountAtom)
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<Error | undefined>()

  /**
   * Refresh communities list from backend
   * TODO: Implement when backend endpoint is available
   */
  const refresh = React.useCallback(async () => {
    setIsLoading(true)
    setError(undefined)

    try {
      // TODO: Fetch communities from backend
      // const result = await api.communities.list()
      // setCommunities(result)

      console.warn('Communities refresh not implemented yet - using localStorage cache')
    } catch (err) {
      setError(err as Error)
      console.error('Failed to refresh communities:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Toggle favorite status of a community
   */
  const toggleFavorite = React.useCallback((idTag: string) => {
    setFavorites(prev => {
      if (prev.includes(idTag)) {
        return prev.filter(id => id !== idTag)
      } else {
        return [...prev, idTag]
      }
    })
  }, [setFavorites])

  /**
   * Add a community to the list
   */
  const addCommunity = React.useCallback((community: CommunityRef) => {
    setCommunities(prev => {
      // Don't add duplicates
      if (prev.some(c => c.idTag === community.idTag)) {
        return prev
      }
      return [...prev, community]
    })
  }, [setCommunities])

  /**
   * Remove a community from the list
   */
  const removeCommunity = React.useCallback((idTag: string) => {
    setCommunities(prev => prev.filter(c => c.idTag !== idTag))
    setFavorites(prev => prev.filter(id => id !== idTag))
  }, [setCommunities, setFavorites])

  return {
    communities,
    favorites: favoriteCommunities,
    recent: recentCommunities,
    totalUnread,
    isLoading,
    error,
    refresh,
    toggleFavorite,
    addCommunity,
    removeCommunity
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
    setSidebar(prev => ({ ...prev, isOpen: true }))
  }, [setSidebar])

  const close = React.useCallback(() => {
    setSidebar(prev => ({ ...prev, isOpen: false }))
  }, [setSidebar])

  const toggle = React.useCallback(() => {
    setSidebar(prev => ({ ...prev, isOpen: !prev.isOpen }))
  }, [setSidebar])

  const pin = React.useCallback(() => {
    setSidebar(prev => ({ ...prev, isPinned: true }))
  }, [setSidebar])

  const unpin = React.useCallback(() => {
    setSidebar(prev => ({ ...prev, isPinned: false }))
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
  const switchTo = React.useCallback(async (idTag: string, path: string = '/feed') => {
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
      setRecentContexts(prev => {
        const filtered = prev.filter(id => id !== idTag)
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
  }, [
    activeContext,
    setActiveContext,
    setRecentContexts,
    setLastSwitch,
    setIsSwitching,
    navigate
  ])

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

  const getContextPath = React.useCallback((path: string): string => {
    if (!contextIdTag) return path

    // If path starts with /app/, insert contextIdTag
    if (path.startsWith('/app/')) {
      return path.replace('/app/', `/app/${contextIdTag}/`)
    }

    // Handle other context-aware routes
    if (path === '/users') return `/users/${contextIdTag}`
    if (path === '/communities') return `/communities/${contextIdTag}`
    if (path === '/settings') return `/settings/${contextIdTag}`

    // Profile routes
    if (path.startsWith('/profile/')) {
      // Transform /profile/:idTag to /profile/:contextIdTag/:idTag
      const parts = path.split('/')
      if (parts.length >= 3) {
        return `/profile/${contextIdTag}/${parts.slice(2).join('/')}`
      }
    }

    return path
  }, [contextIdTag])

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
  const set = React.useCallback((data: T) => {
    if (!activeContext) return

    setCache(prev => {
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
  }, [setCache, activeContext, key])

  /**
   * Invalidate cached data for active context
   */
  const invalidate = React.useCallback(() => {
    if (!activeContext) return

    setCache(prev => {
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

    setCache(prev => {
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

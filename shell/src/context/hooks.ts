// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Multi-Context UI - React Hooks
 *
 * Custom hooks for managing multi-context state and operations.
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai'
import { useNavigate } from 'react-router-dom'
import { createApiClient, FetchError, type ApiClient } from '@cloudillo/core'
import { useApi, useAuth, apiAtom, authAtom } from '@cloudillo/react'

import { HOME_CONTEXT } from './constants.js'
import {
	activeContextAtom,
	contextIdpEnabledAtom,
	contextIdpEnabledCacheAtom,
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
	totalUnreadCountAtom,
	sessionTrustAtom,
	storedTrustAtom
} from './atoms'

import {
	CONTEXT_TOKEN_LIFETIME_MS,
	type ActiveContext,
	type CommunityRef,
	type ContextToken,
	type ContextSwitchEvent
} from './types'

/**
 * Fetch `idp.enabled` for a given context and write it into
 * `contextIdpEnabledAtom`. 404 is normal (the setting is just unset) — fall
 * back to `false`. Shared by `switchContext` (per-context API) and the shell
 * `applyUiSettings` path (home-tenant API).
 */
export async function loadIdpEnabled(
	client: ApiClient,
	idTag: string,
	setContextIdpEnabled: (
		updater: (prev: Record<string, boolean>) => Record<string, boolean>
	) => void
): Promise<boolean | undefined> {
	try {
		const setting = await client.settings.get('idp.enabled')
		const value = setting.value === true
		setContextIdpEnabled((prev) => ({ ...prev, [idTag]: value }))
		return value
	} catch (err) {
		const expected =
			err instanceof FetchError && (err.httpStatus === 404 || err.httpStatus === 403)
		if (!expected) {
			console.warn('Failed to read idp.enabled for context:', err)
		}
		setContextIdpEnabled((prev) => ({ ...prev, [idTag]: false }))
		// On 404/403 (the setting is genuinely unset / unavailable), `false` is
		// authoritative and worth caching. On a transient network error, return
		// undefined so the caller skips the cache write and re-tries next time.
		return expected ? false : undefined
	}
}

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
	const store = useStore()
	const activeContext = useAtomValue(activeContextAtom)
	const setActiveContextState = useSetAtom(activeContextAtom)
	const setContextIdpEnabled = useSetAtom(contextIdpEnabledAtom)
	const setContextIdpEnabledCache = useSetAtom(contextIdpEnabledCacheAtom)
	const setContextTokens = useSetAtom(contextTokensAtom)
	const [isLoading, setIsLoading] = React.useState(false)
	const [error, setError] = React.useState<Error | undefined>()

	// Stable mirror of the primary API so callers via `getClientFor(ownIdTag)`
	// don't churn on token rotations.
	const { api: primaryApi } = useApi()
	const primaryApiRef = React.useRef(primaryApi)
	React.useEffect(() => {
		primaryApiRef.current = primaryApi
	}, [primaryApi])

	// Per-idTag cache for foreign contexts (primary lives in primaryApiRef).
	const apiClientsRef = React.useRef<Map<string, ApiClient>>(new Map())

	/**
	 * Get API client for specific context
	 * @param idTag - ID tag of the context
	 * @param opts - Options: token (bypasses cache lookup), auth ('required' | 'preferred' | 'none')
	 *   - 'required' (default): return null if no token available
	 *   - 'preferred': use token if available, create unauthenticated client if not
	 *   - 'none': always create an unauthenticated client
	 */
	const getClientFor = React.useCallback(
		(
			idTag: string,
			opts?: { token?: string; auth?: 'required' | 'preferred' | 'none' }
		): ApiClient | null => {
			const authMode = opts?.auth ?? 'required'
			const token = opts?.token
			const auth = store.get(authAtom)
			const ownIdTag = auth?.idTag
			const tokens = store.get(contextTokensAtom)

			// For 'required' and 'preferred' (without explicit 'none'), use cached client
			if (authMode !== 'none') {
				if (apiClientsRef.current.has(idTag)) {
					// Verify the cached client's backing token still exists. If
					// trust was revoked or the token was evicted, drop the stale
					// cached client and fall through to the normal build path.
					const own = idTag === ownIdTag
					const tokenData = own ? undefined : tokens.get(idTag)
					if (own || (tokenData && tokenData.expiresAt > new Date())) {
						return apiClientsRef.current.get(idTag)!
					}
					apiClientsRef.current.delete(idTag)
				}

				// User's own context uses primary API (skip for 'none' — caller wants unauthenticated)
				if ((authMode === 'required' || authMode === 'preferred') && idTag === ownIdTag) {
					return primaryApiRef.current
				}
			}

			// Use provided token or get from cache
			let authToken = token
			if (!authToken && authMode !== 'none') {
				const tokenData = tokens.get(idTag)
				if (tokenData && tokenData.expiresAt > new Date()) {
					authToken = tokenData.token
				}
			}

			// If no token found, behavior depends on auth mode
			if (!authToken) {
				if (authMode === 'required') {
					console.warn(`No token available for context: ${idTag}`)
					return null
				}
				// 'preferred' or 'none': create unauthenticated client (don't cache)
				return createApiClient({ idTag })
			}

			// Create authenticated client
			const client = createApiClient({
				idTag,
				authToken
			})

			// Cache authenticated clients only
			apiClientsRef.current.set(idTag, client)

			return client
		},
		[store]
	)

	/**
	 * Get proxy token for specific context.
	 *
	 * By default this is a *passive* read and runs through the profile-trust gate:
	 *   - `'always'` / session `'S'` → fetch (or return cached) proxy token.
	 *   - anything else ('never', 'X', or no decision) → return null; the caller
	 *     falls back to anonymous and the profile page's `TrustBanner` derives
	 *     its visibility from effective trust being `null`, so no extra
	 *     signalling is required here.
	 *
	 * The gate runs uniformly on both cache hit and cache miss — a cached token
	 * from an earlier explicit action must not leak identity on later passive
	 * reads once the user's effective trust is no longer a positive consent.
	 *
	 * Pass `{ explicit: true }` for user-initiated actions (follow, comment, message,
	 * etc.). Explicit calls bypass the gate entirely — the action is the user's
	 * consent — and unconditionally fetch/return the proxy token.
	 *
	 * @returns Object with token and roles, or `null` if anonymous was chosen.
	 */
	const getTokenFor = React.useCallback(
		async (
			idTag: string,
			opts?: { explicit?: boolean }
		): Promise<{ token: string; roles: string[] } | null> => {
			const explicit = opts?.explicit === true
			const auth = store.get(authAtom)

			// User's own context uses primary token
			if (idTag === auth?.idTag) {
				const tok = auth?.token
				return tok ? { token: tok, roles: [] } : null
			}

			// Reuse the mirrored primary API so the LRU cache in `useApi()`
			// keeps backing this client. Constructing inline would create a
			// fresh `ApiClient` on every call and bypass that cache.
			const api = primaryApiRef.current
			if (!api) return null

			// Trust gate: passive reads require positive consent ('S' or stored
			// 'always'). Anything else (including "ask") stays anonymous.
			if (!explicit) {
				const session = store.get(sessionTrustAtom).get(idTag)
				const consented =
					session === 'S' ||
					(session !== 'X' && store.get(storedTrustAtom).get(idTag) === 'always')
				if (!consented) return null
			}

			// Check cache (roles are now cached alongside token)
			const cached = store.get(contextTokensAtom).get(idTag)
			if (cached && cached.expiresAt > new Date()) {
				return { token: cached.token, roles: cached.roles || [] }
			}

			try {
				// Fetch new proxy token for the target idTag
				const result = await api.auth.getProxyToken(idTag)

				const expiresAt = new Date(Date.now() + CONTEXT_TOKEN_LIFETIME_MS)
				const tokenData: ContextToken = {
					token: result.token,
					roles: result.roles || [],
					expiresAt
				}

				setContextTokens((prev) => {
					const next = new Map(prev)
					next.set(idTag, tokenData)
					return next
				})

				// Invalidate cached API client so it gets recreated with the new token
				apiClientsRef.current.delete(idTag)

				return { token: result.token, roles: result.roles || [] }
			} catch (err) {
				console.error(`Failed to get proxy token for ${idTag}:`, err)
				throw err
			}
		},
		[store, setContextTokens]
	)

	/**
	 * Switch to different context
	 * Fetches token if needed and updates active context.
	 *
	 * `ui.*` settings are per-user and are loaded once at boot from the home
	 * tenant — they must not be re-fetched on context switch. `idp.enabled` is
	 * a per-tenant capability and is fetched per context, but cached for a
	 * short staleness window so re-entering a known context skips the call.
	 *
	 * Idempotent: a same-target call (or a same-target call already in flight)
	 * with the URL-as-source-of-truth model returns early.
	 */
	const setActiveContext = React.useCallback(
		async (idTag: string, opts: { forceRefresh?: boolean } = {}) => {
			const auth = store.get(authAtom)
			if (!auth?.idTag) {
				throw new Error('Cannot switch context without auth')
			}
			const ownIdTag = auth.idTag

			if (store.get(activeContextAtom)?.idTag === idTag && !opts.forceRefresh) return

			setIsLoading(true)
			setError(undefined)

			try {
				// Explicit user action: bypass the passive-read gate.
				const tokenResult = await getTokenFor(idTag, { explicit: true })
				if (!tokenResult) {
					throw new Error(`Failed to get token for context: ${idTag}`)
				}

				// Get API client - pass token directly since state update may be async
				const contextApi = getClientFor(idTag, { token: tokenResult.token })
				if (!contextApi) {
					throw new Error(`Failed to create API client for context: ${idTag}`)
				}

				// Create context with roles from proxy token response
				const newContext: ActiveContext = {
					idTag,
					type: idTag === ownIdTag ? 'me' : 'community',
					name: idTag,
					roles: tokenResult.roles,
					permissions: [],
					metadata: {}
				}

				// Update active context
				setActiveContextState(newContext)

				// idp.enabled is a tenant capability — load per context, but
				// cached. On cache hit within the staleness window, seed
				// contextIdpEnabledAtom from cache and skip the network call.
				const STALE_MS = 5 * 60 * 1000
				const cached = store.get(contextIdpEnabledCacheAtom).get(idTag)
				if (cached && Date.now() - cached.fetchedAt < STALE_MS && !opts.forceRefresh) {
					setContextIdpEnabled((prev) => ({ ...prev, [idTag]: cached.value }))
				} else {
					const value = await loadIdpEnabled(contextApi, idTag, setContextIdpEnabled)
					// Mirror the freshly-written value into the cache so
					// re-entry skips the network call. Skip the cache write
					// on a transient failure (value === undefined) so we
					// don't lock the stale `false` for the next 5 minutes.
					if (value !== undefined) {
						setContextIdpEnabledCache((prev) => {
							const next = new Map(prev)
							next.set(idTag, { value, fetchedAt: Date.now() })
							return next
						})
					}
				}
			} catch (err) {
				setError(err as Error)
				console.error('Failed to switch context:', err)
				throw err
			} finally {
				setIsLoading(false)
			}
		},
		[
			store,
			getTokenFor,
			getClientFor,
			setActiveContextState,
			setContextIdpEnabled,
			setContextIdpEnabledCache
		]
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
/**
 * Communities whose mirror we've already fired a best-effort refresh-on-view for
 * this session. Module-level so the dedup survives across the multiple
 * `useCommunitiesList()` instances mounted at once (sidebar, profile pages, …)
 * and across `loadCommunities()` re-runs.
 */
const refreshAttemptedIdTags = new Set<string>()
/** Identity that owns the current `refreshAttemptedIdTags` contents. */
let refreshAttemptedOwner: string | undefined

export function useCommunitiesList() {
	const { api } = useApi()
	const [auth] = useAuth()
	const [communities, setCommunities] = useAtom(communitiesAtom)
	const [favorites, setFavorites] = useAtom(favoritesAtom)
	const [favoriteCommunities] = useAtom(favoriteCommunitiesAtom)
	const [recentCommunities] = useAtom(recentCommunitiesAtom)
	const [totalUnread] = useAtom(totalUnreadCountAtom)
	const [isLoading, setIsLoading] = React.useState(false)
	const [error, setError] = React.useState<Error | undefined>()

	// Reset the once-per-session refresh-on-view dedup only when the owning
	// identity actually changes (logout + login as a different account). Guarded
	// by `refreshAttemptedOwner` so the several `useCommunitiesList()` instances
	// mounted at once don't wipe the dedup on every mount.
	React.useEffect(() => {
		const owner = auth?.idTag
		if (owner && owner !== refreshAttemptedOwner) {
			refreshAttemptedOwner = owner
			refreshAttemptedIdTags.clear()
		}
	}, [auth?.idTag])

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

			// Self-heal abandoned community mirrors: a community whose picture was
			// uploaded after creation can keep a frozen, empty mirror row that the
			// periodic refresh batch has given up on (see backend
			// `list_stale_profiles` abandonment cutoff). For connected community
			// rows still missing a `profilePic`, fire a best-effort forced refresh
			// on the home-server (this `api`) — once per session per row — and
			// patch the recovered picture into the atom.
			for (const profile of profiles) {
				if (profile.connected !== true || profile.profilePic) continue
				if (refreshAttemptedIdTags.has(profile.idTag)) continue
				refreshAttemptedIdTags.add(profile.idTag)
				api.profiles
					.refresh(profile.idTag)
					.then((p) => {
						if (p?.profilePic) {
							setCommunities((prev) =>
								prev.map((c) =>
									c.idTag === profile.idTag
										? { ...c, profilePic: p.profilePic }
										: c
								)
							)
						}
					})
					.catch((err) => console.warn('community mirror refresh-on-view failed', err))
			}
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
				pendingSince: community.isPending ? new Date() : undefined,
				pendingReason: community.pendingReason
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
	const [isSwitching, setIsSwitching] = useAtom(contextSwitchingAtom)
	const [lastSwitch, setLastSwitch] = useAtom(lastContextSwitchAtom)
	const [_recentContexts, setRecentContexts] = useAtom(recentContextsAtom)
	const [activeContext] = useAtom(activeContextAtom)
	const [apiState] = useAtom(apiAtom)
	const navigate = useNavigate()

	// URL is the only source of truth for the active context. switchTo
	// navigates and updates the LRU bookkeeping; the route effect in
	// use-context-from-route.ts observes the new URL and drives the actual
	// setActiveContext call (and clears contextSwitchingAtom when it resolves).
	const switchTo = React.useCallback(
		async (idTag: string, path: string = '/feed') => {
			const urlSegment = idTag === apiState.idTag ? HOME_CONTEXT : idTag

			// `path` may be either an app-relative tail (e.g. `/feed`, joined
			// under `/app/<ctx>`) or an already-absolute context-aware route
			// (e.g. `/idp/<ctx>/settings`) that encodes the destination itself.
			const isAbsoluteContextRoute = /^\/(app|idp|settings|users|communities|profile)\//.test(
				path
			)
			const destination = isAbsoluteContextRoute ? path : `/app/${urlSegment}${path}`

			if (activeContext?.idTag === idTag) {
				navigate(destination)
				return
			}

			setIsSwitching(true)
			const fromContext = activeContext?.idTag || 'none'

			navigate(destination)

			// Update recent contexts (LRU)
			setRecentContexts((prev) => {
				const filtered = prev.filter((id) => id !== idTag)
				const updated = [idTag, ...filtered].slice(0, 10)
				return updated
			})

			const switchEvent: ContextSwitchEvent = {
				from: fromContext,
				to: idTag,
				timestamp: new Date()
			}
			setLastSwitch(switchEvent)
		},
		[activeContext, apiState.idTag, setRecentContexts, setLastSwitch, setIsSwitching, navigate]
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
	const [apiState] = useAtom(apiAtom)

	const contextIdTag = activeContext?.idTag || auth?.idTag
	const urlContextIdTag =
		contextIdTag && contextIdTag === apiState.idTag ? HOME_CONTEXT : contextIdTag

	const getContextPath = React.useCallback(
		(path: string): string => {
			if (!urlContextIdTag) return path

			// If path starts with /app/, insert contextIdTag
			if (path.startsWith('/app/')) {
				return path.replace('/app/', `/app/${urlContextIdTag}/`)
			}

			// Handle other context-aware routes
			if (path === '/users') return `/users/${urlContextIdTag}`
			if (path === '/communities') return `/communities/${urlContextIdTag}`
			if (path === '/settings') return `/settings/${urlContextIdTag}`
			if (path === '/idp') return `/idp/${urlContextIdTag}`

			// Profile routes
			if (path.startsWith('/profile/')) {
				// Transform /profile/:idTag to /profile/:contextIdTag/:idTag
				const parts = path.split('/')
				if (parts.length >= 3) {
					return `/profile/${urlContextIdTag}/${parts.slice(2).join('/')}`
				}
			}

			return path
		},
		[urlContextIdTag]
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
							data,
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

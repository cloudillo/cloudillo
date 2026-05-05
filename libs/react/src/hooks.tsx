// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useLocation } from 'react-router-dom'
import { atom, useAtom } from 'jotai'
import * as Y from 'yjs'
import type { WebsocketProvider } from 'y-websocket'

import { getAppBus, createApiClient, type ApiClient } from '@cloudillo/core'
import { openYDoc, type CrdtPersistence } from '@cloudillo/crdt'

// useAuth() //
///////////////
export interface AuthState {
	tnId: number
	idTag?: string
	name?: string
	profilePic?: string
	roles?: string[]
	token?: string
}

/**
 * Underlying auth state atom. Exposed for `store.get(authAtom)` reads from
 * imperative call sites (e.g. inside `useCallback`s that should not
 * re-subscribe on every token rotation). For component-level subscriptions,
 * use `useAuth()` — that remains the supported reactive path.
 */
export const authAtom = atom<AuthState | null | undefined>(undefined)

export function useAuth() {
	return useAtom(authAtom)
}

// useAPI() //
//////////////
export interface ApiState {
	idTag?: string
}

export const apiAtom = atom<ApiState>({})

/**
 * Hook for type-safe API client
 *
 * Returns a fully type-safe API client with all endpoints typed.
 * Also allows setting the idTag for initial login flow.
 *
 * @example
 * ```typescript
 * const { api, setIdTag } = useApi()
 *
 * // Set idTag if needed (e.g., from .well-known endpoint)
 * if (idTagFromServer) {
 *   setIdTag(idTagFromServer)
 * }
 *
 * if (!api) return <div>Not authenticated</div>
 *
 * // Get login token
 * const result = await api.auth.getLoginToken()
 *
 * // List files
 * const files = await api.files.list({ tag: 'vacation' })
 *
 * // Create action
 * const action = await api.actions.create({
 *   type: 'POST',
 *   content: 'Hello!'
 * })
 * ```
 */
export interface ApiHook {
	api: ApiClient | null
	authenticated: boolean
	setIdTag: (idTag: string) => void
}

export function useApi(): ApiHook {
	const [auth] = useAuth()
	const [apiState, setApiState] = useAtom(apiAtom)

	// One ApiClient per idTag; token rotations are pushed in via setAuthToken
	// (effect below) so the client identity stays stable across rotations.
	const apiClientsRef = React.useRef<Map<string, ApiClient>>(new Map())

	const api = React.useMemo(() => {
		const idTag = apiState.idTag || auth?.idTag
		if (!idTag) return null

		let client = apiClientsRef.current.get(idTag)
		if (!client) {
			client = createApiClient({ idTag, authToken: auth?.token })
			apiClientsRef.current.set(idTag, client)
			if (apiClientsRef.current.size > 10) {
				const oldestKey = apiClientsRef.current.keys().next().value
				if (oldestKey !== undefined) apiClientsRef.current.delete(oldestKey)
			}
		}
		return client
	}, [apiState.idTag, auth?.idTag])

	// Mutate the cached client's token in an effect rather than during render
	// so the useMemo factory stays pure.
	React.useEffect(() => {
		if (api) api.setAuthToken(auth?.token)
	}, [api, auth?.token])

	const setIdTag = React.useCallback((idTag: string) => setApiState({ idTag }), [setApiState])
	const authenticated = !!auth?.token

	return React.useMemo(
		() => ({
			api,
			authenticated,
			setIdTag
		}),
		[api, authenticated, setIdTag]
	)
}

interface UseCloudillo {
	token?: string
	ownerTag: string
	fileId?: string
	idTag?: string
	tnId?: number
	roles?: string[]
	access?: 'read' | 'comment' | 'write'
	displayName?: string
	params?: string
	parsedParams: URLSearchParams
}

export function useCloudillo(appNameArg?: string): UseCloudillo {
	const location = useLocation()
	const [auth, setAuth] = useAuth()
	const [appName, _setAppName] = React.useState(appNameArg || '')
	const [fileId, setFileId] = React.useState<string | undefined>(undefined)
	const [ownerTag, setOwnerTag] = React.useState<string | undefined>(undefined)

	React.useEffect(
		function () {
			const [ownerTag, fileId] = location.hash.slice(1).split(':')
			setOwnerTag(ownerTag)
			setFileId(fileId)
		},
		[location.hash]
	)

	React.useEffect(
		function () {
			;(async function init() {
				try {
					const bus = getAppBus()
					const state = await bus.init(appName)
					setAuth({
						idTag: state.idTag,
						tnId: state.tnId ?? 0,
						roles: state.roles,
						token: state.accessToken
					})
					// Note: bus.init() automatically calls notifyReady('auth')
				} catch (e) {
					console.error('useCloudillo INIT ERROR', e)
					// Offline fallback: use whatever state the bus has
					// (may have been set by auth:init.push before timeout)
					const bus = getAppBus()
					const partialState = bus.getState()
					if (partialState.idTag) {
						setAuth({
							idTag: partialState.idTag,
							tnId: partialState.tnId ?? 0,
							roles: partialState.roles,
							token: partialState.accessToken
						})
					} else {
						// Neither push nor response arrived — derive idTag from URL hash
						const [hashOwnerTag] = location.hash.slice(1).split(':')
						if (hashOwnerTag) {
							setAuth({
								idTag: hashOwnerTag,
								tnId: 0,
								roles: undefined,
								token: undefined
							})
							bus.notifyReady('auth')
						}
					}
				}
			})()
		},
		[appName]
	)

	const struct = React.useMemo(() => {
		const bus = getAppBus()
		return {
			token: auth?.token,
			ownerTag: ownerTag || '',
			fileId,
			idTag: bus.idTag,
			roles: bus.roles,
			access: bus.access,
			displayName: bus.displayName,
			params: bus.params,
			parsedParams: bus.parsedParams
		}
	}, [auth, ownerTag, fileId])

	return struct
}

export function useCloudilloEditor(appName: string) {
	const location = useLocation()
	const docId = location.hash.slice(1)
	const cl = useCloudillo(appName)
	const [yDoc, _setYDoc] = React.useState<Y.Doc>(new Y.Doc())
	const [provider, setProvider] = React.useState<WebsocketProvider | undefined>(undefined)
	const [synced, setSynced] = React.useState(false)
	const [error, setError] = React.useState<{ code: number; reason?: string } | null>(null)

	React.useEffect(
		function () {
			// Track if cleanup has run to prevent state updates after unmount
			let isMounted = true
			let currentProvider: WebsocketProvider | undefined
			let currentPersistence: CrdtPersistence | undefined
			let handleSync: ((isSynced: boolean) => void) | undefined

			if (cl.idTag && docId) {
				;(async function initDoc() {
					const { provider, persistence, offlineCached } = await openYDoc(yDoc, docId)

					// Check if component unmounted during async operation
					if (!isMounted) {
						persistence.destroy()
						provider.destroy()
						return
					}

					currentProvider = provider
					currentPersistence = persistence
					setProvider(provider)

					const bus = getAppBus()

					// Listen for connection-close events (440x errors from CRDT server)
					const handleConnectionClose = (event: CloseEvent | null) => {
						if (isMounted && event && event.code >= 4400 && event.code < 4500) {
							setError({ code: event.code, reason: event.reason || undefined })
						}
					}
					provider.on('connection-close', handleConnectionClose)

					if (offlineCached) {
						// Offline with cached data: immediately mark as ready
						setSynced(true)
						bus.notifyReady('synced')

						// Still register sync handler for when we come back online
						handleSync = (isSynced: boolean) => {
							if (isSynced && isMounted) {
								provider.off('sync', handleSync!)
							}
						}
						provider.on('sync', handleSync)
					} else {
						// Normal online flow
						handleSync = (isSynced: boolean) => {
							if (isSynced && isMounted) {
								setSynced(true)
								provider.off('sync', handleSync!)
								bus.notifyReady('synced')
							}
						}

						if (provider.synced) {
							setSynced(true)
							bus.notifyReady('synced')
						} else {
							provider.on('sync', handleSync)
						}
					}
				})()
			}

			// Cleanup function
			return () => {
				isMounted = false

				// Remove sync listener if still registered
				if (currentProvider && handleSync) {
					currentProvider.off('sync', handleSync)
				}

				// Compact and stop persisting updates
				if (currentPersistence) {
					currentPersistence.destroy()
				}

				// Destroy the provider (closes WebSocket, removes all listeners)
				if (currentProvider) {
					currentProvider.destroy()
				}
			}
		},
		[cl.idTag, docId]
	)

	return {
		...cl,
		yDoc,
		provider,
		synced,
		error
	}
}

// useInfiniteScroll() //
/////////////////////////

export interface UseInfiniteScrollOptions<T> {
	/** Function to fetch a page of data */
	fetchPage: (
		cursor: string | null,
		limit: number
	) => Promise<{
		items: T[]
		nextCursor: string | null
		hasMore: boolean
	}>
	/** Items per page (default: 20) */
	pageSize?: number
	/** Dependencies that trigger a reset when changed */
	deps?: React.DependencyList
	/** Whether infinite scroll is enabled (default: true) */
	enabled?: boolean
}

export interface UseInfiniteScrollReturn<T> {
	/** All loaded items */
	items: T[]
	/** Whether initial load is in progress */
	isLoading: boolean
	/** Whether more pages are being fetched */
	isLoadingMore: boolean
	/** Error from last fetch */
	error: Error | null
	/** Whether there are more items to load */
	hasMore: boolean
	/** Function to load next page */
	loadMore: () => void
	/** Function to reset and reload */
	reset: () => void
	/** Function to prepend items (for real-time updates) */
	prepend: (newItems: T[]) => void
	/** Ref to attach to scroll sentinel element */
	sentinelRef: React.RefObject<HTMLDivElement | null>
}

/**
 * Hook for cursor-based infinite scroll pagination
 *
 * Uses IntersectionObserver for efficient scroll detection.
 * Accumulates items across pages and provides prepend() for real-time updates.
 *
 * @example
 * ```typescript
 * const { items, isLoading, hasMore, sentinelRef } = useInfiniteScroll({
 *   fetchPage: async (cursor, limit) => {
 *     const result = await api.files.list({ cursor, limit })
 *     return {
 *       items: result.data,
 *       nextCursor: result.cursorPagination?.nextCursor ?? null,
 *       hasMore: result.cursorPagination?.hasMore ?? false
 *     }
 *   },
 *   pageSize: 30,
 *   deps: [folderId, sortField]
 * })
 *
 * return (
 *   <div>
 *     {items.map(item => <Item key={item.id} item={item} />)}
 *     <div ref={sentinelRef} /> // Triggers loadMore when visible
 *   </div>
 * )
 * ```
 */
export function useInfiniteScroll<T>(
	options: UseInfiniteScrollOptions<T>
): UseInfiniteScrollReturn<T> {
	const { fetchPage, pageSize = 20, deps = [], enabled = true } = options

	const [items, setItems] = React.useState<T[]>([])
	const [cursor, setCursor] = React.useState<string | null>(null)
	const [isLoading, setIsLoading] = React.useState(false)
	const [isLoadingMore, setIsLoadingMore] = React.useState(false)
	const [error, setError] = React.useState<Error | null>(null)
	const [hasMore, setHasMore] = React.useState(true)

	const sentinelRef = React.useRef<HTMLDivElement | null>(null)
	const isMountedRef = React.useRef(true)
	const fetchingRef = React.useRef(false)

	// Reset synchronously during render when deps change, so no in-between
	// render commits with the new deps + stale items. See
	// https://react.dev/reference/react/useState#storing-information-from-previous-renders
	const [prevDeps, setPrevDeps] = React.useState<React.DependencyList>(deps)
	const depsChanged =
		deps.length !== prevDeps.length || deps.some((d, i) => !Object.is(d, prevDeps[i]))

	if (depsChanged) {
		setPrevDeps(deps)
		setItems([])
		setCursor(null)
		setHasMore(true)
		setError(null)
		fetchingRef.current = false
	}

	// Lifecycle: keep the mount/unmount toggle so in-flight fetches that
	// resolve after a deps change are discarded by the isMountedRef check
	// in fetchItems().
	React.useEffect(() => {
		isMountedRef.current = true
		return () => {
			isMountedRef.current = false
		}
	}, deps)

	// Fetch function
	const fetchItems = React.useCallback(
		async (currentCursor: string | null) => {
			if (!enabled || fetchingRef.current) return

			fetchingRef.current = true
			const isInitialLoad = currentCursor === null

			try {
				if (isInitialLoad) {
					setIsLoading(true)
				} else {
					setIsLoadingMore(true)
				}
				setError(null)

				const result = await fetchPage(currentCursor, pageSize)

				if (!isMountedRef.current) return

				setItems((prev) => (isInitialLoad ? result.items : [...prev, ...result.items]))
				setCursor(result.nextCursor)
				setHasMore(result.hasMore)
			} catch (err) {
				if (!isMountedRef.current) return
				setError(err instanceof Error ? err : new Error('Failed to fetch'))
			} finally {
				if (isMountedRef.current) {
					setIsLoading(false)
					setIsLoadingMore(false)
					fetchingRef.current = false
				}
			}
		},
		[fetchPage, pageSize, enabled]
	)

	// Initial load
	React.useEffect(() => {
		if (enabled && items.length === 0 && hasMore && !isLoading && !error) {
			fetchItems(null)
		}
	}, [enabled, items.length, hasMore, isLoading, error, fetchItems])

	// Load more function
	const loadMore = React.useCallback(() => {
		if (hasMore && !isLoading && !isLoadingMore && cursor) {
			fetchItems(cursor)
		}
	}, [hasMore, isLoading, isLoadingMore, cursor, fetchItems])

	// Reset function
	const reset = React.useCallback(() => {
		setItems([])
		setCursor(null)
		setHasMore(true)
		setError(null)
		fetchingRef.current = false
		// Trigger refetch
		setTimeout(() => fetchItems(null), 0)
	}, [fetchItems])

	// Prepend function (for real-time updates)
	const prepend = React.useCallback((newItems: T[]) => {
		setItems((prev) => [...newItems, ...prev])
	}, [])

	// IntersectionObserver for scroll detection
	React.useEffect(() => {
		const sentinel = sentinelRef.current
		if (!sentinel || !enabled) return

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0]
				if (entry?.isIntersecting && hasMore && !isLoading && !isLoadingMore && !error) {
					loadMore()
				}
			},
			{
				root: null,
				rootMargin: '100px',
				threshold: 0
			}
		)

		observer.observe(sentinel)

		return () => {
			observer.disconnect()
		}
	}, [enabled, hasMore, isLoading, isLoadingMore, error, loadMore])

	return {
		items,
		isLoading,
		isLoadingMore,
		error,
		hasMore,
		loadMore,
		reset,
		prepend,
		sentinelRef
	}
}

// vim: ts=4

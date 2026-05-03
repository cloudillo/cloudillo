// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useInfiniteScroll } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import { useContextAwareApi } from '../../context/index.js'
import { useCurrentContextIdTag } from '../../context/index.js'
import { createCachedActionFetchPage } from '../../cache/index.js'
import { useWsBus } from '../../ws-bus.js'

export interface UseFeedPostsOptions {
	audience?: string
	tag?: string
	search?: string
	visibility?: string
	enabled?: boolean
}

const PAGE_SIZE = 15

export function useFeedPosts(options: UseFeedPostsOptions = {}) {
	const { audience, tag, search, visibility, enabled = true } = options
	const { api } = useContextAwareApi()
	const contextIdTag = useCurrentContextIdTag()
	const [newPosts, setNewPosts] = React.useState<ActionView[]>([])
	const postsRef = React.useRef<ActionView[]>([])
	const newPostsRef = React.useRef<ActionView[]>([])

	// Raw network fetch function
	const rawFetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			if (!api) {
				return { items: [] as ActionView[], nextCursor: null, hasMore: false }
			}

			const result = await api.actions.listPaginated({
				type: 'POST',
				audience,
				tag,
				search,
				visibility,
				cursor: cursor ?? undefined,
				limit
			})

			return {
				items: result.data,
				nextCursor: result.cursorPagination?.nextCursor ?? null,
				hasMore: result.cursorPagination?.hasMore ?? false
			}
		},
		[api, audience, tag, search, visibility]
	)

	// Cache query params for offline fallback
	const cacheQueryParams = React.useMemo(() => ({ type: 'POST' as const, audience }), [audience])

	// Fetch page with offline cache fallback
	const fetchPage = React.useMemo(
		() => createCachedActionFetchPage(contextIdTag, rawFetchPage, cacheQueryParams),
		[contextIdTag, rawFetchPage, cacheQueryParams]
	)

	// Use infinite scroll hook
	const {
		items: posts,
		isLoading,
		isLoadingMore,
		error,
		hasMore,
		loadMore,
		reset,
		prepend,
		sentinelRef
	} = useInfiniteScroll<ActionView>({
		fetchPage,
		pageSize: PAGE_SIZE,
		deps: [audience, tag, search, visibility],
		enabled: !!api && enabled
	})

	// Keep refs in sync for use in WebSocket callback
	postsRef.current = posts
	newPostsRef.current = newPosts

	// Handle WebSocket updates for real-time posts
	useWsBus({ cmds: ['ACTION'] }, function handleAction(msg) {
		const action = msg.data as ActionView

		switch (action.type) {
			case 'POST': {
				// Check if post already exists in the feed (read from refs to avoid stale closure)
				const existsInFeed = postsRef.current.some((p) => p.actionId === action.actionId)
				const existsInNewPosts = newPostsRef.current.some(
					(p) => p.actionId === action.actionId
				)

				if (
					!existsInFeed &&
					!existsInNewPosts &&
					(!action.status || action.status === 'A')
				) {
					// Buffer new posts for "X new posts" banner
					setNewPosts((prev) => [action, ...prev])
				}
				break
			}
			case 'STAT':
				// Stats updates are handled by setAction in FeedApp
				break
		}
	})

	// Function to show new posts (user clicks "X new posts" banner)
	const showNewPosts = React.useCallback(() => {
		if (newPosts.length > 0) {
			prepend(newPosts)
			setNewPosts([])
		}
	}, [newPosts, prepend])

	// Function to add a new post at the top (after user creates a post)
	const addPost = React.useCallback(
		(post: ActionView) => {
			prepend([post])
		},
		[prepend]
	)

	return {
		posts,
		isLoading,
		isLoadingMore,
		error,
		hasMore,
		loadMore,
		reset,
		sentinelRef,
		// Real-time updates
		newPostsCount: newPosts.length,
		showNewPosts,
		addPost
	}
}

// vim: ts=4

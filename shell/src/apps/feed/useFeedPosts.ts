// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { useAuth, useInfiniteScroll } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import { useContextAwareApi } from '../../context/index.js'
import { useWsBus } from '../../ws-bus.js'

export interface UseFeedPostsOptions {
	audience?: string
	enabled?: boolean
}

const PAGE_SIZE = 15

export function useFeedPosts(options: UseFeedPostsOptions = {}) {
	const { audience, enabled = true } = options
	const { api } = useContextAwareApi()
	const [auth] = useAuth()
	const [newPosts, setNewPosts] = React.useState<ActionView[]>([])

	// Fetch page function for infinite scroll
	const fetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			if (!api) {
				return { items: [], nextCursor: null, hasMore: false }
			}

			const result = await api.actions.listPaginated({
				type: 'POST',
				audience,
				cursor: cursor ?? undefined,
				limit
			})

			return {
				items: result.data,
				nextCursor: result.cursorPagination?.nextCursor ?? null,
				hasMore: result.cursorPagination?.hasMore ?? false
			}
		},
		[api, audience]
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
		deps: [audience],
		enabled: !!api && enabled
	})

	// Handle WebSocket updates for real-time posts
	useWsBus({ cmds: ['ACTION'] }, function handleAction(msg) {
		const action = msg.data as ActionView

		switch (action.type) {
			case 'POST':
				// Check if post already exists in the feed
				const existsInFeed = posts.some((p) => p.actionId === action.actionId)
				const existsInNewPosts = newPosts.some((p) => p.actionId === action.actionId)

				if (!existsInFeed && !existsInNewPosts) {
					// Buffer new posts for "X new posts" banner
					setNewPosts((prev) => [action, ...prev])
				}
				break
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

	// Function to set/update a single post (for reactions, etc.)
	const setPost = React.useCallback((actionId: string, updatedPost: ActionView) => {
		// Note: This won't work well with infinite scroll's internal state
		// The feed component should handle post updates at its level
	}, [])

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
		addPost,
		setPost
	}
}

// vim: ts=4

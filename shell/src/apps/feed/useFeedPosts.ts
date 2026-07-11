// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useInfiniteScroll } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'

import { createCachedActionFetchPage } from '../../cache/index.js'
import { useContextAwareApi, useCurrentContextIdTag } from '../../context/index.js'
import { useWsBus } from '../../ws-bus.js'

export interface UseFeedPostsOptions {
	audience?: string
	audienceType?: 'personal' | 'community'
	tag?: string
	search?: string
	visibility?: string | string[]
	issuer?: string
	subscribed?: boolean
	// 'received' orders by ingestion time (home feed, arrival order); undefined
	// keeps the default author-time ordering.
	sort?: 'created' | 'received'
	// Home feed only: idTags of communities the reader opted out of home
	// ("Show in Home" = off). Live WS arrivals addressed to these communities are
	// ignored here (paginated fetches are already filtered server-side via
	// `exclude_audiences`). Undefined/empty on community & profile feeds.
	hiddenAudiences?: Set<string>
	enabled?: boolean
}

const PAGE_SIZE = 15

export function useFeedPosts(options: UseFeedPostsOptions = {}) {
	const {
		audience,
		audienceType,
		tag,
		search,
		visibility,
		issuer,
		subscribed,
		sort,
		hiddenAudiences,
		enabled = true
	} = options
	const { api } = useContextAwareApi()
	const contextIdTag = useCurrentContextIdTag()
	const [newPosts, setNewPosts] = React.useState<ActionView[]>([])
	const postsRef = React.useRef<ActionView[]>([])
	const newPostsRef = React.useRef<ActionView[]>([])

	const visibilityKey = Array.isArray(visibility) ? visibility.join(',') : visibility

	// Raw network fetch function
	const rawFetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			if (!api) {
				return { items: [] as ActionView[], nextCursor: null, hasMore: false }
			}

			const result = await api.actions.listPaginated({
				type: ['POST', 'REPOST'],
				// Active only — exclude soft-deleted/draft
				status: ['A'],
				audience,
				audienceType,
				tag,
				search,
				visibility,
				issuer,
				subscribed,
				sort,
				// Embed each REPOST's original in subjectAction so EmbeddedPostCard
				// renders without a second fetch.
				includeSubject: true,
				cursor: cursor ?? undefined,
				limit
			})

			return {
				items: result.data,
				nextCursor: result.cursorPagination?.nextCursor ?? null,
				hasMore: result.cursorPagination?.hasMore ?? false
			}
		},
		// visibility may be an array; key on the joined string for stable identity
		[api, audience, audienceType, tag, search, visibilityKey, issuer, subscribed, sort]
	)

	// Cache query params for offline fallback. Including the filter fields
	// here keys the offline lookup on the active Source tab so switching tabs
	// offline doesn't show a cached set from a different filter.
	const cacheQueryParams = React.useMemo(
		() => ({
			type: ['POST', 'REPOST'],
			audience,
			audienceType,
			visibility: visibilityKey,
			issuer,
			// Key the offline cache on the ordering so an arrival-ordered home feed
			// and an author-ordered feed never share a cached set.
			sort
		}),
		[audience, audienceType, visibilityKey, issuer, sort]
	)

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
		deps: [audience, audienceType, tag, search, visibilityKey, issuer, subscribed, sort],
		enabled: !!api && enabled
	})

	// Keep refs in sync for use in WebSocket callback
	postsRef.current = posts
	newPostsRef.current = newPosts
	const hiddenAudiencesRef = React.useRef<Set<string> | undefined>(hiddenAudiences)
	hiddenAudiencesRef.current = hiddenAudiences

	// Handle WebSocket updates for real-time posts
	useWsBus({ cmds: ['ACTION'] }, function handleAction(msg) {
		const action = msg.data as ActionView

		// Home feed: drop live arrivals addressed to a community the reader opted
		// out of home (matches the server-side `exclude_audiences` paginated filter).
		const aud = action.audience
		if (aud?.type === 'community' && aud.idTag && hiddenAudiencesRef.current?.has(aud.idTag)) {
			return
		}

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
			case 'REPOST': {
				const existsInFeed = postsRef.current.some((p) => p.actionId === action.actionId)
				const existsInNewPosts = newPostsRef.current.some(
					(p) => p.actionId === action.actionId
				)
				if (existsInFeed || existsInNewPosts) break
				if (action.status && action.status !== 'A') break
				// The WS push omits the embedded original (subjectAction is hydrated
				// only in the list path), so fetch it before buffering — otherwise the
				// banner reveal would render a hollow repost wrapper.
				if (action.subjectAction) {
					setNewPosts((prev) => [action, ...prev])
					break
				}
				const subjectId = action.subject
				// '@'-prefixed subjects are remote refs the local store can't resolve;
				// skip them — they'll surface (hydrated) on the next refetch.
				if (!api || !subjectId || subjectId.startsWith('@')) break
				api.actions
					.get(subjectId)
					.then((subject) => {
						// Re-check dedup after the await; a refetch or echo may have landed.
						if (postsRef.current.some((p) => p.actionId === action.actionId)) {
							return
						}
						if (newPostsRef.current.some((p) => p.actionId === action.actionId)) {
							return
						}
						setNewPosts((prev) => [{ ...action, subjectAction: subject }, ...prev])
					})
					.catch(() => {
						/* leave for the next refetch */
					})
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

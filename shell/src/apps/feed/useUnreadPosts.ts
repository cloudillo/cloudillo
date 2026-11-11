// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { useInfiniteScroll } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'

import { useContextAwareApi } from '../../context/index.js'
import { feedReadTs, secondsToIso } from '../../read-position.js'
import { useWsBus } from '../../ws-bus.js'

export interface UseUnreadPostsOptions {
	since: number // read-position watermark (epoch seconds)
	audience?: string
	audienceType?: 'personal' | 'community'
	tag?: string
	search?: string
	visibility?: string | string[]
	issuer?: string
	// 'received' orders/filters by ingestion time (home feed); the backend then
	// applies the createdAfter "since" boundary against received_at. undefined
	// keeps the default author-time ordering.
	sort?: 'created' | 'received'
	// Home feed only: idTags of communities opted out of home — live WS arrivals
	// addressed to them are ignored (paginated fetches are filtered server-side).
	hiddenAudiences?: Set<string>
	enabled?: boolean
}

const PAGE_SIZE = 15

/**
 * Chronological (oldest-first) list of unread POST/REPOST actions created after
 * the read-position watermark. Bypasses the offline action cache (unread content
 * changes constantly) and drives `useInfiniteScroll` directly. Live WS arrivals
 * are appended (they are always newer than everything already shown).
 */
export function useUnreadPosts(options: UseUnreadPostsOptions) {
	const {
		since,
		audience,
		audienceType,
		tag,
		search,
		visibility,
		issuer,
		sort,
		hiddenAudiences,
		enabled = true
	} = options
	const { api } = useContextAwareApi()

	const visibilityKey = Array.isArray(visibility) ? visibility.join(',') : visibility
	const active = enabled && !!api && since > 0

	const fetchPage = React.useCallback(
		async (cursor: string | null, limit: number) => {
			if (!api || since <= 0) {
				return { items: [] as ActionView[] }
			}
			const result = await api.actions.listPaginated({
				type: ['POST', 'REPOST', 'PTNR'],
				status: ['active'],
				// `since` is epoch seconds; the wire takes ISO 8601.
				createdAfter: secondsToIso(since),
				excludeOwnIssuer: true,
				sortDir: 'asc',
				sort,
				audienceIdTag: audience,
				audienceType,
				tag,
				q: search,
				visibility,
				issuerIdTag: issuer,
				// Embed each REPOST's original so the unread banner's EmbeddedPostCard
				// renders from subjectAction.
				include: ['subject'],
				cursor: cursor ?? undefined,
				limit
			})
			return {
				items: result.data,
				next: result.meta.next
			}
		},
		[api, since, audience, audienceType, tag, search, visibilityKey, issuer, sort]
	)

	const { items, isLoading, isLoadingMore, error, hasMore, loadMore, reset, sentinelRef } =
		useInfiniteScroll<ActionView>({
			fetchPage,
			pageSize: PAGE_SIZE,
			deps: [since, audience, audienceType, tag, search, visibilityKey, issuer, sort],
			enabled: active
		})

	// Live arrivals not yet present in the fetched pages.
	const [livePosts, setLivePosts] = React.useState<ActionView[]>([])
	const itemsRef = React.useRef<ActionView[]>(items)
	itemsRef.current = items
	const liveRef = React.useRef<ActionView[]>(livePosts)
	liveRef.current = livePosts
	const hiddenAudiencesRef = React.useRef<Set<string> | undefined>(hiddenAudiences)
	hiddenAudiencesRef.current = hiddenAudiences

	// Reset live buffer when the query (watermark or filters) changes. Keyed on
	// visibilityKey (the joined string), not the visibility array, for stable identity.
	React.useEffect(() => {
		setLivePosts([])
	}, [since, audience, audienceType, tag, search, visibilityKey, issuer, sort])

	// Drop live entries once pagination has caught up to them (prevents the
	// buffer from growing without bound across a long session).
	React.useEffect(() => {
		setLivePosts((prev) => {
			if (prev.length === 0) return prev
			const ids = new Set(items.map((p) => p.id))
			const next = prev.filter((p) => !ids.has(p.id))
			return next.length === prev.length ? prev : next
		})
	}, [items])

	useWsBus({ types: ['action'] }, function handleAction(msg) {
		const action = msg.data as ActionView
		if (action.type !== 'POST' && action.type !== 'REPOST' && action.type !== 'PTNR') return
		if (action.status && action.status !== 'active') return
		// Own posts are always read (mirrors the server-side excludeOwnIssuer and
		// feed.tsx's isRead); never surface them as a live unread arrival.
		if (api?.idTag && action.issuer?.idTag === api.idTag) return
		// Home feed: drop arrivals addressed to a community opted out of home.
		const aud = action.audience
		if (aud?.type === 'community' && aud.idTag && hiddenAudiencesRef.current?.has(aud.idTag)) {
			return
		}
		// Use the same timestamp the watermark tracks (receivedAt for the home
		// feed) so a freshly-received but old-dated post isn't dropped here.
		if (feedReadTs(action) <= since) return
		if (itemsRef.current.some((p) => p.id === action.id)) return
		if (liveRef.current.some((p) => p.id === action.id)) return

		if (action.type !== 'REPOST' || action.subjectAction) {
			setLivePosts((prev) => [...prev, action])
			return
		}
		// REPOST WS pushes omit the embedded original; fetch it so the card isn't
		// rendered hollow. Skip '@'-prefixed (remote) subjects the local store
		// can't resolve — they surface hydrated on the next refetch.
		const subjectId = action.subject
		if (!api || !subjectId || subjectId.startsWith('@')) return
		api.actions
			.get(subjectId)
			.then((subject) => {
				if (itemsRef.current.some((p) => p.id === action.id)) return
				if (liveRef.current.some((p) => p.id === action.id)) return
				setLivePosts((prev) => [...prev, { ...action, subjectAction: subject }])
			})
			.catch(() => {
				/* leave for the next refetch */
			})
	})

	const posts = React.useMemo(() => {
		if (livePosts.length === 0) return items
		const ids = new Set(items.map((p) => p.id))
		return [...items, ...livePosts.filter((p) => !ids.has(p.id))]
	}, [items, livePosts])

	return {
		posts,
		isLoading,
		isLoadingMore,
		error,
		hasMore,
		loadMore,
		sentinelRef,
		reset
	}
}

// vim: ts=4

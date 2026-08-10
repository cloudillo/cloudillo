// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { createApiClient, getAppBus } from '@cloudillo/core'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ContentHits } from '../utils/search.js'

/** Wait this long after the last keystroke before asking the server. */
const QUERY_DEBOUNCE_MS = 250

/**
 * Result cap. The sidebar shows far fewer, but content hits are only one input to
 * the ranking (locally matched titles rank above them), so it needs headroom.
 */
const RESULT_LIMIT = 100

export interface ContentSearchData {
	hits: ContentHits
	/**
	 * False while a query is in flight, so the sidebar can show progress. `hits` is
	 * empty whenever it is false — results are cleared as soon as the query or the
	 * tag filter changes, so nothing vetted against the previous request is ever
	 * rendered against the current one.
	 */
	ready: boolean
	/** The server hit `RESULT_LIMIT`, so there are content matches not in `hits`. */
	truncated: boolean
	error?: Error
}

const emptyHits: ContentHits = new Map()
const idleData: ContentSearchData = { hits: emptyHits, ready: true, truncated: false }

export interface UseContentSearchOptions {
	/** Document to search inside. */
	fileId: string
	/** The document's owner, which is the node holding its index. */
	ownerTag?: string
	/** Our own identity, used when the document has no explicit owner. */
	idTag?: string
	/** The raw search box text. */
	query: string
	/**
	 * AND-combined tag filter, sent to the server rather than applied to the
	 * results: the server truncates to the top `RESULT_LIMIT` by relevance, so
	 * filtering afterwards would silently drop a page matching both text and tag
	 * but ranking below the cut. Without query text it never reaches here.
	 */
	tags?: ReadonlySet<string>
	/** Gate the whole thing off until the user actually searches. */
	enabled: boolean
}

/**
 * Full-text search over one document's page content, answered by the server.
 *
 * `GET /api/search` runs SQLite FTS5 over an index the backend maintains from the
 * same RTDB writes, and returns one hit per matching page with a snippet already
 * built. Indexing server-side is what makes an unopened document searchable and
 * keeps the cost off every edit. The app's own file-scoped token reaches it (the
 * backend whitelists exactly that one route for file scopes) and the server
 * confines results to this document's tree regardless of what we ask for.
 */
export function useContentSearch({
	fileId,
	ownerTag,
	idTag,
	query,
	tags,
	enabled
}: UseContentSearchOptions): ContentSearchData & { retry: () => void } {
	const [data, setData] = useState<ContentSearchData>(idleData)
	const [retryCount, setRetryCount] = useState(0)
	// Bumped on every request so a slow response cannot overwrite a newer one.
	const seqRef = useRef(0)

	const retry = useCallback(() => setRetryCount((n) => n + 1), [])

	const trimmed = query.trim()
	const targetTag = ownerTag || idTag
	// Joined here rather than in the effect so the deps compare by value: a new Set
	// of the same tags must not re-fire the query. Sorted because a Set iterates in
	// insertion order, so toggling a tag off and on would otherwise change it.
	const tagParam = tags?.size ? Array.from(tags).sort().join(',') : ''

	useEffect(() => {
		// Without query text nothing is asked of the server: a tag-only filter is
		// answered locally from the resident page map, which returns every page
		// carrying the tag where the server could only return the top
		// `RESULT_LIMIT` by relevance.
		if (!enabled || !fileId || !targetTag || !trimmed) {
			seqRef.current++ // cancel whatever is in flight
			// `!prev.error` is what lets going idle clear a failure: the error state
			// is itself empty-and-ready, so without it `prev` would be returned and
			// the error would outlive every later query, retry included.
			setData((prev) => (prev.hits.size === 0 && prev.ready && !prev.error ? prev : idleData))
			return
		}

		const seq = ++seqRef.current
		// Drop the previous results outright: they were matched against the old
		// query text, and (since the tag filter is applied server-side, inside the
		// match) against the old tag set too.
		setData({ hits: emptyHits, ready: false, truncated: false })

		// The seq ref discards a superseded answer; this stops the request itself,
		// so a fast typist leaves no trail of live FTS queries behind.
		const abortCtrl = new AbortController()

		const timer = setTimeout(async () => {
			try {
				const bus = getAppBus()
				// A fresh client per query: the bus rotates the scoped token, so
				// reading it at call time is what keeps a long-lived search box
				// working across a rotation.
				const api = createApiClient({ idTag: targetTag, authToken: bus.accessToken })
				const results = await api.search.query(
					{
						q: trimmed,
						type: 'doc',
						fileId,
						...(tagParam && { tags: tagParam }),
						limit: RESULT_LIMIT
					},
					{ signal: abortCtrl.signal }
				)
				if (seq !== seqRef.current) return

				const hits: ContentHits = new Map()
				for (const hit of results) {
					// Deep rows carry the page id in `partId`; a whole-file row has
					// none and cannot be navigated to, so it is not a page hit.
					if (!hit.partId) continue
					hits.set(hit.partId, {
						score: hit.score,
						...(hit.snippet && { snippet: hit.snippet }),
						...(hit.snippetMatches?.length && {
							snippetMatches: hit.snippetMatches
						}),
						...(hit.anchorId && { blockId: hit.anchorId })
					})
				}
				setData({ hits, ready: true, truncated: results.length >= RESULT_LIMIT })
			} catch (err) {
				if (seq !== seqRef.current) return
				// Cancelled from the cleanup below: the query it belonged to is gone
				// and the effect that replaced it owns the state now.
				if ((err as Error)?.name === 'AbortError') return
				console.error('[useContentSearch] Search failed:', err)
				// `ready` stops the sidebar spinner; without it a failed query reads
				// as "still searching" forever. Title matches keep working, so the
				// sidebar is degraded rather than broken.
				setData({
					hits: emptyHits,
					ready: true,
					truncated: false,
					error: err instanceof Error ? err : new Error(String(err))
				})
			}
		}, QUERY_DEBOUNCE_MS)

		return () => {
			clearTimeout(timer)
			abortCtrl.abort()
		}
	}, [enabled, fileId, targetTag, trimmed, tagParam, retryCount])

	return { ...data, retry }
}

// vim: ts=4

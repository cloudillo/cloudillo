// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { RtdbClient } from '@cloudillo/rtdb'
import { useCallback, useEffect, useRef, useState } from 'react'

import { fromStoredPage } from '../rtdb/transform.js'
import type { PageRecord, StoredPageRecord } from '../rtdb/types.js'

type PageWithId = PageRecord & { id: string }

export interface AllPagesData {
	allPages: Map<string, PageWithId>
	ready: boolean
	error?: Error
}

const emptyData: AllPagesData = { allPages: new Map(), ready: false }

/**
 * The single source of pages for the whole app: the sidebar tree, wiki-link
 * resolution, the `@` picker, search and navigation all read this one map.
 *
 * One map on purpose: a lazy per-level tree loader alongside this subscription
 * would diverge from it, and identity lookups against the lazy one cannot see
 * unfiled pages or pages inside collapsed branches. Revisit paging only past a
 * few thousand pages, and then page the metadata rather than splitting the map.
 *
 * The projection is what keeps that affordable: `ca`/`ua`/`cb` are written on
 * every page mutation and read by nothing in the UI, and `hc` is dead legacy
 * weight. It also decides *delivery* — the server drops an event touching no
 * selected field, principally `ua`-only touches — but a `tg` write still arrives
 * and still rebuilds the map.
 */
const PAGE_FIELDS = ['ti', 'ic', 'pp', 'o', 'tg'] as const
export function useAllPages(client: RtdbClient | undefined): AllPagesData & { retry: () => void } {
	const [data, setData] = useState<AllPagesData>(emptyData)
	const [retryCount, setRetryCount] = useState(0)
	const lastClientRef = useRef<RtdbClient | undefined>(undefined)

	const retry = useCallback(() => setRetryCount((n) => n + 1), [])

	useEffect(() => {
		if (!client) return

		if (lastClientRef.current !== client) {
			lastClientRef.current = client
			// A different client means a different document — nothing carries over.
			// On the first run this is the same reference, so React bails out of
			// the re-render.
			setData(emptyData)
		} else {
			// A retry of the same client: the pages in hand are still valid, so keep
			// them (and `ready`) and drop only the stale error. Emptying the map
			// would read as "the open page was deleted" and unmount the editor out
			// from under whoever pressed "Try again".
			setData((prev) => (prev.error ? { ...prev, error: undefined } : prev))
		}

		const unsubscribe = client
			.collection('p')
			.select(...PAGE_FIELDS)
			.onSnapshot(
				(snapshot) => {
					const allPages = new Map<string, PageWithId>()
					snapshot.forEach((doc) => {
						const page = fromStoredPage(doc.data() as StoredPageRecord)
						allPages.set(doc.id, { id: doc.id, ...page })
					})
					setData({ allPages, ready: true })
				},
				(err) => {
					console.error('[useAllPages] Subscription error:', err)
					// Every caller waits on `ready`; leaving it false hangs the app on
					// an empty sidebar with nothing to explain it. Pages that already
					// arrived stay — they are incomplete, not wrong.
					setData((prev) => ({
						...prev,
						ready: true,
						error: err instanceof Error ? err : new Error(String(err))
					}))
				}
			)

		return unsubscribe
	}, [client, retryCount])

	return { ...data, retry }
}

// vim: ts=4

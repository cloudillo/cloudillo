// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { RtdbClient } from '@cloudillo/rtdb'
import { useCallback, useEffect, useState } from 'react'

import { type PageUpdate, pageUpdateFields, updatePage } from '../rtdb/page-ops.js'
import { fromStoredPage } from '../rtdb/transform.js'
import type { PageRecord } from '../rtdb/types.js'
import { decodeStoredPage } from '../rtdb/types.js'

export interface PagePropertiesData {
	/** The page as stored, with every field — not the map's projection. */
	record?: PageRecord
	loading: boolean
	error?: Error
	retry: () => void
	/** Write a patch and fold it into `record`, so the panel does not re-read. */
	save: (patch: PageUpdate) => Promise<void>
}

/**
 * What `save` folds back into the local record — every field a patch may name.
 *
 * Read off `UPDATE_KEYS` in `rtdb/page-ops.ts` rather than listed again: the two
 * lists silently disagreeing meant a saved field that never appeared in the panel
 * until the page was reopened.
 */
const PATCH_FIELDS = pageUpdateFields()

/**
 * One page read whole, for the property panel.
 *
 * The page map (`useAllPages`) is loaded with a field projection that leaves
 * `author`, `desc` and `image` out — they are needed one page at a time, not for
 * every page at once — so the panel has to read the open page unprojected to see
 * them at all.
 *
 * A one-shot `get`, not a subscription: the panel is an editing surface, and a
 * collaborator's write arriving mid-edit would overwrite what is being typed.
 * The projected fields the panel also shows (`slug`, `draft`, `kind`, `noNav`) do
 * stay live on the page map, so the sidebar and the publisher never see this stale
 * copy.
 */
export function usePageProperties(
	client: RtdbClient | undefined,
	pageId: string | undefined
): PagePropertiesData {
	const [record, setRecord] = useState<PageRecord | undefined>()
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<Error | undefined>()
	const [retryCount, setRetryCount] = useState(0)

	const retry = useCallback(() => setRetryCount((n) => n + 1), [])

	useEffect(() => {
		if (!client || !pageId) {
			setRecord(undefined)
			setLoading(false)
			setError(undefined)
			return
		}

		let cancelled = false
		setRecord(undefined)
		setLoading(true)
		setError(undefined)

		client
			.collection('p')
			.doc(pageId)
			.get()
			.then((snapshot) => {
				if (cancelled) return
				// A page deleted under us leaves no record; the panel renders its
				// empty state rather than an error, since nothing went wrong.
				const data = snapshot.exists ? decodeStoredPage(snapshot.data(), pageId) : undefined
				setRecord(data ? fromStoredPage(data) : undefined)
				setLoading(false)
			})
			.catch((err) => {
				if (cancelled) return
				console.error('[Notillo] Page properties read failed:', err)
				setError(err instanceof Error ? err : new Error(String(err)))
				setLoading(false)
			})

		return () => {
			cancelled = true
		}
	}, [client, pageId, retryCount])

	const save = useCallback(
		async (patch: PageUpdate) => {
			if (!client || !pageId) return
			await updatePage(client, pageId, patch)
			// `null` clears the stored field, so it folds back in as `undefined`.
			setRecord((prev) => {
				if (!prev) return prev
				const next = { ...prev }
				for (const field of PATCH_FIELDS) {
					const value = patch[field]
					if (value === undefined) continue
					if (value === null) delete next[field]
					else Object.assign(next, { [field]: value })
				}
				return next
			})
		},
		[client, pageId]
	)

	return { record, loading, error, retry, save }
}

// vim: ts=4

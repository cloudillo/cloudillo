// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useState, useEffect } from 'react'

import type { RtdbClient } from '@cloudillo/rtdb'
import type { StoredPageRecord, PageRecord } from '../rtdb/types.js'
import { fromStoredPage } from '../rtdb/transform.js'

export function usePageTree(client: RtdbClient | undefined) {
	const [pages, setPages] = useState<Map<string, PageRecord & { id: string }>>(new Map())

	useEffect(() => {
		if (!client) return

		const unsub = client
			.collection('p')
			.orderBy('o', 'asc')
			.onSnapshot(
				(snapshot) => {
					const pageMap = new Map<string, PageRecord & { id: string }>()
					snapshot.forEach((doc) => {
						const page = fromStoredPage(doc.data() as StoredPageRecord)
						pageMap.set(doc.id, { id: doc.id, ...page })
					})
					setPages(pageMap)
				},
				(err) => {
					console.error('[usePageTree] Subscription error:', err)
				}
			)

		return unsub
	}, [client])

	return pages
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useState, useEffect } from 'react'

import type { RtdbClient } from '@cloudillo/rtdb'
import type { StoredPageRecord, PageRecord } from '../rtdb/types.js'
import { fromStoredPage } from '../rtdb/transform.js'

type PageWithId = PageRecord & { id: string }

export interface AllPagesData {
	allPages: Map<string, PageWithId>
	ready: boolean
}

const emptyData: AllPagesData = { allPages: new Map(), ready: false }

export function useAllPages(client: RtdbClient | undefined): AllPagesData {
	const [data, setData] = useState<AllPagesData>(emptyData)

	useEffect(() => {
		if (!client) return

		const unsubscribe = client.collection('p').onSnapshot(
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
			}
		)

		return unsubscribe
	}, [client])

	return data
}

// vim: ts=4

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

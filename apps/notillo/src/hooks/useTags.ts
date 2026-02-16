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

import type { RtdbClient, QuerySnapshot } from '@cloudillo/rtdb'
import type { StoredBlockRecord } from '../rtdb/types.js'

export interface TagData {
	tags: Set<string>
	tagPages: Map<string, Set<string>>
}

const emptyTagData: TagData = { tags: new Set(), tagPages: new Map() }

export function useTags(client: RtdbClient | undefined): TagData {
	const [tagData, setTagData] = useState<TagData>(emptyTagData)

	useEffect(() => {
		if (!client) return

		const unsub = client.collection('b').onSnapshot(
			(snapshot: QuerySnapshot) => {
				const tagSet = new Set<string>()
				const tagPagesMap = new Map<string, Set<string>>()
				snapshot.forEach((doc) => {
					const data = doc.data() as StoredBlockRecord
					if (!data.c) return
					for (const item of data.c) {
						if (item.type === 'tag' && 'props' in item && item.props?.tag) {
							tagSet.add(item.props.tag)
							if (!tagPagesMap.has(item.props.tag)) {
								tagPagesMap.set(item.props.tag, new Set())
							}
							tagPagesMap.get(item.props.tag)!.add(data.p)
						}
					}
				})
				setTagData({ tags: tagSet, tagPages: tagPagesMap })
			},
			(err) => {
				console.error('[useTags] Subscription error:', err)
			}
		)

		return unsub
	}, [client])

	return tagData
}

// vim: ts=4

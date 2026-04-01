// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useState, useEffect } from 'react'

import type { RtdbClient } from '@cloudillo/rtdb'

export interface TagData {
	tags: Set<string>
	tagCounts: Map<string, number>
}

const emptyTagData: TagData = { tags: new Set(), tagCounts: new Map() }

export function useTags(client: RtdbClient | undefined): TagData {
	const [tagData, setTagData] = useState<TagData>(emptyTagData)

	useEffect(() => {
		if (!client) return

		const unsubscribe = client
			.collection('p')
			.aggregate('tg')
			.onSnapshot((snapshot) => {
				const tags = new Set<string>()
				const tagCounts = new Map<string, number>()

				for (const group of snapshot.groups) {
					const tag = String(group.group)
					tags.add(tag)
					tagCounts.set(tag, group.count)
				}

				setTagData({ tags, tagCounts })
			})

		return unsubscribe
	}, [client])

	return tagData
}

// vim: ts=4

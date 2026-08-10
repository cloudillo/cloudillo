// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useMemo } from 'react'

import type { PageWithId } from '../utils/search.js'

export interface TagData {
	tags: Set<string>
	tagCounts: Map<string, number>
}

/**
 * The tag cloud, derived from the page map rather than queried. An RTDB
 * `aggregate('tg')` needs nothing the map `useAllPages` already holds, so a
 * second full-collection subscription on `p` would only buy a group set that can
 * drift from the pages it describes.
 */
export function useTags(pages: Map<string, PageWithId>): TagData {
	return useMemo(() => collectTags(pages), [pages])
}

/** The pass behind `useTags`, split out so it can be tested without a renderer. */
export function collectTags(pages: Map<string, PageWithId>): TagData {
	const tags = new Set<string>()
	const tagCounts = new Map<string, number>()

	for (const page of pages.values()) {
		if (!page.tags) continue
		for (const tag of page.tags) {
			tags.add(tag)
			tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
		}
	}

	return { tags, tagCounts }
}

// vim: ts=4

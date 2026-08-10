// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { collectTags } from '../hooks/useTags.js'
import type { PageWithId } from '../utils/search.js'

function page(id: string, tags?: string[]): PageWithId {
	return {
		id,
		title: id,
		...(tags !== undefined && { tags }),
		order: 0,
		createdAt: '',
		updatedAt: '',
		createdBy: 'u'
	}
}

function pageMap(...list: PageWithId[]): Map<string, PageWithId> {
	return new Map(list.map((p) => [p.id, p]))
}

describe('collectTags', () => {
	it('counts every use of a tag across pages', () => {
		// Page `c` carries no `tags` at all, which is the function's only branch.
		const { tags, tagCounts } = collectTags(
			pageMap(page('a', ['docs', 'magyar']), page('b', ['docs']), page('c'))
		)
		expect([...tags].sort()).toEqual(['docs', 'magyar'])
		expect(tagCounts.get('docs')).toBe(2)
		expect(tagCounts.get('magyar')).toBe(1)
	})
})

// vim: ts=4

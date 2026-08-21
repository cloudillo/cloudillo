// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * What an `index` block's knobs are *called*, in one place.
 *
 * The block renders a summary of its query (`PageIndex.tsx`) and the formatting
 * toolbar's selects (`IndexToolbar.tsx`) offer the same values as options. Two lists
 * would let `date-desc` read as "Newest first" in one and something else in the
 * other, with no failing test to catch it.
 *
 * The `*Label` functions switch over the closed unions rather than index a `Record`:
 * a stored prop that somehow escaped `siteListingQuery`'s decode would otherwise
 * reach `Object.prototype` and answer with a function.
 */

import type { SiteListingLayout, SiteListingQuery, SiteListingSort } from '@cloudillo/core'
import { tSiteListingLayout, tSiteListingSort, tSiteListingSource } from '@cloudillo/core'
import type { TFunction } from 'i18next'

/**
 * In the order they are offered, which is roughly narrowest scope first — and it is
 * the *validator's* order, so a member added to the closed set in
 * `libs/core/src/site.ts` shows up in the toolbar without a second edit.
 */
export const LISTING_SOURCES = tSiteListingSource.values
export const LISTING_SORTS = tSiteListingSort.values
export const LISTING_LAYOUTS = tSiteListingLayout.values

export function sourceLabel(source: SiteListingQuery['source'], t: TFunction): string {
	switch (source) {
		case 'subtree':
			return t('Subtree')
		case 'siblings':
			return t('Siblings')
		case 'tag':
			return t('Tag')
		case 'all':
			return t('All pages')
		default:
			return t('Children')
	}
}

export function sortLabel(sort: SiteListingSort, t: TFunction): string {
	switch (sort) {
		case 'date-asc':
			return t('Oldest first')
		case 'title':
			return t('Title')
		case 'order':
			return t('Tree order')
		default:
			return t('Newest first')
	}
}

export function layoutLabel(layout: SiteListingLayout, t: TFunction): string {
	switch (layout) {
		case 'compact':
			return t('Compact')
		case 'tree':
			return t('Tree')
		case 'cards':
			return t('Cards')
		default:
			return t('List')
	}
}

/**
 * `Children · Newest first · List`, plus `· Feed` and `· 5` when those are set.
 *
 * A `tag` source names its tag instead of the bare word: it is the one source whose
 * meaning depends on another prop, and "Tag · Title · List" says nothing about which.
 */
export function listingSummary(query: SiteListingQuery, t: TFunction): string {
	const parts: string[] = [
		query.source === 'tag' && query.tag
			? t('Tag: {{tag}}', { tag: query.tag })
			: sourceLabel(query.source, t),
		sortLabel(query.sort, t),
		layoutLabel(query.layout, t)
	]
	if (query.limit) parts.push(String(query.limit))
	if (query.feed) parts.push(t('Feed'))
	return parts.join(' · ')
}

// vim: ts=4

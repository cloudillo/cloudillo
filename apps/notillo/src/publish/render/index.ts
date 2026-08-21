// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type {
	SiteArchetypeContext,
	SiteListingEntry,
	SiteSerializerOptions,
	SiteSourcePage
} from '@cloudillo/core'
import { buildPageMeta, renderPageMetaScript, SITE_TAGS_DIR, siteTagSlug } from '@cloudillo/core'

import { siteArchetype, sitePageArchetype } from './archetypes.js'
import type { SiteListingRenderOptions } from './listing.js'
import { renderListing } from './listing.js'
import type { NotilloSourceBlock } from './serializer.js'
import { renderBlocks, siteSummary } from './serializer.js'

export * from './archetypes.js'
export * from './listing.js'
export * from './serializer.js'

/**
 * One page as a stored fragment: the metadata script first, then the archetype
 * layout wrapping the page's blocks.
 *
 * The metadata script leads because the server hoists it into `<head>` without
 * parsing the rest. The surrounding document is composed at request time, so no
 * versioned asset path and no absolute URL is baked in here.
 */
export function renderPageFragment(
	page: SiteSourcePage,
	blocks: NotilloSourceBlock[],
	opts: SiteSerializerOptions = {},
	ctx: SiteArchetypeContext = {}
): string {
	// A page with no `desc` override describes itself with its own opening prose.
	// Derived here rather than in `buildPageMeta`, which is
	// `@cloudillo/core`'s and never sees the blocks.
	const described =
		page.desc === undefined ? { ...page, desc: siteSummary(blocks, undefined, opts) } : page
	const meta = renderPageMetaScript(buildPageMeta(described, ctx.byline))
	const body = renderBlocks(blocks, opts)
	return `${meta}\n${siteArchetype(page.archetype).render(page, body, ctx)}`
}

/**
 * One generated tag listing as a fragment: a plain page whose *body is the listing*,
 * so it needs nothing new in the serving path. It carries no authored content —
 * prose about a topic is just a page.
 */
export function renderTagFragment(
	tag: string,
	entries: readonly SiteListingEntry[],
	opts: SiteListingRenderOptions = {}
): string {
	const page: SiteSourcePage = {
		// No pageId: nothing authored it, and it is absent from `manifest.pages` for
		// the same reason. Anything enumerating tag paths derives them the way this
		// does, from `siteTagSlug` over the tags the manifest already records.
		pageId: '',
		path: `${SITE_TAGS_DIR}/${siteTagSlug(tag)}`,
		title: tag,
		archetype: sitePageArchetype.name
	}
	const meta = renderPageMetaScript(buildPageMeta(page))
	return `${meta}\n${sitePageArchetype.render(page, renderListing(entries, 'list', opts))}`
}

/**
 * The fragment served for a path the container does not hold, stored as
 * `404.part.html`.
 *
 * An ordinary fragment at an ordinary entry, so the server wraps it exactly like a
 * page and only the HTTP status differs. The title is the status code itself —
 * nothing here may emit an English word, and the code reads the same in every
 * language. There is no byline and no date to give it, so no context either.
 */
export function renderNotFoundFragment(): string {
	const page: SiteSourcePage = {
		// Synthetic, like a tag listing: nothing authored it, so it has no pageId and
		// is absent from `manifest.pages`.
		pageId: '',
		path: '404',
		title: '404',
		archetype: sitePageArchetype.name
	}
	const meta = renderPageMetaScript(buildPageMeta(page))
	return `${meta}\n${sitePageArchetype.render(page, '')}`
}

// vim: ts=4

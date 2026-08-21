// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The two XML artifacts a container carries: its own `sitemap.xml`, and an Atom
 * `feed.xml` beside every `index` page.
 *
 * **Both store paths, not URLs** — the server absolutises them as it serves, so an
 * `app_domain` change cannot stale every published container. Stored verbatim rather
 * than as fragments; neither may take the `.part.html` suffix.
 */

import { escapeHtml, siteFeedEntry } from '@cloudillo/core'

/**
 * Latest entries an `index` page's feed carries. Capped rather than deferred: a
 * reader polls a feed forever, so an uncapped one is a cost paid on every poll.
 *
 * Exported so the publisher can drop the rows it will not use *before* building an
 * entry for each of them — `buildFeed` slices too, but by then the summaries have
 * been derived and thrown away.
 */
export const SITE_FEED_MAX_ENTRIES = 20

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>'
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const ATOM_NS = 'http://www.w3.org/2005/Atom'

/**
 * What an entry with no date at all gets. Atom requires `<updated>`, and a feed
 * that fails to parse over one undated page helps nobody. 1980-01-01 UTC is the
 * same floor `ZIP_MTIME` uses, so an artificial date is recognisable as one.
 */
const EPOCH = '1980-01-01T00:00:00Z'

const W3C_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/

/**
 * A stored date, or nothing when it is not a shape a validator accepts. Dates reach
 * here from RTDB records written by several generations of this app; one malformed
 * `ua` must not cost the whole document its sitemap.
 */
function w3cDate(date: string | undefined): string | undefined {
	return date && W3C_DATE.test(date) ? date : undefined
}

/**
 * A container-relative page path as these artifacts store it: relative to the mount
 * point, always leading with `/`, and `/` for the mount root itself. The server
 * prepends the host and the mount point as it serves, so the same document mounted
 * at `/` or at `/blog` produces the same bytes here.
 */
function sitePathRef(path: string): string {
	return `/${path.replace(/^\/+|\/+$/g, '')}`
}

/**
 * Text bound for XML, not HTML. `escapeHtml` covers `& < > " '`, but XML 1.0 forbids
 * the C0 controls outright — there is no escape for them, so they are dropped rather
 * than encoded. One such character in one page title (a markdown import, a paste, a
 * direct RTDB write) is a fatal parse error for every consumer of the whole file,
 * taking the container's discoverability with it while the HTML fragments render fine.
 */
function xmlText(s: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: the point of the rule
	return escapeHtml(s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''))
}

// ── sitemap.xml ──

export interface SitemapRow {
	/** Container-relative, without the fragment extension — a `ResolvedPage.path`. */
	path: string
	/** Last modified, ISO 8601. Dropped when it is not a W3C datetime. */
	lastmod?: string
}

/**
 * This document's portion of the sitemap. The site-level `/sitemap.xml` is a
 * sitemap *index* composed by the server from the mount table, pointing at one of
 * these per mounted container.
 */
export function buildSitemap(rows: readonly SitemapRow[]): string {
	const urls = rows.map((row) => {
		const lastmod = w3cDate(row.lastmod)
		return (
			`<url><loc>${xmlText(sitePathRef(row.path))}</loc>` +
			(lastmod ? `<lastmod>${lastmod}</lastmod>` : '') +
			'</url>'
		)
	})
	return `${XML_DECL}\n<urlset xmlns="${SITEMAP_NS}">\n${urls.join('\n')}\n</urlset>\n`
}

// ── feed.xml ──

export interface FeedEntry {
	/** The page's own id — what its permanent `<id>` is built from. */
	pageId: string
	/** Container-relative, without the fragment extension. */
	path: string
	title: string
	/** First publish, ISO 8601. */
	published?: string
	/** Last modified as published, ISO 8601. */
	updated?: string
	/** Display name of the byline, resolved by the publisher. */
	author?: string
	summary?: string
	tags?: readonly string[]
}

export interface FeedInput {
	/** The `index` page this feed belongs to. */
	pageId: string
	path: string
	title: string
	/** Newest first, as `sortForListing` returns them. Capped on the way out. */
	entries: readonly FeedEntry[]
}

/**
 * Ids are `urn:cloudillo:` URNs, not URLs. An Atom id must be stable forever, and
 * every URL id in every reader's database would change the day the site moved.
 */
function feedId(kind: string, id: string): string {
	return `urn:cloudillo:${kind}:${encodeURIComponent(id)}`
}

function renderFeedEntry(entry: FeedEntry): string {
	const published = w3cDate(entry.published)
	const updated = w3cDate(entry.updated) ?? published ?? EPOCH
	return [
		'<entry>',
		`<title>${xmlText(entry.title)}</title>`,
		`<id>${feedId('page', entry.pageId)}</id>`,
		`<link rel="alternate" type="text/html" href="${xmlText(sitePathRef(entry.path))}"/>`,
		`<updated>${updated}</updated>`,
		published ? `<published>${published}</published>` : '',
		entry.author ? `<author><name>${xmlText(entry.author)}</name></author>` : '',
		entry.summary ? `<summary>${xmlText(entry.summary)}</summary>` : '',
		...(entry.tags ?? []).map((tag) => `<category term="${xmlText(tag)}"/>`),
		'</entry>'
	].join('')
}

/**
 * An `index` page's feed: the same listing the page already renders, in a different
 * serialization, capped at `SITE_FEED_MAX_ENTRIES`.
 *
 * Atom rather than RSS: `<updated>` and `<id>` mean one thing each, where RSS has a
 * dialect for every element that matters here.
 */
export function buildFeed(feed: FeedInput): string {
	const entries = feed.entries.slice(0, SITE_FEED_MAX_ENTRIES)
	let newest = ''
	for (const entry of entries) {
		const date = w3cDate(entry.updated) ?? w3cDate(entry.published)
		if (date && date > newest) newest = date
	}

	return (
		`${XML_DECL}\n<feed xmlns="${ATOM_NS}">\n` +
		`<title>${xmlText(feed.title)}</title>\n` +
		`<id>${feedId('feed', feed.pageId)}</id>\n` +
		`<updated>${newest || EPOCH}</updated>\n` +
		'<link rel="self" type="application/atom+xml"' +
		` href="${xmlText(sitePathRef(siteFeedEntry(feed.path)))}"/>\n` +
		`<link rel="alternate" type="text/html" href="${xmlText(sitePathRef(feed.path))}"/>\n` +
		`${entries.map(renderFeedEntry).join('\n')}\n</feed>\n`
	)
}

// vim: ts=4

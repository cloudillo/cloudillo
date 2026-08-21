// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Listing markup — the rows an `index` block resolved to, in one of four layouts.
 *
 * Baked at publish time and never mounted as an island — see `renderIndexBlock` in
 * `serializer.ts`. **No English word is emitted anywhere below**, for the reason
 * `archetypes.ts` states.
 */

import type { SiteListingEntry, SiteListingLayout } from '@cloudillo/core'
import { escapeHtml } from '@cloudillo/core'

import { renderByline, renderDate } from './archetypes.js'

export interface SiteListingRenderOptions {
	resolveTagHref?: (tag: string) => string | undefined
}

/** An entry's tags, each linked to its generated listing. An unresolved tag is text. */
function renderEntryTags(entry: SiteListingEntry, opts: SiteListingRenderOptions): string {
	if (!entry.tags?.length) return ''
	const items = entry.tags.map((tag) => {
		const href = opts.resolveTagHref?.(tag)
		const label = escapeHtml(tag)
		return href
			? `<li><a class="cl-site-tag" href="${escapeHtml(href)}">${label}</a></li>`
			: `<li><span class="cl-site-tag">${label}</span></li>`
	})
	return `<ul class="cl-site-listing-tags">${items.join('')}</ul>`
}

/** The entry's title, as a link when the publisher resolved one and as text otherwise. */
function renderLink(entry: SiteListingEntry): string {
	const href = entry.href
	const title = escapeHtml(entry.title)
	return href
		? `<a class="cl-site-listing-link" href="${escapeHtml(href)}">${title}</a>`
		: `<span class="cl-site-listing-link">${title}</span>`
}

function renderDesc(entry: SiteListingEntry): string {
	return entry.description
		? `<p class="cl-site-listing-desc">${escapeHtml(entry.description)}</p>`
		: ''
}

/** The full row: title, byline and date, description, tags. */
function renderListLayout(
	entries: readonly SiteListingEntry[],
	opts: SiteListingRenderOptions
): string {
	const items = entries.map(
		(entry) =>
			'<li class="cl-site-listing-item">' +
			`<h2 class="cl-site-listing-title">${renderLink(entry)}</h2>` +
			'<div class="cl-site-listing-meta">' +
			renderByline(entry.byline) +
			renderDate(entry.date, 'cl-site-date') +
			'</div>' +
			renderDesc(entry) +
			renderEntryTags(entry, opts) +
			'</li>'
	)
	return `<ol class="cl-site-listing cl-site-listing--list">${items.join('')}</ol>`
}

/** Title and date, nothing else — a table of contents rather than a feed. */
function renderCompactLayout(entries: readonly SiteListingEntry[]): string {
	const items = entries.map(
		(entry) =>
			'<li class="cl-site-listing-item">' +
			renderLink(entry) +
			renderDate(entry.date, 'cl-site-date') +
			'</li>'
	)
	return `<ol class="cl-site-listing cl-site-listing--compact">${items.join('')}</ol>`
}

/**
 * The flat, depth-annotated array as nested lists.
 *
 * The depths are author-driven data reaching a string builder, so they are clamped
 * rather than trusted: a first entry claiming depth 3 would open three unclosed
 * `<ul>`s. Each step down is at most one level.
 */
function renderTreeLayout(entries: readonly SiteListingEntry[]): string {
	const out: string[] = ['<ul class="cl-site-listing cl-site-listing--tree">']
	// The previous row's effective depth. `-1` is "no row yet", which is what makes
	// the clamp below put a first entry claiming depth 3 at the top level.
	let prev = -1

	for (const entry of entries) {
		const raw = Number.isFinite(entry.depth)
			? Math.max(0, Math.floor(entry.depth as number))
			: 0
		const depth = Math.min(raw, prev + 1)

		if (prev < 0) {
			// Nothing open yet.
		} else if (depth > prev) {
			// One level deeper, so the row it hangs off stays open around it.
			out.push('<ul>')
		} else {
			out.push('</li>')
			for (let d = prev; d > depth; d--) {
				out.push('</ul></li>')
			}
		}
		out.push(`<li>${renderLink(entry)}`)
		prev = depth
	}

	if (prev >= 0) {
		out.push('</li>')
		for (let d = prev; d > 0; d--) {
			out.push('</ul></li>')
		}
	}
	out.push('</ul>')
	return out.join('')
}

/** Image, title, date and description — the layout that wants `entry.image`. */
function renderCardsLayout(entries: readonly SiteListingEntry[]): string {
	const items = entries.map((entry) => {
		const src = entry.image
		const img = src
			? `<img class="cl-site-listing-image" src="${escapeHtml(src)}" alt=""` +
				' loading="lazy">'
			: ''
		return (
			'<li class="cl-site-listing-item">' +
			img +
			`<h2 class="cl-site-listing-title">${renderLink(entry)}</h2>` +
			renderDate(entry.date, 'cl-site-date') +
			renderDesc(entry) +
			'</li>'
		)
	})
	return `<ol class="cl-site-listing cl-site-listing--cards">${items.join('')}</ol>`
}

/**
 * One listing as HTML. An empty listing emits nothing at all, in every layout —
 * an empty `<ol>` would still draw the stylesheet's spacing around nothing.
 */
export function renderListing(
	entries: readonly SiteListingEntry[],
	layout: SiteListingLayout,
	opts: SiteListingRenderOptions = {}
): string {
	if (!entries.length) return ''
	switch (layout) {
		case 'compact':
			return renderCompactLayout(entries)
		case 'tree':
			return renderTreeLayout(entries)
		case 'cards':
			return renderCardsLayout(entries)
		default:
			return renderListLayout(entries, opts)
	}
}

// vim: ts=4

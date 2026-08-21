// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Archetype layouts — the frame a page's blocks are rendered into. `page` is plain;
 * `post` adds a byline, a date and a last-modified footer.
 *
 * **Archetypes frame, blocks fill**, which is why there is no `index` archetype: a
 * listing is content, so it is a block an author can place anywhere.
 *
 * **No English word is emitted anywhere below** — no "by", no "Posted on". This
 * module has no i18n context, and a baked-in word is frozen into every container
 * already published. `<time datetime>` and class hooks carry it instead.
 */

import type { SiteArchetypeContext, SiteByline, SiteSourcePage } from '@cloudillo/core'
import { escapeHtml } from '@cloudillo/core'
import * as T from '@symbion/runtype'

import { attr } from './escape.js'

/**
 * The archetypes this build implements — the closed set. The **stored** `kind` stays
 * an open string, so this is what it is decoded *against* at the boundary
 * (`siteArchetype`), never the type of the record field itself.
 */
export const tSiteArchetypeName = T.literal('page', 'post')
export type SiteArchetypeName = T.TypeOf<typeof tSiteArchetypeName>

/** The archetype every page falls back to — the meaning of an absent `kind`. */
export const DEFAULT_ARCHETYPE: SiteArchetypeName = 'page'

export interface SiteArchetype {
	name: SiteArchetypeName
	/** `body` is already-serialized HTML; the layout only frames it. */
	render(page: SiteSourcePage, body: string, ctx?: SiteArchetypeContext): string
}

// ── Shared pieces ──

/**
 * The `YYYY-MM-DD` head of an ISO timestamp, or `''`.
 *
 * The one rule for how a page is dated: the editor's `index` block (`PageIndex.tsx`)
 * reads it too, so a row is dated in the editor exactly as it publishes.
 */
export function isoDatePart(value: string | undefined): string {
	if (typeof value !== 'string') return ''
	return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0] ?? ''
}

/**
 * The date portion of an ISO timestamp, never formatted: a month name would be
 * English forever. Shared with `listing.ts`.
 */
export function renderDate(value: string | undefined, className: string): string {
	if (typeof value !== 'string') return ''
	const date = isoDatePart(value)
	if (!date) return ''
	return `<time class="${className}" datetime="${escapeHtml(value)}">${date}</time>`
}

/**
 * The resolved byline: an avatar when the profile had one, then the name.
 *
 * **Not a link**: a profile URL is a shell route, and which route suits a person as
 * against a community is the shell's knowledge. The idTag rides along in
 * `data-cl-idtag` so the shell can link it at mount time without a republish.
 */
export function renderByline(byline: SiteByline | undefined): string {
	if (!byline) return ''
	const avatar = byline.avatar
	const img = avatar
		? `<img class="cl-site-byline-avatar" src="${escapeHtml(avatar)}"` +
			`${attr('data-cl-file', byline.avatarFileId)} alt="" width="32" height="32"` +
			' loading="lazy">'
		: ''
	return (
		`<span class="cl-site-byline"${attr('data-cl-idtag', byline.idTag)}>` +
		`${img}<span class="cl-site-byline-name">${escapeHtml(byline.name)}</span>` +
		'</span>'
	)
}

function renderTitle(page: SiteSourcePage): string {
	return `<h1 class="cl-site-page-title">${escapeHtml(page.title)}</h1>`
}

function renderBody(body: string): string {
	return `<div class="cl-site-page-body">${body}</div>`
}

// ── The two archetypes ──

export const sitePageArchetype: SiteArchetype = {
	name: 'page',
	render(page, body) {
		return (
			'<article class="cl-site-page" data-archetype="page">' +
			renderTitle(page) +
			renderBody(body) +
			'</article>'
		)
	}
}

/**
 * A post: byline and date above the body, last-modified below it. Last modified needs
 * no stored field — the newest `ua` read at publish time *is* it.
 */
const sitePostArchetype: SiteArchetype = {
	name: 'post',
	render(page, body, ctx = {}) {
		const meta = renderByline(ctx.byline) + renderDate(ctx.date, 'cl-site-date')
		const updated = renderDate(ctx.updated, 'cl-site-updated')
		return (
			'<article class="cl-site-page cl-site-post" data-archetype="post">' +
			'<header class="cl-site-post-header">' +
			renderTitle(page) +
			(meta ? `<div class="cl-site-post-meta">${meta}</div>` : '') +
			'</header>' +
			renderBody(body) +
			(updated ? `<footer class="cl-site-post-footer">${updated}</footer>` : '') +
			'</article>'
		)
	}
}

export const SITE_ARCHETYPES: Record<SiteArchetypeName, SiteArchetype> = {
	page: sitePageArchetype,
	post: sitePostArchetype
}

/**
 * The names the property panel offers, read off the validator rather than
 * `Object.keys`, which would hand back a bare `string[]`. No second list to remember.
 */
export const ARCHETYPE_NAMES: readonly SiteArchetypeName[] = tSiteArchetypeName.values

/**
 * Any archetype a newer Notillo writes resolves to `page` — an unknown `kind` must
 * never fail a publish.
 *
 * Decoded and not indexed directly: `kind` is a free-form stored string, so
 * `'constructor'` would answer with a truthy member of `Object.prototype`, skip the
 * fallback and throw out of `.render(…)`, failing the whole container build.
 */
export function siteArchetype(name: string | null | undefined): SiteArchetype {
	const decoded = T.decode(tSiteArchetypeName, name)
	return SITE_ARCHETYPES[T.isOk(decoded) ? decoded.ok : DEFAULT_ARCHETYPE]
}

/**
 * Whether this build knows `kind` — what the property panel asks before offering
 * the select, so an archetype from a newer Notillo is not silently swallowed.
 *
 * `== null`: a cleared `kind` is stored as `null` (`updatePage`) and means the same
 * as an absent one — inherited, and always known.
 */
export function knownArchetype(kind: string | null | undefined): boolean {
	return kind == null || T.isOk(T.decode(tSiteArchetypeName, kind))
}

// vim: ts=4

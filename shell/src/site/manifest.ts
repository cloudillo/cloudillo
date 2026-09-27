// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The published container's `_site/manifest.json`, client side.
 *
 * Two things need more than the boot seed carries — a breadcrumb trail deeper than
 * one level, and the pageId behind the owner's "Edit this page" link — and both need
 * the whole page table, too big to inline into every page response. So it is fetched
 * lazily, only when one of those is on screen, and the promise is shared
 * process-wide. Everything it feeds appears inside the bar's fixed height, so
 * arriving after first paint costs a word appearing, never a layout shift.
 */

import {
	decodeSiteManifest,
	SITE_MANIFEST_ENTRY,
	type SiteManifest,
	type SiteManifestPage,
	safeHref
} from '@cloudillo/core'
import { useAtomValue } from 'jotai'
import * as React from 'react'

import { siteContextAtom } from './state.js'

/**
 * One step of a breadcrumb trail: an ancestor page, or the current one.
 *
 * No `href` where `siteHref` refused the page's path — the crumb still reads as text,
 * as a rejected nav target does in `ui/SiteBar.tsx`.
 */
export interface SiteCrumb {
	href?: string
	title: string
}

/**
 * Where a container-relative path sits in the site's URL space. Mirror of
 * `site_path` in `crates/cloudillo-site/src/wrapper.rs` — the two compose the same
 * hrefs, so a server-painted link and a React one are the same string.
 *
 * `undefined` when the composition is not a same-origin path. `tSiteManifestPage.path`
 * is a bare `T.string` off a published container, and a path of `\evil.example` under
 * a `/` mount composes `/\evil.example`, which a browser resolves as protocol-relative
 * — an off-origin fetch or navigation from the owner's own chrome. `safeHref` is the
 * tested predicate for that shape; it also passes `https:` and `#frag`, so the
 * leading-slash test is what narrows it to a path (the idiom is `search-target.ts`'s).
 */
export function siteHref(mountPath: string, path: string): string | undefined {
	const base = mountPath.replace(/\/+$/, '')
	const rel = path.replace(/^\/+|\/+$/g, '')
	const href = rel ? `${base}/${rel}` : base || '/'
	const safe = safeHref(href)
	return safe?.startsWith('/') ? safe : undefined
}

/**
 * One in-flight or settled read per mount, not per component.
 *
 * Keyed by mount because each mounted document ships its own page table; a single
 * slot would hand the second mount the first one's pages.
 *
 * **A settled failure is evicted**, so an offline moment does not cost every later
 * navigation its breadcrumbs until a reload. Only the settled one — an in-flight
 * entry is what keeps concurrent callers to a single request.
 */
const pending = new Map<string, Promise<SiteManifest | undefined>>()

async function loadSiteManifest(mountPath: string): Promise<SiteManifest | undefined> {
	const url = siteHref(mountPath, SITE_MANIFEST_ENTRY)
	if (!url) return undefined
	try {
		// No credentials: this is public content, and a published page is the one
		// surface where the reader may well have no session at all.
		const res = await fetch(url, { credentials: 'omit' })
		if (!res.ok) return undefined
		return decodeSiteManifest(await res.json())
	} catch (err) {
		console.error('[site] Failed to load the site manifest:', err)
		return undefined
	}
}

/**
 * The manifest, once something needs it. `enabled` is the whole point: most pages
 * are one level deep and read by someone who cannot edit them.
 */
export function useSiteManifest(enabled: boolean): SiteManifest | undefined {
	const [manifest, setManifest] = React.useState<SiteManifest | undefined>(undefined)
	// Not `siteSeed` directly — see `siteContextAtom`: a page fetched from a shell
	// route has no seed, and its mount path comes off the fragment's headers.
	const mountPath = useAtomValue(siteContextAtom)?.site.mountPath

	React.useEffect(() => {
		if (!enabled || mountPath === undefined) return
		let cancelled = false
		let read = pending.get(mountPath)
		if (!read) {
			read = loadSiteManifest(mountPath)
			pending.set(mountPath, read)
			// After it settles, never before: while the request is in flight the
			// entry is what keeps concurrent mounts to one fetch. See `pending`.
			void read.then((loaded) => {
				if (loaded === undefined) pending.delete(mountPath)
			})
		}
		void read.then((loaded) => {
			if (!cancelled) setManifest(loaded)
		})
		return () => {
			cancelled = true
		}
	}, [enabled, mountPath])

	return manifest
}

/** The manifest entry for a site-absolute path, with the pageId that keys it. */
export function siteManifestPage(
	manifest: SiteManifest | undefined,
	mountPath: string,
	pathname: string
): { pageId: string; page: SiteManifestPage } | undefined {
	if (!manifest) return undefined
	for (const [pageId, page] of Object.entries(manifest.pages)) {
		if (siteHref(mountPath, page.path) === pathname) return { pageId, page }
	}
	return undefined
}

/**
 * The trail from the mount root down to `page`, the page itself last.
 *
 * `ancestry` is pageIds, nearest last (`SiteManifestPage` in
 * `libs/core/src/site.ts`); an id the manifest does not hold is a drafted ancestor
 * with nowhere to link to, so it is skipped rather than rendered as a gap.
 */
export function siteBreadcrumbs(
	manifest: SiteManifest | undefined,
	mountPath: string,
	page: SiteManifestPage | undefined
): SiteCrumb[] {
	if (!manifest || !page) return []
	const crumbs: SiteCrumb[] = []
	for (const ancestorId of page.ancestry ?? []) {
		const ancestor = manifest.pages[ancestorId]
		if (ancestor)
			crumbs.push({ href: siteHref(mountPath, ancestor.path), title: ancestor.title })
	}
	crumbs.push({ href: siteHref(mountPath, page.path), title: page.title })
	// A refused path keeps its crumb — the trail's shape is what tells the reader
	// where they are, and one step of it losing its anchor is the smaller loss.
	return crumbs
}

// vim: ts=4

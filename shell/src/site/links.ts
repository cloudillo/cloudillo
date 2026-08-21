// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Which clicks the site runtime takes over.
 *
 * Published content is inert HTML — plain `<a href>`, never a `<Link>`, because
 * the serializer runs in a publisher with no router in it. So the interception
 * happens once, at the document level, and hands the path to `navigate()`.
 *
 * **Every same-origin left-click, shell routes included.** A link out of a
 * published page into `/~/…` is an ordinary SPA transition; there is no reason
 * for it to cost a reload just because it leaves the site. What is excluded is
 * only ever "this path is not a client route at all" — see `isClientRoutablePath`,
 * plus **`/`** on a shell document: there the `/` route is the shell's own
 * placeholder home (`layout.tsx`), so a link to the site root has to be a full load.
 * On a site document `/` is a page like any other — a mount can publish a home page,
 * and `/index.part.html` is its fragment endpoint. History can still come back to a
 * `/` the reader cold-loaded even where the refusal applies, and what makes that
 * render is the fragment cache: those bytes were kept, so `followRoute` in
 * `SitePage.tsx` serves the root from memory rather than 404ing on the refusal.
 */

import { isSiteDocument } from './detect.js'

/**
 * First path segments the backend answers from disk or from another handler.
 * Mirrors `SERVE_DIR_ROOTS` / `should_serve_spa_fallback` in cloudillo-rs
 * (`crates/cloudillo/src/routes/static_files.rs`); if this drifts, a client-side
 * route renders the shell's 404 over a file that exists.
 */
const SERVER_ROOTS = ['api', 'ws', 'apps', 'fonts', 'sounds', 'sw.js', '.well-known']

/** `assets-` alone names no version, so the prefix must be followed by something. */
const VERSIONED_ASSET_PREFIX = 'assets-'

/** Context sigils: `~` for home, `@<idTag>` for a community — see `routes.ts`. */
function isContextSegment(segment: string): boolean {
	return segment === '~' || segment.startsWith('@')
}

/**
 * The path this click should be routed to, or `undefined` to leave it to the
 * browser. Pure: the caller does the `preventDefault()` and the `navigate()`.
 */
export function siteLinkTarget(event: MouseEvent): string | undefined {
	// Something upstream already handled it — a `<Link>` in the site bar, most
	// often, whose own handler runs first because React listens on `#app`.
	if (event.defaultPrevented) return undefined
	// Anything but a plain left click means the reader asked for a new tab, a
	// new window, a download or a context menu.
	if (event.button !== 0) return undefined
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return undefined

	const target = event.target
	const anchor = target instanceof Element ? target.closest('a') : null
	if (!anchor?.getAttribute('href')) return undefined
	if (anchor.hasAttribute('download')) return undefined
	const anchorTarget = anchor.getAttribute('target')
	if (anchorTarget && anchorTarget !== '_self') return undefined

	let url: URL
	try {
		url = new URL(anchor.href, window.location.href)
	} catch {
		return undefined
	}
	if (url.origin !== window.location.origin) return undefined
	if (!isClientRoutablePath(url.pathname)) return undefined
	// A fragment on the current page: the browser's own anchor scrolling is what
	// the reader expects, and re-fetching the page they are standing on is not.
	if (
		url.hash &&
		url.pathname === window.location.pathname &&
		url.search === window.location.search
	) {
		return undefined
	}

	return `${url.pathname}${url.search}${url.hash}`
}

/** Can React Router render this path, or does the server own it? */
export function isClientRoutablePath(pathname: string): boolean {
	// The site root is a page like any other now that a document can publish a home
	// page: `/index.part.html` is its verbatim endpoint (`siteFragmentUrl`), and
	// `serve_site_path` in cloudillo-rs answers it. Only on a document the site
	// wrapper served, though — on a shell document the `/` route is the shell's own
	// placeholder home (`layout.tsx`), and whether this host serves a site root at
	// all is something only the server knows, so the reload is the answer there.
	// Ceiling: on a root mount that publishes no home page, a hand-written nav target
	// of `/` now renders the site's not-found page instead of that placeholder — the
	// derived nav never emits `/` in that case.
	if (pathname === '/') return isSiteDocument

	const segments = pathname.split('/').filter(Boolean)
	const first = segments[0] ?? ''
	if (SERVER_ROOTS.includes(first)) return false
	if (first.length > VERSIONED_ASSET_PREFIX.length && first.startsWith(VERSIONED_ASSET_PREFIX)) {
		return false
	}

	// A shell route is client-routable whatever it looks like, and it is the one
	// kind of path here that can carry a dot in its last segment: a resId's owner
	// half is an idTag (`/~/app/quillo/bob.org:abc`). Checked before the extension
	// rule below, which would otherwise hand every dotted idTag to the browser.
	if (isContextSegment(first)) return true

	// Any dot in the last segment means a file the container serves verbatim — a
	// feed, the manifest, or whatever else the author put in it — so it is left to
	// the browser. Not an allowlist of extensions: a container serves arbitrary
	// assets, and a list mirroring the backend's drifts silently, at which point a
	// link to `/assets/report.pdf` is intercepted, fetched as `report.pdf.part.html`
	// and rendered as the site's 404 — while the same link on a cold load works.
	// Safe because no page path has a dot: `publish/slug.ts` constrains a slug to
	// `[a-z0-9-]`.
	const name = segments[segments.length - 1] ?? ''
	if (name.lastIndexOf('.') > 0) return false

	return true
}

// vim: ts=4

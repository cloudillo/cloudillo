// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A published page's content, fetched.
 *
 * The container stores fragments only; the server composes the document around
 * one at request time. `/blog/hello` is that fragment wrapped in a
 * skeleton, `/blog/hello.part.html` is the same bytes verbatim — so client-side
 * navigation is one fetch of the second endpoint, and nothing here has to know
 * anything a cold load did not already know. The path is the whole key.
 *
 * Anything but a clean 200 is `{ status: 'missing' }`; a network failure is the
 * separate `{ status: 'error' }`, because an offline reader is not looking at a
 * page that does not exist and needs something to retry.
 *
 * The cache exists for the page the shell booted on, the site root above all: cold-load
 * at `/`, click into `/blog`, press Back. Those bytes are already in the document, so
 * history comes back to them with no request at all — and where `/` is left to the
 * browser (`links.ts` explains when), the cache is the only thing that renders it.
 * The entered page is captured before anything mutates it; every other page rides
 * along in the same map.
 */

import {
	SITE_FRAGMENT_EXT,
	SITE_PAGE_META_TYPE,
	type SitePageMeta,
	safeHref,
	tSitePageMeta
} from '@cloudillo/core'
import * as T from '@symbion/runtype'

import { isSiteDocument, type SiteBootSeed, siteSeed } from './detect.js'

/** What `loadSiteFragment` answers with. */
export type SiteFragment =
	/**
	 * `context` only on a fetch the server answered with the site headers below —
	 * a page reached from a shell route, where there is no boot seed at all. Absent
	 * on a cache hit and on a server that does not emit them, which is exactly when
	 * whatever `siteContextAtom` already holds is the better answer.
	 */
	| { status: 'ok'; html: string; context?: SiteBootSeed }
	| { status: 'missing' }
	| { status: 'error' }

/** Fragments held by path. Bounded — a reader can walk a large site in one session. */
const cache = new Map<string, string>()
const CACHE_LIMIT = 16

/** What `index.html` ships, for the case where reading `document.title` cannot serve. */
const APP_NAME = 'Cloudillo'

/**
 * What the tab reads when no published page owns it — see `clearPageMeta`.
 *
 * On a **shell** document, whatever it booted with: `index.html`'s title is exactly
 * the right value and a suite may have set another.
 *
 * On a **site** document it must not be, and this is the whole point of the split:
 * this module is evaluated on a cold load of a published page, where the wrapper has
 * already put *that page's* title in the tab. Capturing it would make every shell
 * route the reader visits afterwards claim to be that page — the mislabelling
 * `clearPageMeta` exists to undo. The owner's display name is the site's own name
 * and the honest answer; the app name is the floor when there is no seed to ask.
 */
const SHELL_TITLE = isSiteDocument ? siteSeed?.owner.name || APP_NAME : document.title

/**
 * The verbatim endpoint for a page path. Mirror of `serve::entry_path` + `FRAGMENT_EXT`.
 *
 * `/` composes `/index.part.html`, the endpoint of a mount's published home page —
 * `serve_site_path` in cloudillo-rs strips the extension and resolves `index` there.
 */
export function siteFragmentUrl(pathname: string): string {
	const trimmed = pathname.replace(/\/+$/, '')
	return `${trimmed || '/index'}${SITE_FRAGMENT_EXT}`
}

/** Remember a fragment under the path it was served at. */
function cacheSiteFragment(pathname: string, html: string): void {
	cache.delete(pathname)
	cache.set(pathname, html)
	if (cache.size > CACHE_LIMIT) {
		const oldest = cache.keys().next()
		if (!oldest.done) cache.delete(oldest.value)
	}
}

/**
 * Whether this path's fragment is already in memory.
 *
 * The site root's route back on a shell document, where `isClientRoutablePath` leaves
 * `/` to the browser: a cold load cached its own bytes here and history can return to
 * it. See `followRoute` in `SitePage.tsx`.
 */
export function hasSiteFragment(pathname: string): boolean {
	return cache.has(pathname)
}

/**
 * Capture the page the shell booted on, exactly as it was published — two halves,
 * because the wrapper hoisted the metadata script into `<head>`.
 *
 * Call it **before** the island pass: `prepareIslandContainers` empties a `replace`
 * island's container, and a later snapshot has lost the placeholders a re-render
 * needs.
 */
export function cacheAdoptedFragment(pathname: string, node: HTMLElement): void {
	const meta = document.head.querySelector(`script[type="${SITE_PAGE_META_TYPE}"]`)
	cacheSiteFragment(pathname, (meta?.outerHTML ?? '') + node.innerHTML)
}

/**
 * The fragment for a path: from memory if it is there, else one fetch.
 *
 * The path is vetted before it becomes a URL. `location.pathname` keeps a leading
 * `//`, `isClientRoutablePath` accepts `//evil.example/foo` as an ordinary two-segment
 * page, and `fetch` resolves the composed `//evil.example/foo.part.html` as
 * *protocol-relative* — an attacker's origin, whose bytes go on to `innerHTML` in
 * `SitePage`. `safeHref` is the tested predicate for that shape (it also passes
 * `https:` and `#frag`, so the leading-slash test is what narrows it to a path), and
 * the idiom is `shell/src/search-target.ts`'s.
 */
export async function loadSiteFragment(pathname: string): Promise<SiteFragment> {
	const safe = safeHref(pathname)
	if (!safe?.startsWith('/')) return { status: 'missing' }

	const cached = cache.get(pathname)
	if (cached !== undefined) return { status: 'ok', html: cached }

	try {
		// No credentials: published pages are public, and this is the one surface
		// where the reader may well have no session at all.
		const res = await fetch(siteFragmentUrl(pathname), { credentials: 'omit' })
		if (!res.ok) return { status: 'missing' }
		// Our own container's bytes, or nothing. Unconditional rather than gated on
		// `res.redirected`, which closes the class instead of one instance: a 30x to
		// another origin arrives as `res.ok` (`redirect: 'follow'` is the default),
		// and so does anything else that resolves off-origin. The result goes straight
		// into `innerHTML`, which runs inline handlers even though it does not run
		// `<script>`.
		if (new URL(res.url).origin !== window.location.origin) return { status: 'missing' }
		const type = res.headers.get('content-type') ?? ''
		if (!type.includes('text/html')) return { status: 'missing' }
		const html = await res.text()
		// A published fragment always carries its metadata script — `render/index.ts`
		// emits one for pages, tag listings and the 404 alike. The shell's own
		// `index.html`, which is what an SPA fallback answers a `.part.html` miss
		// with, does not, and `res.ok` cannot tell the two apart. Same reason as the
		// origin check above: whatever this returns goes into `innerHTML`.
		if (!html.includes(SITE_PAGE_META_TYPE)) return { status: 'missing' }
		cacheSiteFragment(pathname, html)
		return { status: 'ok', html, context: readSiteContext(res) }
	} catch (err) {
		// Not cached, and not a 404: the page may be perfectly fine and the reader
		// merely offline, so this stays retryable.
		console.error('[site] Failed to load the page fragment:', err)
		return { status: 'error' }
	}
}

/**
 * Which site the fetched page belongs to, off the response headers.
 *
 * The boot seed only exists on a document the wrapper served, so a page reached from
 * a shell route — a search hit above all — has nothing to draw a bar from. These
 * headers are that second source; `undefined` when the server does not emit them,
 * which leaves whatever `siteContextAtom` already holds in place.
 *
 * The mount path stays out of the fragment itself, for the same reason the canonical
 * URL is composed rather than stored: a tenant that gains an app domain must not have
 * to republish every page.
 *
 * `nav` is empty and `docFileId` unknown — neither is on the wire. A bar with
 * breadcrumbs and provenance but no nav row is a strict improvement on no bar.
 */
function readSiteContext(res: Response): SiteBootSeed | undefined {
	const mountPath = res.headers.get('X-Cloudillo-Site-Mount')
	const idTag = res.headers.get('X-Cloudillo-Site-Owner')
	if (!mountPath || !idTag) return undefined
	return {
		owner: { idTag, name: res.headers.get('X-Cloudillo-Site-Owner-Name') || '' },
		site: { host: window.location.host, mountPath, docFileId: '' },
		nav: []
	}
}

/**
 * Move the swapped-in fragment's metadata script into `<head>` and apply it.
 *
 * Only what the wrapper itself emits is updated — `<title>`, `<meta
 * name="description">` and `<link rel="canonical">`. A new SEO tag added to the
 * wrapper must be added here too.
 */
export function applyPageMeta(node: HTMLElement, pathname: string): void {
	const selector = `script[type="${SITE_PAGE_META_TYPE}"]`
	document.head.querySelectorAll(selector).forEach((stale) => {
		stale.remove()
	})
	const script = node.querySelector(selector)
	if (script) document.head.appendChild(script)

	const meta = parsePageMeta(script?.textContent)
	// Always assigned, never only when there is a title: a fragment carrying no
	// metadata would leave the tab reading the previous page's.
	document.title = meta?.title || SHELL_TITLE
	setMetaContent('description', meta?.description)
	// Composed, not stored, for the same reason the server composes it: a tenant
	// that gains an app domain must not have to republish every page.
	setLinkHref('canonical', `${window.location.origin}${pathname}`)
}

/**
 * Put back what `applyPageMeta` replaced.
 *
 * A published page's title, description and canonical are the *document's*, not a
 * component's, so leaving them behind on a shell route mislabels every page after
 * it. Description and canonical are removed outright; the title falls back to
 * `SHELL_TITLE`, which is not the booted title on a site document — see there.
 */
export function clearPageMeta(): void {
	document.head.querySelectorAll(`script[type="${SITE_PAGE_META_TYPE}"]`).forEach((s) => {
		s.remove()
	})
	document.title = SHELL_TITLE
	setMetaContent('description', undefined)
	setLinkHref('canonical', undefined)
}

/**
 * Decoded rather than cast — this is markup off a published page. `'drop'` because
 * a newer publisher adding an SEO field must not cost the page its `<title>`.
 */
function parsePageMeta(json: string | null | undefined): SitePageMeta | undefined {
	if (!json) return undefined
	try {
		const meta = T.decode(tSitePageMeta, JSON.parse(json), { unknownFields: 'drop' })
		if (T.isOk(meta)) return meta.ok
		console.error(
			'[site] Malformed page metadata:',
			meta.err.map((e) => `${e.path.join('.')}: ${e.error}`).join(', ')
		)
		return undefined
	} catch (err) {
		console.error('[site] Malformed page metadata:', err)
		return undefined
	}
}

function setMetaContent(name: string, content: string | undefined): void {
	const existing = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
	if (!content) {
		existing?.remove()
		return
	}
	if (existing) {
		existing.content = content
		return
	}
	const el = document.createElement('meta')
	el.name = name
	el.content = content
	document.head.appendChild(el)
}

function setLinkHref(rel: string, href: string | undefined): void {
	const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
	if (!href) {
		existing?.remove()
		return
	}
	if (existing) {
		existing.href = href
		return
	}
	const el = document.createElement('link')
	el.rel = rel
	el.href = href
	document.head.appendChild(el)
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A published page, inside the shell.
 *
 * The server already painted the article. This component **adopts** that DOM node and
 * never re-renders it. Not `hydrateRoot`, which reconciles the entire server tree and
 * would mean a client-side React component for every block type producing
 * byte-identical output to the publisher — the second renderer this design exists to
 * avoid, and there is no "hydrate only these subtrees" mode.
 *
 * Islands mount through **portals**, not separate roots: a portal's children sit in
 * the React tree right here, inheriting every shell provider, where separate
 * `createRoot` calls would each need the stack remounted and `navigate()` would not
 * work at all.
 *
 * A cold load arrives with its content in the document; a click arrives with nothing.
 * They converge after the first effect and share one path from `ensureContentNode`
 * onwards: swap the markup, hoist the metadata, rescan the islands, place the scroll.
 */

import { Button, LoadingSpinner } from '@cloudillo/react'
import { useSetAtom } from 'jotai'
import * as React from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

import { NotFound } from '../NotFound.js'
import { nodeHasSite, SITE_CHROME_ID, SITE_CONTENT_ID, SITE_PREBOOT_CLASS } from './detect.js'
import {
	applyPageMeta,
	cacheAdoptedFragment,
	clearPageMeta,
	hasSiteFragment,
	loadSiteFragment
} from './fragment.js'
import { type IslandTarget, scanIslands } from './islands.js'
import { isClientRoutablePath, siteLinkTarget } from './links.js'
import { SiteBar } from './SiteBar.js'
import { prepareIslandContainers, SiteIsland } from './SiteIsland.js'
import { SiteNotFound } from './SiteNotFound.js'
import {
	enableManualScrollRestoration,
	restoreBrowserScrollRestoration,
	restoreScrollOffset,
	saveScrollOffset
} from './scroll.js'
import { siteContextAtom, siteRouteActiveAtom } from './state.js'

export function SitePage() {
	const { t } = useTranslation()
	const hostRef = React.useRef<HTMLDivElement>(null)
	const [islands, setIslands] = React.useState<IslandTarget[]>([])
	const [notFound, setNotFound] = React.useState(false)
	const [loading, setLoading] = React.useState(false)
	const [loadError, setLoadError] = React.useState(false)
	// Bumped by "Try again", and a dependency of `followRoute`: with the same
	// location on both sides, nothing else would make the effect run twice.
	const [retry, setRetry] = React.useState(0)
	// What a screen reader is told after a swap. The clicked anchor is gone with the
	// old markup, so nothing else announces that the page changed.
	const [announce, setAnnounce] = React.useState('')
	const setSiteRouteActive = useSetAtom(siteRouteActiveAtom)
	const setSiteContext = useSetAtom(siteContextAtom)
	const location = useLocation()
	const navigate = useNavigate()
	const navigationType = useNavigationType()

	// The history entry this component mounted on, which is the one a cold load
	// settles. Captured in a ref so the mount effect cannot read a later value.
	const initialKeyRef = React.useRef(location.key)

	// What the DOM is currently showing. Refs, not state: they are written from an
	// effect and read only by the next one, so re-rendering for them would be noise.
	const shownKeyRef = React.useRef<string | null>(null)
	const shownPathRef = React.useRef<string | null>(null)

	// Whether the host currently shows nothing — the spinner's real condition.
	// `shownPathRef` cannot answer it: a 404 empties the host but still records its
	// path.
	const hostEmptyRef = React.useRef(true)

	// Whether this component has put a published page's metadata on the document,
	// and therefore owes the shell a restore on unmount. A 404 that never applied
	// any must not "restore" what it never replaced.
	const metaAppliedRef = React.useRef(false)

	// Stands down with the route, so `GuestOwnerBanner` comes back on a shell route
	// without either side testing a path.
	//
	// Only the *cleanup* is unconditional. The flag is raised where site content
	// actually appears — the two `enableManualScrollRestoration()` calls below —
	// and not here, because `layout.tsx` mounts this component for every unknown
	// path on every node, site or not, and `state.ts` defines the atom as "is a
	// published page on screen right now". Nor could it be decided at mount: this
	// effect is declared first and therefore runs before `adoptServerContent`, so
	// there is nothing yet to test.
	React.useLayoutEffect(
		function releaseSiteRoute() {
			return () => {
				setSiteRouteActive(false)
				// Both `enableManualScrollRestoration()` calls below live inside this
				// component's lifetime, so this one cleanup covers them — and it is a
				// no-op when neither ran.
				restoreBrowserScrollRestoration()
				// Same unmount that hands the route back to the shell: a published
				// page's title, description and canonical are the document's, and
				// leaving them behind mislabels every shell page after it.
				if (metaAppliedRef.current) clearPageMeta()
			}
		},
		[setSiteRouteActive]
	)

	// `useLayoutEffect`, not `useEffect`: `Layout` renders its header on the first
	// commit, before auth resolves, and a published page has no splash covering it.
	// With a passive effect the browser paints React's header *below* the
	// already-painted article for one frame. A layout effect lands the move before
	// that paint; the `setIslands` re-render is still pre-paint.
	React.useLayoutEffect(function adoptServerContent() {
		const node = document.getElementById(SITE_CONTENT_ID)
		// Absent after a round trip through a shell route, which unmounted it, and
		// between the `/` and `*` route elements, which are two mount points for
		// this same component. `followRoute` below fetches the fragment instead.
		//
		// Not scrubbed like the fetched path is: the browser parsed this under the
		// server's real CSP (`crates/cloudillo-site/src/wrapper.rs`), which already
		// refused every inline handler in it.
		if (node && hostRef.current) hostRef.current.appendChild(node)

		// The chrome swap, in the same pre-paint commit as the adoption above:
		// React's header and site bar are already in this commit's DOM, so removing
		// the server's copy here means the two never coexist in a painted frame and
		// the logo never blinks. The body class goes with it — it is what reserved
		// the chrome's height and let the article scroll while React had no layout
		// here yet, and keeping it would double the offset the moment `.c-layout`
		// provides its own.
		document.getElementById(SITE_CHROME_ID)?.remove()
		document.body.classList.remove(SITE_PREBOOT_CLASS)

		if (node) {
			// Only once there is site content to scroll: this component also mounts on
			// every top-level 404 (`layout.tsx`'s `ContextGuard` fallback and `*`
			// route), and flipping `history.scrollRestoration` for the rest of the
			// session is not something a shell 404 gets to do. The site-route flag
			// is raised on the same condition and for the same reason.
			enableManualScrollRestoration()
			setSiteRouteActive(true)

			// Before the island pass, which empties a `replace` island's container:
			// this is the last moment the entry page still looks the way it was
			// published, and history can come back to it (`fragment.ts`).
			cacheAdoptedFragment(window.location.pathname, node)
			// The wrapper's own metadata is on the document — ours to restore.
			metaAppliedRef.current = true
			shownKeyRef.current = initialKeyRef.current
			shownPathRef.current = window.location.pathname
			hostEmptyRef.current = false
		}

		// Emptying a `replace` island's container belongs here, before the
		// portals render: `createPortal` appends, so a live island whose
		// container still holds the placeholder sits underneath it.
		const targets = scanIslands(node)
		prepareIslandContainers(targets)
		setIslands(targets)

		// Not decorative: the browser scrolled to the fragment before the move, and
		// re-parenting the subtree changed its offset.
		const hash = window.location.hash.slice(1)
		if (hash) anchorElement(hash)?.scrollIntoView()
	}, [])

	// The one place a page arrives from anywhere but the server.
	React.useEffect(
		function followRoute() {
			const host = hostRef.current
			if (!host || shownKeyRef.current === location.key) return

			function applyScroll(el: HTMLElement) {
				// A POP with a remembered offset is the reader coming back to where
				// they were; everything else starts at the anchor or at the top.
				if (navigationType === 'POP' && restoreScrollOffset(location.key, el)) return
				const anchor = location.hash ? anchorElement(location.hash.slice(1)) : null
				if (anchor) anchor.scrollIntoView()
				else el.scrollTop = 0
			}

			// Same page, new history entry: nothing to fetch, only a place to find.
			if (shownPathRef.current === location.pathname) {
				shownKeyRef.current = location.key
				applyScroll(host)
				return
			}

			// Not a client route at all, so `<path>.part.html` cannot exist: answer the
			// 404 from memory rather than spending a round trip — and a blank host for
			// its duration — to be told the same thing.
			//
			// **Deliberately not `nodeHasSite()`.** Both halves of that are read from
			// markup only the site wrapper emits, so it is false on every *shell*
			// document, including one served by a node that does host a site. Gating
			// the fetch on it 404'd every `<Link>` into a site page that started from a
			// shell route, a search hit most of all. One fetch per genuine unknown path
			// is the trade the site note above `ShellRoutes` in `layout.tsx` states.
			//
			// The one exception is the site root on a *shell* document, where `/` is
			// the shell's own placeholder home and `isClientRoutablePath` leaves it to
			// the browser. A cold load there cached its own bytes and history can come
			// back — `loadSiteFragment` serves that from memory with no request at
			// all. An entry the cache has since evicted falls back to the 404 below.
			if (!isClientRoutablePath(location.pathname) && !hasSiteFragment(location.pathname)) {
				shownKeyRef.current = location.key
				shownPathRef.current = location.pathname
				setNotFound(true)
				return
			}

			let cancelled = false
			// A 404 has no content worth keeping on screen — the host is already
			// empty — so unlike a real page it must not survive the next fetch. The
			// spinner stands in.
			setNotFound(false)
			setLoading(true)
			void loadSiteFragment(location.pathname).then((fragment) => {
				if (cancelled) return
				setLoading(false)

				// Nobody answered, which is not the same as "no such page". Before
				// anything is torn down, and with the `shown*` refs left pointing at
				// what is genuinely on screen — that is what lets "Try again" re-enter
				// this effect and fetch the same path a second time.
				if (fragment.status === 'error') {
					setNotFound(false)
					setLoadError(true)
					return
				}

				shownKeyRef.current = location.key
				shownPathRef.current = location.pathname

				// The portals' containers are about to be replaced. Unmounting them
				// first is what lets an `enhance` island's cleanup run against the
				// element it borrowed — `SiteImageIsland` restores the `<img>`'s
				// cursor, role and tabindex — while that element is still the one on
				// screen. `flushSync` because the DOM below must not run ahead of it.
				flushSync(() => setIslands([]))

				if (fragment.status === 'missing') {
					host.replaceChildren()
					hostEmptyRef.current = true
					// Before the title: `clearPageMeta` assigns `SHELL_TITLE` itself,
					// and the description and canonical it removes belong to the page
					// the reader just left.
					clearPageMeta()
					document.title = t('Page not found')
					// The title is ours now, even though no page supplied it, so the
					// unmount still owes the shell its own back.
					metaAppliedRef.current = true
					setLoadError(false)
					setNotFound(true)
					return
				}

				setLoadError(false)
				setNotFound(false)
				// A fetched page is site content too, and this is the first moment we
				// know there is any — see the mount effect above.
				enableManualScrollRestoration()
				setSiteRouteActive(true)
				// Only when the server said which site this is: on a document the
				// wrapper served the seed is already there and better, and a fetch
				// that carried no headers must not clear it.
				if (fragment.context) setSiteContext(fragment.context)
				const node = ensureContentNode(host)
				// Raw, and deliberately: an element/attribute allowlist is applied to
				// every fragment at upload (`cloudillo-file`'s `site_html`), so a
				// container that reached storage carries nothing executable. The checks
				// in `loadSiteFragment` are what establish these *are* our container's
				// bytes; this line trusts that, not the publisher.
				node.innerHTML = fragment.html
				hostEmptyRef.current = false
				applyPageMeta(node, location.pathname)
				metaAppliedRef.current = true
				const targets = scanIslands(node)
				prepareIslandContainers(targets)
				setIslands(targets)
				applyScroll(host)

				// The clicked anchor is gone with the old markup, so focus would
				// fall to <body>. Move it to the new article instead: that is where
				// a screen reader should resume, and `tabIndex = -1` keeps the node
				// out of the tab order. `preventScroll` because `applyScroll` has
				// just placed the viewport deliberately.
				if (navigationType !== 'POP') node.focus({ preventScroll: true })
				setAnnounce(document.title)
			})

			return () => {
				cancelled = true
				setLoading(false)
			}
		},
		[location.key, location.pathname, location.hash, navigationType, retry, t]
	)

	// Where the outgoing page's scroll offset is taken: the cleanup runs while the
	// old content is still on screen, both when the key changes and on unmount. The
	// element is captured rather than read off the ref, which by then may be gone.
	React.useEffect(
		function rememberScrollOffset() {
			const host = hostRef.current
			const key = location.key
			return () => {
				saveScrollOffset(key, host)
			}
		},
		[location.key]
	)

	// Published content is inert HTML — plain anchors, never `<Link>` — so the
	// takeover is one document-level listener. `siteLinkTarget` decides; see it for
	// what is deliberately left to the browser.
	React.useEffect(
		function interceptLinks() {
			function onClick(event: MouseEvent) {
				const to = siteLinkTarget(event)
				if (!to) return
				event.preventDefault()
				navigate(to)
			}
			document.addEventListener('click', onClick)
			return () => {
				document.removeEventListener('click', onClick)
			}
		},
		[navigate]
	)

	return (
		<>
			{/* Replaces the wrapper's own bar, which the effect above removed in this
			    same commit. It is here, in the route subtree, rather than in
			    `Layout`, so it follows the route with no visibility logic. */}
			<SiteBar />
			{/* The site's own 404 only where there is a site to be outside of — this
			    component mounts on every top-level unknown path, not just on a site
			    document. See `nodeHasSite`.

			    This one *stays* on `nodeHasSite()`, unlike the fetch guard above: on
			    a shell document we genuinely do not know whether this node serves a
			    site, and the shell's own 404 is the safer answer for a reader who
			    may never have been on a site page at all. Only the *flavour* of the
			    404 is decided here — never whether the page was looked for. */}
			{notFound && (nodeHasSite() ? <SiteNotFound /> : <NotFound />)}
			{/* Not a 404: the page is very likely there and nobody answered. Leave
			    whatever is on screen alone and offer the fetch again. */}
			{loadError && (
				<div className="c-vbox g-2 p-3 align-items-center">
					<div className="c-alert error" role="alert">
						{t('Could not load this page. Check your connection.')}
					</div>
					<Button onClick={() => setRetry((n) => n + 1)}>{t('Try again')}</Button>
				</div>
			)}
			{/* Only while the host below is genuinely empty — a page reached from
			    another page keeps that one on screen for the round trip, and a
			    spinner under it would be noise. `hostEmptyRef` is what says which
			    of the two this is — a 404 emptied the host without forgetting its
			    path, so `shownPathRef` would answer the wrong question. */}
			{loading && !loadError && hostEmptyRef.current && (
				<div className="c-vbox align-items-center justify-content-center p-3">
					<LoadingSpinner />
				</div>
			)}
			{/* Renders no React children, so React never touches what it adopted:
			    first paint stays the server's paint — no flash, no second render.
			    It is also the published page's only scroll container — see
			    `.c-site-content-host` in `shell/src/style.css` and `scroll.ts`. */}
			<div ref={hostRef} className="c-site-content-host" hidden={notFound} />
			{/* The swap is a DOM mutation React never sees, so the page change has to
			    be spoken deliberately. */}
			<div className="sr-only" role="status" aria-live="polite">
				{announce}
			</div>
			{islands.map((target) =>
				createPortal(<SiteIsland target={target} />, target.el, target.key)
			)}
		</>
	)
}

/**
 * The content element, adopted from the server or made here. Its **id** carries the
 * reading measure (`#cl-site-content`, `shell/src/style.css`), so a fetched page wears
 * it too. `tabIndex = -1` makes it focusable without a tab stop — `followRoute` moves
 * focus here after a swap, since the clicked anchor left with the old markup.
 */
function ensureContentNode(host: HTMLElement): HTMLElement {
	const existing = host.firstElementChild
	if (existing instanceof HTMLElement && existing.id === SITE_CONTENT_ID) {
		// The adopted server node arrives without it — the wrapper has no reason to
		// emit an attribute only client-side navigation uses.
		existing.tabIndex = -1
		return existing
	}
	const node = document.createElement('div')
	node.id = SITE_CONTENT_ID
	node.tabIndex = -1
	host.replaceChildren(node)
	return node
}

/** `#szia-vilag` may arrive percent-encoded; the id in the markup is not. */
function anchorElement(hash: string): HTMLElement | null {
	const el = document.getElementById(hash)
	if (el) return el
	try {
		return document.getElementById(decodeURIComponent(hash))
	} catch {
		return null
	}
}

// vim: ts=4

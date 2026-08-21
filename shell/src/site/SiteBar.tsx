// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The site bar: navigation and provenance, in one row.
 *
 * Rendered by `SitePage`, i.e. by the **site route subtree** and not by `Layout`, so
 * it mounts and unmounts with the route and needs no visibility logic of its own.
 *
 * **This is the second painting of the same markup.** The wrapper already painted it
 * inert before the bundle parsed (`push_chrome` in `crates/cloudillo-site/src/
 * wrapper.rs`), and `SitePage` removes that copy in the layout effect that mounts
 * this one. Keep the two in step: same class names, same element order, same hrefs.
 * Element order is load-bearing — the stylesheet reaches the nav list from the
 * disclosure with `+`, so the two must stay adjacent siblings in both copies or the
 * mobile menu opens onto nothing. Neither copy owns a height, so drift is cosmetic
 * and never a layout shift.
 *
 * Everything renders from the boot seed, which is why it is right on the first commit.
 * The breadcrumb trail and the edit link's pageId come from the manifest, lazily, and
 * land inside the bar's fixed height.
 */

import { safeHref } from '@cloudillo/core'
import { IdentityTag, ProfilePicture, useAuth } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'

import { appPath, HOME_BASE, profilePath } from '../routes.js'
import type { SiteSeedNavEntry } from './detect.js'
import { siteBreadcrumbs, siteManifestPage, useSiteManifest } from './manifest.js'
import { siteContextAtom } from './state.js'

export function SiteBar() {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const location = useLocation()

	// Not `siteSeed` directly: a page fetched from a shell route has no seed, and
	// the atom carries the same facts off the fragment response's headers.
	const seed = useAtomValue(siteContextAtom)
	const mountPath = seed?.site.mountPath ?? '/'
	// A signed-in owner gets an edit link, which needs the pageId; anyone on a page
	// deeper than one level gets a trail. Nobody else pays for the manifest.
	// `docFileId` is what the link is built from and the headers do not carry it, so
	// without one the owner sees provenance rather than a link that goes nowhere.
	const isOwner = !!auth?.idTag && auth.idTag === seed?.owner.idTag && !!seed.site.docFileId
	const depth = relativeDepth(mountPath, location.pathname)
	const manifest = useSiteManifest(isOwner || depth > 1)

	const current = siteManifestPage(manifest, mountPath, location.pathname)
	const crumbs = siteBreadcrumbs(manifest, mountPath, current?.page)

	// A client-side navigation leaves the native disclosure exactly as it was, and
	// below the mobile breakpoint that means the menu covering the page the reader
	// just picked.
	const menuRef = React.useRef<HTMLDetailsElement>(null)
	React.useEffect(() => {
		if (menuRef.current) menuRef.current.open = false
	}, [location.pathname])

	// A server that predates the seed, or a malformed one: the page still renders,
	// it just has no bar. Hooks above this line, per the repo's lint rules.
	if (!seed) return null

	return (
		<div className="c-site-bar">
			{/* One list for both widths, and it is the disclosure's *sibling*, never
			    its child: a closed `<details>` hides its content outright, so a
			    nested list could not be the desktop row whatever `display` the
			    stylesheet gave it. Below the mobile breakpoint the same list becomes
			    the disclosure's panel through `[open] + .c-site-nav-list`, which
			    needs no script — and so keeps working on a page whose bundle never
			    loaded. */}
			<nav className="c-site-nav" aria-label={t('Site navigation')}>
				{!!seed.nav.length && (
					<>
						<details className="c-site-nav-menu" ref={menuRef}>
							<summary aria-label={t('Menu')} aria-controls="cl-site-nav-list" />
						</details>
						{/* Keyed by position, not by `target`: that field is typed
						    freely in the nav editor and deduped nowhere, so two
						    items pointing at `/` are an ordinary thing an author
						    can save. The target rides along so reconciliation
						    stays stable when only a label changes. */}
						<ul className="c-site-nav-list" id="cl-site-nav-list">
							{seed.nav.map((entry, index) => (
								<li key={`${index}:${entry.target}`}>
									<NavLink entry={entry} pathname={location.pathname} />
									{!!entry.children?.length && (
										<ul>
											{entry.children.map((child, childIndex) => (
												<li key={`${childIndex}:${child.target}`}>
													<NavLink
														entry={child}
														pathname={location.pathname}
													/>
												</li>
											))}
										</ul>
									)}
								</li>
							))}
						</ul>
					</>
				)}
			</nav>

			{/* The current page is the last crumb, so one crumb means a top-level
			    page and nothing worth drawing. */}
			{crumbs.length > 1 && (
				<nav className="c-site-breadcrumbs" aria-label={t('Breadcrumb')}>
					{/* An `<ol>`, per the WAI-ARIA breadcrumb pattern: a screen reader
					    then announces position and count. The separator moves to CSS —
					    it is decoration, and only CSS can flip it for RTL. */}
					<ol>
						{/* Keyed by position: a crumb `siteHref` refused has no href
						    to key on, and the trail is rebuilt whole anyway. */}
						{crumbs.map((crumb, i) => (
							<li key={`${i}:${crumb.href ?? ''}`}>
								{i === crumbs.length - 1 || !crumb.href ? (
									<span
										aria-current={i === crumbs.length - 1 ? 'page' : undefined}
									>
										{crumb.title}
									</span>
								) : (
									<a href={crumb.href}>{crumb.title}</a>
								)}
							</li>
						))}
					</ol>
				</nav>
			)}

			<div className="c-site-provenance">
				{isOwner ? (
					<Link
						className="owner"
						to={appPath(
							HOME_BASE,
							'notillo',
							`${seed.owner.idTag}:${seed.site.docFileId}`,
							// Notillo picks its page from internal state today, so `page`
							// is inert until it reads it as a launch param — a link to the
							// document is already the useful half.
							current ? { page: current.pageId } : undefined
						)}
					>
						<span className="name">{t('Edit this page')}</span>
					</Link>
				) : (
					<>
						<span className="label">{t('Hosted by')}</span>
						{/* The owner's own tag, never `'me'`: this is provenance shown to
						    every reader who is *not* the owner, and the profile page
						    resolves `'me'` against the signed-in identity — so a
						    community member reading their own community's published page
						    would land on themselves. `GuestOwnerBanner` may use `'me'`
						    because it renders only for a reader with no session at all. */}
						<Link
							className="owner"
							to={profilePath(HOME_BASE, seed.owner.idTag)}
							title={seed.owner.idTag}
						>
							<ProfilePicture
								profile={{ profilePic: seed.owner.profilePic }}
								srcTag={seed.owner.idTag}
								tiny
							/>
							<span className="name">{seed.owner.name || seed.owner.idTag}</span>
							{/* Only alongside a real name — without one the name span
							    already *is* the idTag, as in `GuestOwnerBanner`. */}
							{!!seed.owner.name && (
								<span className="tag">
									<IdentityTag idTag={seed.owner.idTag} />
								</span>
							)}
						</Link>
					</>
				)}
			</div>
		</div>
	)
}

/**
 * One nav link, or its bare label when the target is not a safe href.
 *
 * A plain anchor, like the server's copy of this row: `SitePage` intercepts in-site
 * links at the document level (`links.ts`), so this is a client-side navigation
 * without either copy knowing it.
 *
 * The target is free text an *author* typed, reaching an anchor on every published
 * page for an anonymous reader on the owner's own origin — so it goes through
 * `safeHref`, and a rejected one keeps its label as text with no anchor.
 */
function NavLink({ entry, pathname }: { entry: SiteSeedNavEntry; pathname: string }) {
	const href = safeHref(entry.target)
	if (!href) return <span>{entry.label}</span>
	return (
		<a href={href} aria-current={href === pathname ? 'page' : undefined}>
			{entry.label}
		</a>
	)
}

/** How many path segments below the mount this page sits at. `/` is depth 0. */
function relativeDepth(mountPath: string, pathname: string): number {
	const base = mountPath.replace(/\/+$/, '')
	const rel = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname
	return rel.split('/').filter(Boolean).length
}

// vim: ts=4

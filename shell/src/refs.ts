// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Portable `cl:` reference helpers.
 *
 * A Cloudillo resource is addressed by `<ownerIdTag>:<fileId>`, which is
 * globally portable: every instance can resolve it because the owner is
 * embedded. The browser URL is NOT portable (each user has their own
 * app-domain), but the *path* portion is. These helpers convert between the
 * current route and a shareable `cl:` reference.
 *
 * Two reference shapes:
 *  - Short document form `cl:<appId>/<owner>:<fileId>[?nav=…]` — the context
 *    is dropped (the owner in the resId makes it portable; the recipient opens
 *    it in their own `~` home). `access` is stripped (recipients get their own).
 *  - Lossless full form `cl:/<full-path>` — for any other route (built-in
 *    pages, community-context routes, profiles). Note the leading slash after
 *    the colon disambiguates it from the short form.
 *
 * Pure module — no React, no shell state — so it is unit-testable in isolation.
 */

import { HOME_CONTEXT } from './context/constants.js'

/**
 * True for a genuine in-app absolute path. Rejects protocol-relative (`//host`)
 * and backslash-escaped (`/\host`) forms that browsers resolve cross-origin —
 * passing those to `navigate()` would attempt an off-origin pushState.
 */
function isSafeAppPath(path: string): boolean {
	return path.startsWith('/') && path[1] !== '/' && path[1] !== '\\'
}

/**
 * Build a portable `cl:` reference for the given route.
 *
 * @param pathname - The route path (e.g. `/app/~/quillo/bob.org:abc123`)
 * @param search - Optional query string (with or without leading `?`)
 */
export function buildRef(pathname: string, search = ''): string {
	const query = search && !search.startsWith('?') ? `?${search}` : search
	const params = new URLSearchParams(query)

	// Document route: /app/<ctx>/<appId>/<resId…> where resId carries an owner.
	const m = pathname.match(/^\/app\/([^/]+)\/([^/]+)\/(.+)$/)
	if (m) {
		const appId = m[2]
		const resId = m[3]
		if (resId.includes(':')) {
			// Short, portable form. Drop context + access; preserve nav.
			const nav = params.get('nav')
			const suffix = nav ? `?nav=${encodeURIComponent(nav)}` : ''
			return `cl:${appId}/${resId}${suffix}`
		}
	}

	// Lossless full form for everything else.
	return `cl:${pathname}${query}`
}

/**
 * Resolve a `cl:` reference, a full `http(s)://` URL, or a bare `/path` into a
 * route path suitable for `navigate()`.
 *
 * @returns The route path, or `null` if the input is unparseable.
 */
export function resolveRef(input: string): string | null {
	const trimmed = input.trim()
	if (!trimmed) return null

	if (trimmed.startsWith('cl:')) {
		const body = trimmed.slice(3)
		// Leading slash => lossless full path form.
		if (body.startsWith('/')) return isSafeAppPath(body) ? body : null
		// Short document form: <appId>/<owner>:<fileId>[?…]
		const m = body.match(/^([^/]+)\/(.+)$/)
		if (!m) return null
		return `/app/${HOME_CONTEXT}/${m[1]}/${m[2]}`
	}

	if (/^https?:\/\//i.test(trimmed)) {
		try {
			const u = new URL(trimmed)
			return u.pathname + u.search
		} catch {
			return null
		}
	}

	// A bare path is already a portable route path (the embedded `~` resolves
	// to this viewer's home). Used when extracting the pathname of a pasted URL.
	if (trimmed.startsWith('/')) return isSafeAppPath(trimmed) ? trimmed : null

	return null
}

/**
 * True when `input` should be handled as a reference by the omnibox.
 *
 * A bare leading `/` is command mode, NOT a ref — the canonical shareable
 * forms are `cl:…` and full `http(s)://` URLs. (`resolveRef` still accepts a
 * bare `/path` because it extracts the pathname from a pasted full URL.)
 */
export function isRefLike(input: string): boolean {
	return /^(cl:|https?:\/\/)/i.test(input.trim())
}

/**
 * True when `input` looks like a bare Identity Tag (e.g. `bob.example.com`),
 * used for the profile-jump branch. Requires at least one dot. An optional
 * leading `@` is tolerated (the omnibox routes `@…` to search mode first).
 */
export function isIdTag(input: string): boolean {
	return /^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(input.trim())
}

/**
 * True for routes that can be shared (gates the breadcrumb copy button):
 * app pages/documents and profiles. False for login/onboarding/etc.
 */
export function canShareRoute(pathname: string): boolean {
	return pathname.startsWith('/app/') || pathname.startsWith('/profile/')
}

// vim: ts=4

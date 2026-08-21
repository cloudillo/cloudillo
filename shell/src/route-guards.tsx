// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The two guards `ShellRoutes` wraps its branches in. Split out of `layout.tsx` so a
 * suite can mount them against the real router without dragging the whole shell —
 * `ShellRoutes` itself, and with it the section registry, stays in `layout.tsx`.
 */

import { useAuth } from '@cloudillo/react'
import * as React from 'react'
import { Navigate, Outlet, useParams } from 'react-router-dom'

import { NotFound } from './NotFound.js'
import { isContextSegment } from './routes.js'

/**
 * The layout route under `:contextIdTag`, and the only thing standing between a
 * single-segment URL and the context machinery.
 *
 * `:contextIdTag` matches *any* single segment, so `/favicon.ico` and `/sw-0.8.6.js` reach
 * here; without the sigil test they would match the `index` route and `ContextRoot` would
 * navigate the user off the page.
 *
 * **This is also where a published page is caught, and it has to be here.** React Router
 * ranks a dynamic segment above a splat regardless of declaration order, so `:contextIdTag`
 * beats the terminal `<Route path="*">` for *every* site path — `/main-page` matches with
 * `contextIdTag = 'main-page'`, and `/blog/hello` matches with the subtree's inner `*`.
 * Placing the site route after this subtree keeps it from shadowing `/@idTag/…`, but does
 * nothing about the reverse; the ranking cannot be reordered away, so the fall-through is
 * the fix. Without it `SitePage` never mounts on a published page at all: the server's
 * article stays where it was painted, unadopted, while React renders a 404 underneath it —
 * no link interception, no chrome swap, no island ever mounted.
 *
 * `fallback` is *injected* rather than imported so this module keeps its point: it exists to
 * be mounted against the real router without dragging the shell in, and importing `SitePage`
 * here would pull the whole site runtime — lightbox library included — into its suite.
 * `layout.tsx` passes `<SitePage/>` unconditionally, on a shell document as much as on a site
 * one: gating it on `isSiteDocument` made a site page reachable only from another site page,
 * because that flag is captured once at module load — see the site note above `ShellRoutes`
 * in `layout.tsx` for the whole argument. `SitePage` renders the shell's own `NotFound` when
 * the path is no page *and* this node serves no site, so the default below is what answers a
 * caller that passes no fallback at all.
 */
export function ContextGuard({ fallback }: { fallback?: React.ReactNode }) {
	const { contextIdTag } = useParams()

	if (isContextSegment(contextIdTag)) return <Outlet />
	return <>{fallback ?? <NotFound />}</>
}

/**
 * The auth line, as a pathless layout route. `/login` sits outside the `:contextIdTag`
 * subtree, so this can never wrap it and the redirect cannot loop.
 */
export function RequireAuth() {
	const [auth] = useAuth()

	// `undefined` is "still booting", not "logged out"; the inline #initial-splash covers
	// exactly this render.
	if (auth === undefined) return null
	return auth ? <Outlet /> : <Navigate to="/login" replace />
}

// vim: ts=4

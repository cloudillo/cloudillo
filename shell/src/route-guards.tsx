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
 * navigate the user off the page. Anything that fails the test is a 404 — there is no
 * other reader for those URLs.
 */
export function ContextGuard() {
	const { contextIdTag } = useParams()

	return isContextSegment(contextIdTag) ? <Outlet /> : <NotFound />
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

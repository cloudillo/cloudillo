// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** The shell's `app/...` route branch, plus the context root and leader-only guards. */

import { useAuth } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { Navigate, Route } from 'react-router-dom'

import { activeContextAtom, isContextLeader, useCtx } from '../context/index.js'
import { feedPath } from '../routes.js'
import { AppLoadingIndicator } from './AppLoadingIndicator.js'
import { CalendarApp } from './calendar/index.js'
import { ContactsApp } from './contacts/index.js'
import { FeedApp } from './feed.js'
import { FilesApp } from './files.js'
import { GalleryApp } from './gallery.js'
import { ExternalApp } from './index.js'
import { MessagesApp } from './messages/index.js'
import { FileViewerApp } from './viewer/index.js'

// Ceiling on both waits below. The context resolution can fail silently (ctx.tsx only
// logs), and a guard that waits forever is worse than one that decides late.
const CONTEXT_WAIT_MS = 5000

/**
 * Route guard for apps backed by tenant-owned resources (contacts, calendar). The server guards
 * those endpoints with `require_leader`, so a plain member following a deep link or a bookmark into
 * a community would otherwise render an app whose every request 403s. Redirect to the feed instead.
 */
function LeaderOnlyRoute({ children }: { children: React.ReactElement }) {
	// The tenant the route names — `~` already resolved, so this is comparable with
	// `activeContext.idTag`.
	const ctx = useCtx()
	const [auth] = useAuth()
	const activeContext = useAtomValue(activeContextAtom)

	// Computed before the early returns so the timeout below covers BOTH waits.
	const target = ctx.idTag
	const waiting = !activeContext || (!!target && activeContext.idTag !== target)

	// Once this fires the waits fall through and let the app's own 401/403 surface.
	const [waitedTooLong, setWaitedTooLong] = React.useState(false)
	React.useEffect(() => {
		// Reset on arrival so a later context switch gets its own full wait, not an expired one.
		if (!waiting) {
			setWaitedTooLong(false)
			return
		}
		const timer = window.setTimeout(() => setWaitedTooLong(true), CONTEXT_WAIT_MS)
		return () => window.clearTimeout(timer)
	}, [waiting])

	// Unauthenticated: `CtxProvider`'s switch effect returns early, so `activeContext` never
	// arrives and BOTH waits below would spin forever. Render through and let the app's own
	// 401s drive the login flow. isContextLeader(null, undefined) is true by design, so this
	// matches the fall-through.
	if (!auth) return children

	// Decide only once the context is known: isContextLeader treats null as "leader" by design
	// (the Menu/Omnibox filters want that during load), so deciding early would render an app
	// whose every request 403s. The routes without a :contextIdTag segment need this wait too;
	// they simply have no `target` to compare.
	if (!activeContext) return waitedTooLong ? children : <AppLoadingIndicator stage="connecting" />

	// The URL segment is the source of truth; `activeContext` catches up asynchronously (see
	// `CtxProvider`), and a community deep link judged before they agree would be measured
	// against the previous context's roles.
	if (target && activeContext.idTag !== target) {
		return waitedTooLong ? children : <AppLoadingIndicator stage="connecting" />
	}

	if (isContextLeader(activeContext, auth?.idTag)) return children

	return <Navigate to={feedPath(ctx.base)} replace />
}

// The tail of every app route, below `<context>/app`. Keep `:appId/*` last —
// it is the catch-all for external microfrontends and would otherwise swallow the
// built-in apps above it.
const APP_ROUTES: Array<{ path: string; element: React.ReactElement }> = [
	{ path: 'files', element: <FilesApp /> },
	// The optional `:actionId` is the post permalink search hits land on.
	{ path: 'feed/:actionId?', element: <FeedApp /> },
	{ path: 'gallery', element: <GalleryApp /> },
	{ path: 'messages/:convId?', element: <MessagesApp /> },
	{
		path: 'contacts',
		element: (
			<LeaderOnlyRoute>
				<ContactsApp />
			</LeaderOnlyRoute>
		)
	},
	{
		path: 'calendar',
		element: (
			<LeaderOnlyRoute>
				<CalendarApp />
			</LeaderOnlyRoute>
		)
	},
	{ path: 'view/:resId', element: <FileViewerApp /> },
	{ path: ':appId/*', element: <ExternalApp className="w-100 h-100" /> }
]

/**
 * The bare context root, `/~` or `/@comm.tld` — a context with no section names no page,
 * so it lands on that context's feed. `ctx.base` is the URL's own segment, so the redirect
 * stays in the context that was asked for even while `activeContext` is catching up.
 */
export function ContextRoot() {
	const ctx = useCtx()

	return <Navigate to={feedPath(ctx.base)} replace />
}

/**
 * The `app/…` children of the context route. A plain function, not a component — see
 * `ShellRoutes` in `layout.tsx` for why.
 */
export function appRoutes() {
	return (
		<>
			{APP_ROUTES.map((r) => (
				<Route key={r.path} path={`app/${r.path}`} element={r.element} />
			))}
		</>
	)
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** The shell's `/app/...` route tree, plus the leader-only route guard. */

import { apiAtom, useAuth } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'

import {
	activeContextAtom,
	HOME_CONTEXT,
	isContextLeader,
	useContextFromRoute,
	useUrlContextIdTag
} from '../context/index.js'
import { AppLoadingIndicator } from './AppLoadingIndicator.js'
import { CalendarApp } from './calendar/index.js'
import { ContactsApp } from './contacts/index.js'
import { FeedApp } from './feed.js'
import { FilesApp } from './files.js'
import { GalleryApp } from './gallery.js'
import { ExternalApp } from './index.js'
import { MessagesApp } from './messages/index.js'
import { FileViewerApp } from './viewer/index.js'

function PlaceHolder({ title }: { title: string }) {
	return <h1>{title}</h1>
}

// Ceiling on both waits below. The context resolution can fail silently (use-context-from-route.ts
// only logs), and a guard that waits forever is worse than one that decides late.
const CONTEXT_WAIT_MS = 5000

/**
 * Route guard for apps backed by tenant-owned resources (contacts, calendar). The server guards
 * those endpoints with `require_leader`, so a plain member following a deep link or a bookmark into
 * a community would otherwise render an app whose every request 403s. Redirect to the feed instead.
 */
function LeaderOnlyRoute({ children }: { children: React.ReactElement }) {
	const { contextIdTag } = useParams()
	const [auth] = useAuth()
	const apiState = useAtomValue(apiAtom)
	const activeContext = useAtomValue(activeContextAtom)
	// The URL form of whatever context is active: `~` at home, the community's idTag otherwise.
	// The routes without a :contextIdTag segment keep the active context, so redirecting them to
	// HOME_CONTEXT would switch the user out of the community as a side effect of a permission
	// refusal.
	const activeUrlSegment = useUrlContextIdTag()

	// Computed before the early returns so the timeout below covers BOTH waits.
	const target = contextIdTag === HOME_CONTEXT ? apiState.idTag : contextIdTag
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

	// Unauthenticated: useContextFromRoute returns early, so `activeContext` never arrives and BOTH
	// waits below would spin forever. Render through and let the app's own 401s drive the login
	// flow. isContextLeader(null, undefined) is true by design, so this matches the fall-through.
	if (!auth) return children

	// Decide only once the context is known: isContextLeader treats null as "leader" by design
	// (the Menu/Omnibox filters want that during load), so deciding early would render an app
	// whose every request 403s. The routes without a :contextIdTag segment need this wait too;
	// they simply have no `target` to compare.
	if (!activeContext) return waitedTooLong ? children : <AppLoadingIndicator stage="connecting" />

	// The URL segment is the source of truth; `activeContext` catches up asynchronously (see
	// `useContextFromRoute`), and a community deep link judged before they agree would be
	// measured against the previous context's roles.
	if (target && activeContext.idTag !== target) {
		return waitedTooLong ? children : <AppLoadingIndicator stage="connecting" />
	}

	if (isContextLeader(activeContext, auth?.idTag)) return children

	const urlSegment = contextIdTag ?? activeUrlSegment ?? HOME_CONTEXT
	return <Navigate to={`/app/${urlSegment}/feed`} replace />
}

// Every app route exists twice: once context-aware (`/app/:contextIdTag/…`) and
// once legacy (`/app/…`, which keeps whatever context is active). The two lists
// must stay in lockstep, so they are generated from one table.
const APP_ROUTES: Array<{ path: string; element: React.ReactElement }> = [
	{ path: 'files', element: <FilesApp /> },
	{ path: 'feed', element: <FeedApp /> },
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

export function AppRoutes() {
	useContextFromRoute()

	return (
		<Routes>
			<Route path="/" element={<PlaceHolder title="Home" />} />
			{APP_ROUTES.map((r) => (
				<Route key={r.path} path={`/app/:contextIdTag/${r.path}`} element={r.element} />
			))}
			{APP_ROUTES.map((r) => (
				<Route key={`legacy-${r.path}`} path={`/app/${r.path}`} element={r.element} />
			))}
			<Route path="/*" element={null} />
		</Routes>
	)
}

// vim: ts=4

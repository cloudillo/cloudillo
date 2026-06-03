// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { apiAtom, useAuth } from '@cloudillo/react'
import { useAtom, useSetAtom } from 'jotai'
import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { activeContextAtom, contextSwitchingAtom } from './atoms'
import { CONTEXT_ROUTE_REGEX, HOME_CONTEXT } from './constants.js'
import { useApiContext } from './hooks'

export function useContextFromRoute(): string | undefined {
	// `useContextFromRoute` is called from `AppRoutes` outside any matched
	// `<Route>`, so `useParams` would return `{}`. Match the URL directly
	// against the shared CONTEXT_ROUTE_REGEX so we also pick up sibling
	// prefixes (`/idp/...`, `/settings/...`, …) that the sidebar emits.
	// Only treat the segment as a contextIdTag when it looks like one (`~`
	// or a dotted domain) — otherwise `/app/feed` or `/settings/security`
	// would be misread as a context.
	const location = useLocation()
	const match = location.pathname.match(CONTEXT_ROUTE_REGEX)
	const matched = match?.[2]
	const rawContextIdTag =
		matched && (matched === HOME_CONTEXT || matched.includes('.')) ? matched : undefined
	const [activeContext] = useAtom(activeContextAtom)
	const { setActiveContext, isLoading } = useApiContext()
	const setIsSwitching = useSetAtom(contextSwitchingAtom)
	const [auth] = useAuth()
	const [apiState] = useAtom(apiAtom)
	const navigate = useNavigate()
	const [isInitialized, setIsInitialized] = React.useState(false)

	// Resolve ~ to instance owner
	const contextIdTag = rawContextIdTag === HOME_CONTEXT ? apiState.idTag : rawContextIdTag

	React.useEffect(() => {
		// Skip context switching when not authenticated (loading or guest)
		if (!auth) return

		// If we have a contextIdTag in URL but it doesn't match active context
		if (contextIdTag && activeContext?.idTag !== contextIdTag) {
			// Switch to the context from URL. This is the sole writer to
			// activeContextAtom for user-initiated switches — switchTo only
			// navigates, so the URL is the single source of truth.
			setActiveContext(contextIdTag)
				.catch((err) => {
					console.error(`[Route] Failed to switch to context ${contextIdTag}:`, err)

					// If we can't switch, redirect to user's own context
					if (auth?.idTag) {
						console.warn(`[Route] Redirecting to user context: ${auth.idTag}`)
						navigate(`/app/${HOME_CONTEXT}/feed`, { replace: true })
					} else {
						navigate('/login', { replace: true })
					}
				})
				.finally(() => setIsSwitching(false))
		} else if (contextIdTag && activeContext?.idTag === contextIdTag) {
			// URL already matches active context — switchTo only navigated; clear the spinner.
			setIsSwitching(false)
		}
	}, [contextIdTag, activeContext?.idTag, setActiveContext, auth, navigate, setIsSwitching])

	// Initialize active context if none is set, we have auth, and the URL has no context segment
	React.useEffect(() => {
		if (!isInitialized && auth?.idTag && !activeContext && !isLoading && !contextIdTag) {
			setActiveContext(auth.idTag)
				.then(() => {
					setIsInitialized(true)
				})
				.catch((err) => {
					console.error('[Route] Failed to initialize active context:', err)
				})
		}
	}, [auth, activeContext, isLoading, isInitialized, setActiveContext, contextIdTag])

	return contextIdTag
}

/**
 * Returns the real idTag for the current context (for API calls and cache keys).
 */
export function useCurrentContextIdTag(): string | undefined {
	const [activeContext] = useAtom(activeContextAtom)
	const [auth] = useAuth()
	const [apiState] = useAtom(apiAtom)

	return activeContext?.idTag || auth?.idTag || apiState.idTag
}

/**
 * Returns ~ when the current context is the home instance, otherwise the real idTag.
 * Use this for building URLs — never for API calls.
 */
export function useUrlContextIdTag(): string | undefined {
	const contextIdTag = useCurrentContextIdTag()
	const [apiState] = useAtom(apiAtom)

	if (!contextIdTag) return undefined
	return contextIdTag === apiState.idTag ? HOME_CONTEXT : contextIdTag
}

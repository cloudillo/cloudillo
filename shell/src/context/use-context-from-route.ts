// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import { useAtom } from 'jotai'
import { useAuth, apiAtom } from '@cloudillo/react'

import { activeContextAtom } from './atoms'
import { useApiContext } from './hooks'
import { ContextTrustGateBusyError, ContextTrustGateRejectedError } from './trust-gate'
import { HOME_CONTEXT } from './constants.js'

export function useContextFromRoute(): string | undefined {
	// `useContextFromRoute` is called from `AppRoutes` outside any matched
	// `<Route>`, so `useParams` would return `{}`. Use `useMatch` to parse the
	// URL directly, independent of route nesting. Only treat the segment as a
	// contextIdTag when it looks like one (`~` or a dotted domain) — otherwise
	// `/app/feed` or `/app/quillo/...` would be misread as a context.
	const match = useMatch('/app/:contextIdTag/*')
	const matched = match?.params.contextIdTag
	const rawContextIdTag =
		matched && (matched === HOME_CONTEXT || matched.includes('.')) ? matched : undefined
	const [activeContext] = useAtom(activeContextAtom)
	const { setActiveContext, isLoading } = useApiContext()
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
			// Switch to the context from URL
			setActiveContext(contextIdTag).catch((err) => {
				// Another gate is already on screen for an earlier click —
				// the user hasn't decided anything yet, so don't navigate
				// away from under them. Doing nothing leaves the existing
				// dialog and route in place.
				if (err instanceof ContextTrustGateBusyError) return
				// User declined the trust gate — silently fall back to their
				// home context, same destination as the failure path.
				if (err instanceof ContextTrustGateRejectedError) {
					navigate(`/app/${HOME_CONTEXT}/feed`, { replace: true })
					return
				}
				console.error(`[Route] Failed to switch to context ${contextIdTag}:`, err)

				// If we can't switch, redirect to user's own context
				if (auth?.idTag) {
					console.warn(`[Route] Redirecting to user context: ${auth.idTag}`)
					navigate(`/app/${HOME_CONTEXT}/feed`, { replace: true })
				} else {
					navigate('/login', { replace: true })
				}
			})
		}
	}, [contextIdTag, activeContext?.idTag, setActiveContext, auth, navigate])

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

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAtom } from 'jotai'
import { useAuth, apiAtom } from '@cloudillo/react'

import { activeContextAtom } from './atoms'
import { useApiContext } from './hooks'
import { HOME_CONTEXT } from './constants.js'

export function useContextFromRoute(): string | undefined {
	const { contextIdTag: rawContextIdTag } = useParams<{ contextIdTag?: string }>()
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
			console.log(
				`[Route] Context mismatch: URL=${contextIdTag}, Active=${activeContext?.idTag}`
			)

			// Switch to the context from URL
			setActiveContext(contextIdTag).catch((err) => {
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

	// Initialize active context if none is set and we have auth
	React.useEffect(() => {
		if (!isInitialized && auth?.idTag && !activeContext && !isLoading) {
			console.log('[Route] Initializing active context to user context')
			setActiveContext(auth.idTag)
				.then(() => {
					setIsInitialized(true)
				})
				.catch((err) => {
					console.error('[Route] Failed to initialize active context:', err)
				})
		}
	}, [auth, activeContext, isLoading, isInitialized, setActiveContext])

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

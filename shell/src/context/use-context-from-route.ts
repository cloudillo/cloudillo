/**
 * Context Route Synchronization Hook
 *
 * Syncs the URL contextIdTag parameter with the active context state.
 * This ensures the active context always matches the URL.
 */

import * as React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAtom } from 'jotai'
import { useAuth } from '@cloudillo/react'

import { activeContextAtom } from './atoms'
import { useApiContext } from './hooks'

/**
 * Hook to extract and sync context from route
 *
 * Reads :contextIdTag from URL params and ensures active context is set.
 * If context doesn't match, switches to the context from URL.
 *
 * @returns contextIdTag from URL or undefined if not in a context route
 */
export function useContextFromRoute(): string | undefined {
	const { contextIdTag } = useParams<{ contextIdTag?: string }>()
	const [activeContext] = useAtom(activeContextAtom)
	const { setActiveContext, isLoading } = useApiContext()
	const [auth] = useAuth()
	const navigate = useNavigate()
	const [isInitialized, setIsInitialized] = React.useState(false)

	React.useEffect(() => {
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
					navigate(`/app/${auth.idTag}/feed`, { replace: true })
				} else {
					navigate('/login', { replace: true })
				}
			})
		}
	}, [contextIdTag, activeContext?.idTag, setActiveContext, auth, navigate])

	// Initialize active context if none is set and we have auth
	React.useEffect(() => {
		if (!isInitialized && auth && !activeContext && !isLoading) {
			console.log('[Route] Initializing active context to user context')
			setActiveContext(auth.idTag!)
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
 * Hook to get the current context ID for navigation
 *
 * Returns the active context's idTag, or user's idTag as fallback.
 * Use this when building navigation links.
 *
 * @returns contextIdTag for use in navigation
 */
export function useCurrentContextIdTag(): string | undefined {
	const [activeContext] = useAtom(activeContextAtom)
	const [auth] = useAuth()

	return activeContext?.idTag || auth?.idTag
}

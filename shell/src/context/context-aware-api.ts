/**
 * Context-Aware API Hook
 *
 * This file provides a wrapper around useApi() that makes it context-aware.
 * When active context is set, the API client automatically points to that context.
 *
 * This enables backward compatibility while supporting multi-context operations:
 * - Existing components using useApi() will automatically use active context
 * - No code changes needed in most components
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { createApiClient, ApiClient } from '@cloudillo/base'
import { useAuth, type ApiHook } from '@cloudillo/react'

import { activeContextAtom, contextTokensAtom } from './atoms'

/**
 * Context-aware useApi() hook
 *
 * This hook replaces the standard useApi() for components that need
 * multi-context support. It automatically uses the active context
 * instead of the user's own idTag.
 *
 * @example
 * ```typescript
 * // In a component:
 * const { api } = useApi()
 *
 * // If activeContext is set to 'alice.community',
 * // api.files.list() will fetch alice.community's files
 * ```
 */
export function useContextAwareApi(): ApiHook {
  const [auth] = useAuth()
  const [activeContext] = useAtom(activeContextAtom)
  const [contextTokens] = useAtom(contextTokensAtom)

  // Cache API clients
  const apiClientsRef = React.useRef<Map<string, ApiClient>>(new Map())

  const api = React.useMemo(() => {
    // Determine which idTag and token to use
    let idTag: string | undefined
    let token: string | undefined

    if (activeContext) {
      // Use active context
      idTag = activeContext.idTag

      if (idTag === auth?.idTag) {
        // Active context is user's own - use auth token
        token = auth.token
      } else {
        // Active context is a community - use proxy token
        const tokenData = contextTokens.get(idTag)
        if (!tokenData || tokenData.expiresAt <= new Date()) {
          console.warn(`No valid token for active context: ${idTag}`)
          return null
        }
        token = tokenData.token
      }
    } else {
      // No active context - use user's own idTag
      idTag = auth?.idTag
      token = auth?.token
    }

    if (!idTag) return null

    // Create cache key
    const cacheKey = `${idTag}:${token || 'no-token'}`

    // Return cached client if exists
    if (apiClientsRef.current.has(cacheKey)) {
      return apiClientsRef.current.get(cacheKey)!
    }

    // Create new client
    const client = createApiClient({
      idTag,
      authToken: token,
    })

    // Cache it
    apiClientsRef.current.set(cacheKey, client)

    // Clean up old clients (keep last 10)
    if (apiClientsRef.current.size > 10) {
      const keys = Array.from(apiClientsRef.current.keys())
      const oldKey = keys[0]
      apiClientsRef.current.delete(oldKey)
    }

    return client
  }, [activeContext, auth, contextTokens])

  return {
    api,
    setIdTag: () => {
      console.warn('setIdTag() is not supported with context-aware API. Use setActiveContext() instead.')
    }
  }
}

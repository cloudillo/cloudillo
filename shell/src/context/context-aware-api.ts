// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Context-Aware API Hook
 *
 * `useApi()` pointed at the active context instead of the user's own idTag —
 * idTag resolution is the only thing this adds, the rest is `useApi(idTag)`.
 */

import { type ApiHook, apiAtom, useApi, useAuth } from '@cloudillo/react'
import { useAtom, useAtomValue, useStore } from 'jotai'

import { activeContextAtom, contextRolesAtom } from './atoms'
import { useCtx } from './ctx.js'
import { activeKeyFor } from './trust-gate'

/**
 * @example
 * ```typescript
 * // In a component:
 * const { api } = useContextAwareApi()
 *
 * // If activeContext is set to 'alice.community',
 * // api.files.list() will fetch alice.community's files
 * ```
 *
 * For idTags where the user has established trust ('always' stored or 'S'
 * session), `useContextTokenRenewal` refreshes the registry entry before it
 * expires, so authenticated reads keep working across long sessions. For
 * untrusted foreign profiles no token was ever registered and we correctly go
 * anonymous — explicit actions must route through
 * `getTokenFor(idTag, { explicit: true })`.
 *
 * A community URL with no active context yet (reload mid-`enter()`, or parked
 * behind the consent banner) yields no client, never the home one.
 */
export function useContextAwareApi(): ApiHook {
	const [auth] = useAuth()
	const [apiState] = useAtom(apiAtom)
	const [activeContext] = useAtom(activeContextAtom)
	const store = useStore()
	// Subscribed for the re-render, not the value: the token lives in the registry.
	useAtomValue(contextRolesAtom)
	const ctx = useCtx()

	// `auth === undefined` is "still booting" — no client at all, rather than
	// falling through to the guest/home idTag and issuing requests we'd redo.
	const idTag = activeContext
		? activeKeyFor(store, activeContext.idTag)
		: auth === undefined || !ctx.isHome
			? null
			: (auth?.idTag ?? apiState.idTag ?? null)

	return useApi(idTag)
}

// vim: ts=4

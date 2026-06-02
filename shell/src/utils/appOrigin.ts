// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import type { ApiClient } from '@cloudillo/core'

// Resolved app origins keyed by idTag (app domain rarely changes within a session).
const shareOriginCache = new Map<string, string>()

/**
 * Resolve the web/app origin (e.g. `https://cloud.alice.com`) for the tenant that
 * `api` targets, identified by `idTag`. The app domain can differ from the idTag
 * (custom domains), so it is fetched from the tenant's `GET /api/me/app-domain`.
 * Returns `undefined` until resolved; callers fall back to `window.location.origin`
 * (correct for the home tenant and a safe transient default for foreign tenants).
 */
export function useShareOrigin(
	api: ApiClient | null | undefined,
	idTag: string | undefined
): string | undefined {
	const [origin, setOrigin] = React.useState<string | undefined>(() =>
		idTag ? shareOriginCache.get(idTag) : undefined
	)

	React.useEffect(() => {
		if (!api || !idTag) {
			setOrigin(undefined)
			return
		}
		const cached = shareOriginCache.get(idTag)
		if (cached) {
			setOrigin(cached)
			return
		}
		let cancelled = false
		api.profiles
			.getAppDomain()
			.then(({ appDomain }) => {
				const resolved = `https://${appDomain}`
				shareOriginCache.set(idTag, resolved)
				if (!cancelled) setOrigin(resolved)
			})
			.catch(() => {
				// Leave undefined → caller falls back to window.location.origin.
			})
		return () => {
			cancelled = true
		}
	}, [api, idTag])

	return origin
}

// vim: ts=4

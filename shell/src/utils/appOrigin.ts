// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient } from '@cloudillo/core'
import * as React from 'react'

/**
 * Resolved app origins keyed by idTag (an app domain rarely changes within a session).
 *
 * INVARIANT, and it is the caller's to keep: `idTag` must name the tenant `api` targets.
 * `getAppDomain()` answers for whatever node its client points at, so pairing the ambient client
 * with a foreign tenant's tag caches node B's domain under tenant C - and every later share link for
 * a C-owned file then resolves on B. `useFileOwnerScope` exposes `api` and `scopeIdTag` together for
 * exactly this reason; nothing here can check it at runtime.
 */
const shareOriginCache = new Map<string, string>()

/** How far the app-domain lookup for the scope tenant has got */
export type ShareOriginStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface ShareOriginState {
	/** The tenant's real app origin; undefined until `status === 'ready'` */
	origin: string | undefined
	status: ShareOriginStatus
	/** What to build a URL with: `origin` once ready, else window.location.origin */
	href: string
	/** True only when `href` really is this tenant's origin — the ONLY state in which a share URL
	 *  may be handed out. */
	trusted: boolean
}

/**
 * Resolve the web/app origin (e.g. `https://cloud.alice.com`) for the tenant `idTag`. The app domain
 * can differ from the idTag (custom domains), so it is fetched from that tenant's
 * `GET /api/me/app-domain`.
 *
 * `window.location.origin` is NOT a safe stand-in for a foreign tenant: `/s/:refId` resolves the ref
 * against the origin's own tenant, so a link built on our host 404s for the recipient. Callers must
 * therefore gate every copy/QR affordance on `trusted`, which is true only once the real origin has
 * landed — or immediately when the scope tenant is the signed-in user, where
 * `window.location.origin` IS the right origin by construction.
 *
 * @param idTag the tenant `api` targets - see the cache INVARIANT above.
 * @param homeIdTag the signed-in user's own idTag
 */
export function useShareOrigin(
	api: ApiClient | null | undefined,
	idTag: string | undefined,
	homeIdTag: string | undefined
): ShareOriginState {
	const [state, setState] = React.useState<{
		origin: string | undefined
		status: ShareOriginStatus
	}>(() => {
		const cached = idTag ? shareOriginCache.get(idTag) : undefined
		return cached ? { origin: cached, status: 'ready' } : { origin: undefined, status: 'idle' }
	})

	React.useEffect(() => {
		if (!api || !idTag) {
			setState({ origin: undefined, status: 'idle' })
			return
		}
		const cached = shareOriginCache.get(idTag)
		if (cached) {
			setState({ origin: cached, status: 'ready' })
			return
		}
		setState({ origin: undefined, status: 'loading' })
		let cancelled = false
		api.profiles
			.getAppDomain()
			.then(({ appDomain }) => {
				const resolved = `https://${appDomain}`
				shareOriginCache.set(idTag, resolved)
				if (!cancelled) setState({ origin: resolved, status: 'ready' })
			})
			.catch(() => {
				// Deliberately NOT cached: a transport failure must not pin this tenant to
				// "unresolvable" for the rest of the session, so a later mount can retry.
				if (!cancelled) setState({ origin: undefined, status: 'failed' })
			})
		return () => {
			cancelled = true
		}
	}, [api, idTag])

	return React.useMemo(() => {
		const isHome = !!idTag && idTag === homeIdTag
		return {
			origin: state.origin,
			status: state.status,
			href: state.origin ?? window.location.origin,
			trusted: state.status === 'ready' || isHome
		}
	}, [state, idTag, homeIdTag])
}

// vim: ts=4

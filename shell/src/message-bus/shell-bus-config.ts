// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The shell bus's configuration object, as a factory.
 *
 * Everything here reads live state through the refs the caller supplies rather
 * than closing over a render's values — the bus is initialised once on mount
 * and must see the current api/auth on every later callback.
 */

import { type ApiClient, createApiClient } from '@cloudillo/core'
import { jwtRemainingSeconds } from '@cloudillo/core/jwt'
import type { AuthState } from '@cloudillo/react'
import type { i18n as I18n } from 'i18next'
import type * as React from 'react'

import { getAccessSuffix, type ShellMessageBusConfig } from './index.js'

/**
 * Mint an app token for `resId` at `access`, propagating failures.
 *
 * The single implementation of "mint an app token for this resource". Both init
 * paths (`auth:init.res` via message-bus/handlers/auth.ts and `auth:init.push`
 * via apps/index.tsx) route here through the bus config below, so whichever wins
 * their race hands the app the same file-scoped token — the scope the backend's
 * ABAC on /ws/crdt and /ws/rtdb actually reads.
 *
 * Deliberately does NOT swallow errors: shell-internal callers have to tell a
 * 403 apart from a 503 (see apps/useAppToken.ts, which would otherwise report
 * every transient hiccup as an access conflict). The bus adapter below is what
 * collapses failures to `undefined` for the message-bus contract.
 */
export async function mintAppToken(
	api: ApiClient,
	authIdTag: string,
	resId: string,
	access: 'read' | 'comment' | 'write'
): Promise<{ token: string; tokenLifetime: number | undefined } | undefined> {
	// resId is `<ownerIdTag>:<fileId>`, or a bare fileId on our own node.
	const colon = resId.indexOf(':')
	const targetTag = colon > 0 ? resId.slice(0, colon) : authIdTag
	const fileId = colon > 0 ? resId.slice(colon + 1) : resId
	if (!fileId) return undefined
	const scope = `file:${fileId}:${getAccessSuffix(access)}`

	// A scoped token is only valid where it is minted, so a foreign file's token
	// must be requested from the owning node — proxy there first (same shape as
	// message-bus/handlers/embed.ts).
	let via = api
	if (targetTag !== authIdTag) {
		const proxy = await api.auth.getProxyToken(targetTag)
		if (!proxy?.token) return undefined
		via = createApiClient({ idTag: targetTag, authToken: proxy.token })
	}
	const res = await via.auth.getAccessToken({ scope })
	return res ? { token: res.token, tokenLifetime: jwtRemainingSeconds(res.token) } : undefined
}

export function createShellBusConfig({
	apiRef,
	authRef,
	i18n
}: {
	apiRef: React.RefObject<ApiClient | null>
	authRef: React.RefObject<AuthState | null | undefined>
	i18n: I18n
}): ShellMessageBusConfig {
	return {
		debug: false,
		// The bus contract is "a token or nothing" — apps get no error channel
		// here, so failures collapse to undefined. Callers that need to know why
		// call `mintAppToken` directly.
		getAccessToken: async (resId, access) => {
			const currentApi = apiRef.current
			const currentAuth = authRef.current
			if (!currentApi || !currentAuth?.idTag) return undefined
			if (!navigator.onLine) return undefined
			try {
				return await mintAppToken(currentApi, currentAuth.idTag, resId, access)
			} catch {
				return undefined
			}
		},
		refreshTokenByRef: async (refId) => {
			const currentApi = apiRef.current
			if (!currentApi) return undefined
			try {
				const res = await currentApi.auth.getAccessTokenByRef(refId, {
					refresh: true
				})
				return res ? { token: res.token } : undefined
			} catch {
				return undefined
			}
		},
		getAuthState: () => {
			const currentAuth = authRef.current
			if (!currentAuth) return null
			return {
				idTag: currentAuth.idTag,
				tnId: currentAuth.tnId,
				roles: currentAuth.roles
			}
		},
		getThemeState: () => ({
			darkMode: document.body.classList.contains('dark')
		}),
		getLanguage: () => i18n.language,
		getApi: () => apiRef.current ?? null
	}
}

// vim: ts=4

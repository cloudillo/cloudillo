// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { createApiClient, FetchError, setApiToken, setAuthErrorHandler } from '@cloudillo/core'
import { useApi, useAuth, useToast } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { APP_STORAGE_DB, deleteDatabase } from '../../shared/idb.js'
import { clearCache, resetKeyErrorState } from '../cache/index.js'
import { getDirtyDocIds } from '../message-bus/handlers/crdt.js'
import { closeAppStorage } from '../message-bus/handlers/storage.js'
import {
	cleanupEncryptionCookie,
	clearAuthToken,
	deleteApiKey,
	getApiKeyResult,
	installToken
} from '../pwa.js'
import { resetBootSettingsApplied } from './boot.js'
import { createRenewer, type Renewer } from './renewal-timer.js'
import { runRenewal } from './token-session.js'

/**
 * Hook for automatic token renewal.
 * Schedules token refresh before expiration.
 * Note: Microfrontends use resource-scoped tokens and are not updated here.
 */
export function useTokenRenewal() {
	const [auth, setAuth] = useAuth()
	const { api } = useApi()
	const navigate = useNavigate()
	const { t } = useTranslation()
	const { warning: toastWarning } = useToast()

	// Keep latest values in one ref so the register-once auth-error handler always
	// reads current state without re-registering on every render.
	const latest = React.useRef({ auth, api, setAuth, navigate, t, toastWarning })
	latest.current = { auth, api, setAuth, navigate, t, toastWarning }

	// Latched once the home session is judged dead. The in-flight renewal itself
	// lives in auth/token-session.ts rather than in a ref here, so code outside
	// React (apps/index.tsx's scoped-token retry) can join the very same renewal
	// instead of sleeping and hoping.
	const expiredRef = React.useRef(false)

	// Fetch a fresh login token from the live session and apply it everywhere.
	// Returns the new token, or undefined if the session yielded none.
	const applyLoginToken = React.useCallback((): Promise<string | undefined> => {
		return runRenewal('refresh', async () => {
			const result = await latest.current.api?.auth.getLoginToken()
			if (!result?.token) return undefined
			// Registry first, then `setAuth` — see `libs/core/src/api-registry.ts`.
			const idTag = result.idTag ?? latest.current.auth?.idTag
			if (idTag) setApiToken(idTag, result.token)
			latest.current.setAuth({ ...result })
			await installToken(result.token)
			return result.token
		})
	}, [])

	// Undefined on failure — the renewer re-arms its retry on that.
	const renewToken = React.useCallback(async (): Promise<string | undefined> => {
		try {
			return await applyLoginToken()
		} catch (err) {
			console.error('[TokenRenewal] Token renewal failed:', err)
			// Expired or invalid: the next API call's 401 drives the recovery.
			return undefined
		}
	}, [applyLoginToken])

	// One renewer for the home session. `declareDead` needs no separate stop
	// condition: it calls `setAuth(null)`, and the effect below cancels the renewer
	// on the resulting token change.
	const renewerRef = React.useRef<Renewer | undefined>(undefined)
	renewerRef.current ??= createRenewer(renewToken)
	const renewer = renewerRef.current

	// Latch the home session as dead: warn, clear auth, redirect to login.
	// Guarded by expiredRef so concurrent 401s produce a single toast/redirect.
	//
	// A dead session must take its local data with it, or the next visitor sees the
	// previous user's private content. Order matters — the teardown steps may write
	// to encrypted storage, so the key that could decrypt any leftovers goes last
	// (same reasoning as wipeLocalData()).
	//
	// The key is kept while locally-dirty CRDT docs exist: they hold edits that never
	// reached the server and are encrypted under it, so dropping it would destroy
	// them silently. They stay recoverable until the user signs back in, or logs out
	// explicitly (which prompts about them first).
	const declareDead = React.useCallback(async (): Promise<void> => {
		if (expiredRef.current) return
		expiredRef.current = true
		latest.current.toastWarning(latest.current.t('Session expired. Please sign in again.'))
		latest.current.setAuth(null)
		// Same as the explicit logout path: signing back in as the same idTag must
		// re-apply theme/menu/favourites rather than hit boot's warm branch.
		resetBootSettingsApplied()
		await clearAuthToken().catch(() => {})
		await clearCache().catch(() => {})
		// The apps' sandboxed storage is user data too, and nothing else removes it
		// here. Unconditional: declareDead is only reached with no stored API key,
		// or with one just revoked and deleted — never on a live remember-me device.
		closeAppStorage()
		if ((await deleteDatabase(APP_STORAGE_DB)) === 'blocked') {
			console.warn(
				'[TokenRenewal] Delete of app storage was blocked by another open connection'
			)
		}
		const dirty = await getDirtyDocIds()
		// The cookie and the module-level cached CryptoKey must go together: a
		// still-cached key makes initCryptoKey() short-circuit past the new cookie
		// after a re-login, and everything written next is encrypted under a key no
		// later boot can reconstruct.
		if (dirty.size === 0) {
			cleanupEncryptionCookie()
			resetKeyErrorState()
		}
		latest.current.navigate('/login')
	}, [])

	// Recovery path for a home-token 401. The bearer JWT is already expired, so
	// re-exchanging the stored API key for a fresh JWT — mirroring the boot flow
	// — is the only way to recover. No stored API key (no "remember me") or a
	// revoked key means the session is genuinely unrecoverable → declare dead.
	const handleHomeTokenExpired = React.useCallback((): Promise<string | undefined> => {
		if (expiredRef.current) return Promise.resolve(undefined)

		return runRenewal('recover', async (): Promise<string | undefined> => {
			const currentAuth = latest.current.auth
			// No usable auth context to even attempt recovery — transient, keep
			// the session and let a later 401 retry.
			if (!currentAuth?.idTag) return undefined
			const idTag = currentAuth.idTag

			const stored = await getApiKeyResult()
			// The worker couldn't answer (restarted, storage error). That says
			// nothing about whether a key exists — transient, keep the session.
			if (stored.status === 'error') {
				console.warn('[TokenRenewal] API key unreadable:', stored.error)
				return undefined
			}
			const apiKey = stored.apiKey
			// No "remember me" → no way to mint a fresh JWT → unrecoverable.
			if (!apiKey) {
				await declareDead()
				return undefined
			}

			// Fresh token-less client: never sends the dead bearer, and since it
			// has no authToken, ApiClient.handleAuthError short-circuits and never
			// re-enters recovery — so this run can't await itself (no deadlock).
			const tempApi = createApiClient({ idTag })
			try {
				const result = await tempApi.auth.getAccessTokenByApiKey(apiKey)
				const token = result?.token
				if (token) {
					// Registry before `setAuth`, as everywhere else. Redundant with
					// the write api-client makes when it retries the failed
					// request, but keeps the rule uniform across all paths.
					setApiToken(idTag, token)
					// Identity fields (idTag/name/profilePic/roles/tnId) are
					// unchanged across a renewal — patch only the token.
					latest.current.setAuth((a) => (a ? { ...a, token } : a))
					await installToken(token)
					return token // api-client retries the failed request
				}
				// 200 without a token: treat as transient, keep the session.
				return undefined
			} catch (err) {
				// The API key itself is rejected (revoked/stale) → unrecoverable.
				if (err instanceof FetchError && err.httpStatus === 401) {
					await deleteApiKey().catch(() => {})
					await declareDead()
					return undefined
				}
				// Network / 5xx — transient. Keep the session; the original
				// request fails and a later 401 can retry recovery.
				return undefined
			}
		})
	}, [declareDead])

	// Register the process-wide auth-error handler once. The handler filters to
	// the home/personal token: foreign contexts refresh independently and guests
	// have no token, so both are ignored.
	React.useEffect(() => {
		setAuthErrorHandler((info) => {
			const currentAuth = latest.current.auth
			if (!currentAuth?.token || info.idTag !== currentAuth.idTag) return undefined
			return handleHomeTokenExpired().then((token) => ({
				token,
				handled: token === undefined && expiredRef.current
			}))
		})
		return () => setAuthErrorHandler(undefined)
	}, [handleHomeTokenExpired])

	// Effect: schedule renewal when auth token changes
	React.useEffect(
		function onAuthChange() {
			if (auth?.token) {
				// A fresh authenticated token arrived — re-arm expiry handling so a
				// future expiry is acted on again (e.g. after a successful login).
				expiredRef.current = false
				renewer.schedule(auth.token)
			}

			return () => renewer.cancel()
		},
		[auth?.token, renewer]
	)
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { createApiClient, FetchError, setAuthErrorHandler } from '@cloudillo/core'
import { useApi, useAuth, useToast } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { clearAuthToken, deleteApiKey, getApiKey, installToken } from '../pwa.js'

const RENEWAL_THRESHOLD = 0.8 // Renew at 80% of token lifetime

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
	const renewalTimerRef = React.useRef<number | undefined>(undefined)

	// Keep latest values in one ref so the register-once auth-error handler always
	// reads current state without re-registering on every render.
	const latest = React.useRef({ auth, api, setAuth, navigate, t, toastWarning })
	latest.current = { auth, api, setAuth, navigate, t, toastWarning }

	// recoveryPromiseRef: shared in-flight recovery so concurrent 401s await one
	// renewal and all receive the same result. expiredRef: latched once the home
	// session is judged dead.
	const recoveryPromiseRef = React.useRef<Promise<string | undefined> | null>(null)
	const expiredRef = React.useRef(false)

	// Shared in-flight login-token fetch so the proactive renewal timer and 401
	// recovery never run two concurrent getLoginToken() calls that race on setAuth.
	const inFlightTokenRef = React.useRef<Promise<string | undefined> | null>(null)

	// Parse JWT to get expiration + issue timestamps (without verifying signature).
	// Both are in milliseconds; iat is null when the token omits the claim.
	const getTokenTimes = React.useCallback(
		(token: string): { exp: number; iat: number | null } | null => {
			try {
				const [, payload] = token.split('.')
				if (!payload) return null
				const decoded = JSON.parse(atob(payload))
				if (!decoded.exp) return null
				return {
					exp: decoded.exp * 1000,
					iat: decoded.iat ? decoded.iat * 1000 : null
				}
			} catch {
				return null
			}
		},
		[]
	)

	// Fetch a fresh login token from the live session and apply it everywhere.
	// Returns the new token, or undefined if the session yielded none.
	const applyLoginToken = React.useCallback(async (): Promise<string | undefined> => {
		if (inFlightTokenRef.current) return inFlightTokenRef.current
		const run = (async (): Promise<string | undefined> => {
			const result = await latest.current.api?.auth.getLoginToken()
			if (!result?.token) return undefined
			latest.current.setAuth({ ...result })
			await installToken(result.token)
			return result.token
		})()
		inFlightTokenRef.current = run
		try {
			return await run
		} finally {
			inFlightTokenRef.current = null
		}
	}, [])

	// Perform token renewal
	const renewToken = React.useCallback(async () => {
		try {
			await applyLoginToken()
		} catch (err) {
			console.error('[TokenRenewal] Token renewal failed:', err)
			// Token expired or invalid - user will be redirected to login on next API call
		}
	}, [applyLoginToken])

	// Schedule renewal at RENEWAL_THRESHOLD of *total* lifetime (not of
	// remaining time). When the hook mounts mid-session — e.g. after a page
	// reload — anchoring to iat keeps the renewal margin constant; anchoring
	// to remaining time would shrink the safety margin every reload.
	const scheduleRenewal = React.useCallback(
		(token: string) => {
			const times = getTokenTimes(token)
			if (!times) {
				console.warn('[TokenRenewal] Could not parse token expiry')
				return
			}

			const now = Date.now()
			const remaining = times.exp - now

			if (remaining <= 0) {
				console.warn('[TokenRenewal] Token already expired')
				return
			}

			let renewIn: number
			if (times.iat) {
				const totalLifetime = times.exp - times.iat
				renewIn = Math.max(0, times.iat + totalLifetime * RENEWAL_THRESHOLD - now)
			} else {
				// Fallback for tokens without iat: best-effort, fire at 80% of
				// remaining time so renewal still happens.
				renewIn = remaining * RENEWAL_THRESHOLD
			}

			// Clear any existing timer
			if (renewalTimerRef.current) {
				clearTimeout(renewalTimerRef.current)
			}

			renewalTimerRef.current = window.setTimeout(renewToken, renewIn)
		},
		[getTokenTimes, renewToken]
	)

	// Latch the home session as dead: warn, clear auth, redirect to login.
	// Guarded by expiredRef so concurrent 401s produce a single toast/redirect.
	const declareDead = React.useCallback(async (): Promise<void> => {
		if (expiredRef.current) return
		expiredRef.current = true
		latest.current.toastWarning(latest.current.t('Session expired. Please sign in again.'))
		latest.current.setAuth(null)
		await clearAuthToken().catch(() => {})
		latest.current.navigate('/login')
	}, [])

	// Recovery path for a home-token 401. The bearer JWT is already expired, so
	// re-exchanging the stored API key for a fresh JWT — mirroring the boot flow
	// — is the only way to recover. No stored API key (no "remember me") or a
	// revoked key means the session is genuinely unrecoverable → declare dead.
	const handleHomeTokenExpired = React.useCallback(async (): Promise<string | undefined> => {
		if (expiredRef.current) return undefined
		if (recoveryPromiseRef.current) return recoveryPromiseRef.current

		const run = (async (): Promise<string | undefined> => {
			const currentAuth = latest.current.auth
			// No usable auth context to even attempt recovery — transient, keep
			// the session and let a later 401 retry.
			if (!currentAuth?.idTag) return undefined
			const idTag = currentAuth.idTag

			const apiKey = await getApiKey()
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
		})()

		recoveryPromiseRef.current = run
		try {
			return await run
		} finally {
			recoveryPromiseRef.current = null
		}
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
				scheduleRenewal(auth.token)
			}

			return () => {
				if (renewalTimerRef.current) {
					clearTimeout(renewalTimerRef.current)
				}
			}
		},
		[auth?.token, scheduleRenewal]
	)

	return { renewToken }
}

// vim: ts=4

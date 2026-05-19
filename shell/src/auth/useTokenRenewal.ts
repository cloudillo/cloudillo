// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useAuth, type AuthState, useApi } from '@cloudillo/react'
import { installToken } from '../pwa.js'

const RENEWAL_THRESHOLD = 0.8 // Renew at 80% of token lifetime

/**
 * Hook for automatic token renewal.
 * Schedules token refresh before expiration.
 * Note: Microfrontends use resource-scoped tokens and are not updated here.
 */
export function useTokenRenewal() {
	const [auth, setAuth] = useAuth()
	const { api } = useApi()
	const renewalTimerRef = React.useRef<number | undefined>(undefined)

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

	// Perform token renewal
	const renewToken = React.useCallback(async () => {
		if (!api) return

		try {
			const result = await api.auth.getLoginToken()
			if (!result) return
			const newAuth: AuthState = { ...result }
			setAuth(newAuth)

			// Update SW with token
			// Token is stored in SW encrypted storage via installToken()
			if (result.token) {
				await installToken(result.token)
			}
		} catch (err) {
			console.error('[TokenRenewal] Token renewal failed:', err)
			// Token expired or invalid - user will be redirected to login on next API call
		}
	}, [api, setAuth])

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

	// Effect: schedule renewal when auth token changes
	React.useEffect(
		function onAuthChange() {
			if (auth?.token) {
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

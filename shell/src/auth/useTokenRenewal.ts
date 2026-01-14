// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { useAuth, AuthState, useApi } from '@cloudillo/react'
import { registerServiceWorker, ensureEncryptionKey } from '../pwa.js'

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

	// Parse JWT to get expiration timestamp (without verifying signature)
	const getTokenExpiry = React.useCallback((token: string): number | null => {
		try {
			const [, payload] = token.split('.')
			if (!payload) return null
			const decoded = JSON.parse(atob(payload))
			return decoded.exp ? decoded.exp * 1000 : null // convert to ms
		} catch {
			return null
		}
	}, [])

	// Perform token renewal
	const renewToken = React.useCallback(async () => {
		if (!api) return

		try {
			console.log('[TokenRenewal] Renewing token...')
			const result = await api.auth.getLoginToken()
			if (!result) {
				console.log('[TokenRenewal] No session, skipping renewal')
				return
			}
			const newAuth: AuthState = { ...result }
			setAuth(newAuth)
			console.log('[TokenRenewal] Token renewed successfully')

			// Update SW with token
			// Token is stored in SW encrypted storage via registerServiceWorker()
			if (result.token) {
				await registerServiceWorker(result.token)
				await ensureEncryptionKey()
			}
		} catch (err) {
			console.error('[TokenRenewal] Token renewal failed:', err)
			// Token expired or invalid - user will be redirected to login on next API call
		}
	}, [api, setAuth])

	// Schedule renewal at RENEWAL_THRESHOLD of remaining lifetime
	const scheduleRenewal = React.useCallback(
		(token: string) => {
			const expiry = getTokenExpiry(token)
			if (!expiry) {
				console.warn('[TokenRenewal] Could not parse token expiry')
				return
			}

			const now = Date.now()
			const remaining = expiry - now

			if (remaining <= 0) {
				console.warn('[TokenRenewal] Token already expired')
				return
			}

			const renewAt = remaining * RENEWAL_THRESHOLD

			// Clear any existing timer
			if (renewalTimerRef.current) {
				clearTimeout(renewalTimerRef.current)
			}

			renewalTimerRef.current = window.setTimeout(renewToken, renewAt)
			console.log(
				`[TokenRenewal] Scheduled renewal in ${Math.round(renewAt / 1000 / 60)} minutes`
			)
		},
		[getTokenExpiry, renewToken]
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

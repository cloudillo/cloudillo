// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Proactively renews cached proxy ("context") tokens for any idTag where the
 * user has already established consent:
 *
 *   - persistent trust = 'always' (stored "always authenticate"),
 *   - session trust    = 'S' (this-tab "allow"), or
 *   - the idTag is the currently active context (joined community or
 *     self-switched profile) — those are explicit user actions and the UI
 *     depends on them staying authenticated.
 *
 * Tokens whose effective trust is 'never'/'X' and that are not the active
 * context are left alone — the trust gate in `getTokenFor` already handles
 * them by staying anonymous.
 *
 * Call this hook once, high in the tree, alongside `useTokenRenewal` for the
 * primary auth token.
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { useApi, useAuth } from '@cloudillo/react'

import { activeContextAtom, contextTokensAtom, sessionTrustAtom, storedTrustAtom } from './atoms'
import { CONTEXT_TOKEN_LIFETIME_MS, type ContextToken } from './types'

// Refresh at 80 % of remaining lifetime, matching useTokenRenewal. A small
// random jitter (±5 %) avoids a thundering herd when several trusted tokens
// were issued close together.
const RENEWAL_THRESHOLD = 0.8
const JITTER = 0.05

export function useContextTokenRenewal() {
	const [contextTokens, setContextTokens] = useAtom(contextTokensAtom)
	const [sessionTrust] = useAtom(sessionTrustAtom)
	const [storedTrust] = useAtom(storedTrustAtom)
	const [activeContext] = useAtom(activeContextAtom)
	const { api: primaryApi } = useApi()
	const [auth] = useAuth()

	// Per-idTag timers so we can rewrite the schedule when trust flips or the
	// token itself is replaced. Outliving the effect would leak memory; the
	// cleanup below clears any entry not needed by the latest pass.
	//
	// We also remember the expiry the timer was scheduled against. When a token
	// is replaced out-of-band (e.g. an explicit action fetches a fresh token)
	// the expiry shifts and we re-schedule instead of firing early against
	// the previous horizon.
	const timersRef = React.useRef<Map<string, { handle: number; expiresAt: number }>>(new Map())

	const renewOne = React.useCallback(
		async (idTag: string) => {
			if (!primaryApi) return
			try {
				const result = await primaryApi.auth.getProxyToken(idTag)
				const expiresAt = new Date(Date.now() + CONTEXT_TOKEN_LIFETIME_MS)
				const tokenData: ContextToken = {
					token: result.token,
					tnId: 0,
					roles: result.roles || [],
					expiresAt
				}
				setContextTokens((prev) => {
					const next = new Map(prev)
					next.set(idTag, tokenData)
					return next
				})
			} catch (err) {
				console.error(`[ContextTokenRenewal] Failed to renew ${idTag}:`, err)
			}
		},
		[primaryApi, setContextTokens]
	)

	React.useEffect(() => {
		if (!primaryApi || !auth?.idTag) return

		const timers = timersRef.current
		const keep = new Set<string>()
		const activeIdTag = activeContext?.idTag

		for (const [idTag, token] of contextTokens.entries()) {
			if (idTag === auth.idTag) continue

			// Renew where consent is established OR where the idTag is the
			// active context. The active context was entered via an explicit
			// user action (switch/join), so keeping it authenticated is
			// required for the UI to work regardless of profile trust.
			const session = sessionTrust.get(idTag)
			const trustConsent =
				session === 'S' || (session !== 'X' && storedTrust.get(idTag) === 'always')
			const isActive = idTag === activeIdTag
			if (!trustConsent && !isActive) continue

			const now = Date.now()
			const expiresAt = token.expiresAt.getTime()
			const remaining = expiresAt - now
			if (remaining <= 0) {
				// Expired — refresh immediately and let the next effect pass
				// schedule the normal timer once the new token lands.
				const existing = timers.get(idTag)
				if (existing) {
					clearTimeout(existing.handle)
					timers.delete(idTag)
				}
				void renewOne(idTag)
				continue
			}

			keep.add(idTag)
			// Already scheduled against the current token? Leave it alone.
			// Otherwise the token was replaced and we must re-schedule against
			// the new expiry.
			const existing = timers.get(idTag)
			if (existing && existing.expiresAt === expiresAt) continue
			if (existing) clearTimeout(existing.handle)

			const jitter = 1 + (Math.random() * 2 - 1) * JITTER
			const renewAt = remaining * RENEWAL_THRESHOLD * jitter
			const handle = window.setTimeout(() => {
				timers.delete(idTag)
				void renewOne(idTag)
			}, renewAt)
			timers.set(idTag, { handle, expiresAt })
		}

		// Drop timers for idTags that no longer need renewal (trust revoked,
		// token evicted, etc.). Do NOT clear the full map here — that would
		// cancel timers on every re-run of this effect.
		for (const [idTag, entry] of timers.entries()) {
			if (!keep.has(idTag)) {
				clearTimeout(entry.handle)
				timers.delete(idTag)
			}
		}
	}, [
		contextTokens,
		sessionTrust,
		storedTrust,
		activeContext?.idTag,
		primaryApi,
		auth?.idTag,
		renewOne
	])

	// Unmount-only: clear every pending timer. Split from the main effect so
	// cancellation does not fire on each dependency change.
	React.useEffect(() => {
		const timers = timersRef.current
		return () => {
			for (const entry of timers.values()) {
				clearTimeout(entry.handle)
			}
			timers.clear()
		}
	}, [])
}

// vim: ts=4

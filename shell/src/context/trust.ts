// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Per-profile trust for proxy-token authentication on passive reads.
 *
 * Trust lives on two layers:
 *   - `sessionTrustAtom` — in-memory decisions for this tab: 'S' (allow) / 'X' (stay anonymous).
 *   - `storedTrustAtom`  — cached snapshot of the persisted `profiles.trust` column:
 *                           'always' / 'never'. Keys not present mean "ask".
 *
 * The session layer takes precedence over the stored layer. Together they feed:
 *   - the fetch gate in `getTokenFor` (decides whether a proxy token is attached);
 *   - the `TrustBanner` and `TrustChip` UI on the profile page;
 *   - the trust settings page.
 *
 * Explicit user actions (follow, message, comment, etc.) bypass the trust gate
 * via `getTokenFor(idTag, { explicit: true })` and do not modify the stored trust.
 */

import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { useApi, useAuth } from '@cloudillo/react'
import type { ProfileTrust } from '@cloudillo/types'

import { contextTokensAtom, sessionTrustAtom, storedTrustAtom, trustBootstrapAtom } from './atoms'

/**
 * Effective trust level for a foreign profile, merged from session + stored state.
 *
 *   'S'      — session-only allow (this tab)
 *   'X'      — session-only anonymous (this tab)
 *   'always' — persistent always-authenticate
 *   'never'  — persistent never-authenticate
 *   null     — ask (no decision yet)
 */
export type EffectiveTrust = 'S' | 'X' | ProfileTrust | null

export interface UseProfileTrust {
	/** Return the merged session + stored decision for a profile. */
	getEffectiveTrust: (idTag: string) => EffectiveTrust
	/** Quick answer to "will a passive read to this profile be authenticated?". */
	isAuthenticatedFor: (idTag: string) => boolean
	/** Record a session-scoped decision. */
	setSessionTrust: (idTag: string, level: 'S' | 'X') => void
	/**
	 * Persist a trust decision on the backend and update the local cache.
	 * Pass `null` to clear the stored preference (back to "ask").
	 * Rejects if called for the user's own idTag.
	 */
	setStoredTrust: (idTag: string, level: ProfileTrust | null) => Promise<void>
	/**
	 * Populate the local stored-trust cache from a profile response received
	 * elsewhere (profile page load, list, settings). Cheap synchronous update.
	 */
	rememberStoredTrust: (idTag: string, trust: ProfileTrust | null | undefined) => void
}

export function useProfileTrust(): UseProfileTrust {
	const [session, setSession] = useAtom(sessionTrustAtom)
	const [stored, setStored] = useAtom(storedTrustAtom)
	const [, setContextTokens] = useAtom(contextTokensAtom)
	const { api: primaryApi } = useApi()
	const [auth] = useAuth()

	const getEffectiveTrust = React.useCallback(
		(idTag: string): EffectiveTrust => {
			const s = session.get(idTag)
			if (s) return s
			return stored.get(idTag) ?? null
		},
		[session, stored]
	)

	const isAuthenticatedFor = React.useCallback(
		(idTag: string): boolean => {
			if (idTag === auth?.idTag) return true
			const s = session.get(idTag)
			if (s === 'S') return true
			if (s === 'X') return false
			return stored.get(idTag) === 'always'
		},
		[auth?.idTag, session, stored]
	)

	// Drop any cached proxy token for this idTag. Kept as a helper so every
	// trust change that removes positive consent goes through the same path —
	// otherwise a later passive read (or a stale cached API client) could keep
	// authenticating with a token the user just revoked.
	const evictCachedToken = React.useCallback(
		(idTag: string) => {
			setContextTokens((prev) => {
				if (!prev.has(idTag)) return prev
				const next = new Map(prev)
				next.delete(idTag)
				return next
			})
		},
		[setContextTokens]
	)

	const setSessionTrust = React.useCallback(
		(idTag: string, level: 'S' | 'X') => {
			setSession((prev) => {
				const next = new Map(prev)
				next.set(idTag, level)
				return next
			})
			// 'X' removes consent for this tab — drop any cached token so
			// getClientFor / downstream callers can't hand out an authenticated
			// client backed by the previous decision.
			if (level === 'X') evictCachedToken(idTag)
		},
		[setSession, evictCachedToken]
	)

	const setStoredTrust = React.useCallback(
		async (idTag: string, level: ProfileTrust | null) => {
			if (!primaryApi) throw new Error('Not authenticated')
			if (idTag === auth?.idTag) {
				throw new Error('Cannot set trust on your own profile')
			}
			await primaryApi.profiles.setTrust(idTag, level)
			setStored((prev) => {
				const next = new Map(prev)
				if (level === 'always' || level === 'never') {
					next.set(idTag, level)
				} else {
					next.delete(idTag)
				}
				return next
			})
			// A persisted decision supersedes any earlier "this session" or
			// "continue anonymously" override the user made in this tab; without
			// this clear, getEffectiveTrust would keep reading the stale session
			// value first and the chip would not reflect the new state.
			setSession((prev) => {
				if (!prev.has(idTag)) return prev
				const next = new Map(prev)
				next.delete(idTag)
				return next
			})
			// Evict any cached proxy token when trust is revoked or cleared so
			// subsequent passive reads go through the gate with fresh state.
			// 'always' keeps the cached token — that's the whole point.
			if (level !== 'always') evictCachedToken(idTag)
		},
		[primaryApi, auth?.idTag, setStored, setSession, evictCachedToken]
	)

	const rememberStoredTrust = React.useCallback(
		(idTag: string, trust: ProfileTrust | null | undefined) => {
			setStored((prev) => {
				const current = prev.get(idTag)
				if (trust === 'always' || trust === 'never') {
					if (current === trust) return prev
					const next = new Map(prev)
					next.set(idTag, trust)
					return next
				}
				if (current === undefined) return prev
				const next = new Map(prev)
				next.delete(idTag)
				return next
			})
		},
		[setStored]
	)

	return {
		getEffectiveTrust,
		isAuthenticatedFor,
		setSessionTrust,
		setStoredTrust,
		rememberStoredTrust
	}
}

/**
 * Seed `storedTrustAtom` once per session from the backend so passive reads
 * can answer "always / never / ask" synchronously on cold load — without
 * having to visit each profile page first.
 *
 * Call once, high in the tree, alongside `useTokenRenewal` /
 * `useContextTokenRenewal`. Re-runs only when the authenticated idTag
 * changes (login / logout / context switch that rebuilds auth).
 */
export function useProfileTrustBootstrap() {
	const { api } = useApi()
	const [auth] = useAuth()
	const { rememberStoredTrust } = useProfileTrust()
	const setBootstrap = useSetAtom(trustBootstrapAtom)
	const setStored = useSetAtom(storedTrustAtom)
	const setSession = useSetAtom(sessionTrustAtom)
	const setContextTokens = useSetAtom(contextTokensAtom)

	const prevIdTagRef = React.useRef<string | null | undefined>(undefined)

	React.useEffect(() => {
		const idTag = auth?.idTag ?? null
		const prev = prevIdTagRef.current
		prevIdTagRef.current = idTag
		// Only clear on real auth-idTag transitions (login → logout → re-login
		// as a different user). Without the gate, a non-auth-related effect
		// re-run could silently discard the user's in-session decisions.
		if (prev !== undefined && prev !== idTag) {
			setStored(new Map())
			setSession(new Map())
			setContextTokens(new Map())
		}
		setBootstrap({ idTag, ready: false })

		if (!api || !auth?.idTag) {
			// No auth → nothing to seed. Mark ready so callers blocking on
			// `awaitTrustBootstrap()` see a definite (empty) cache instead
			// of hanging. "Ready" means the cache is in a known state, not
			// that the cache has data.
			setBootstrap({ idTag, ready: true })
			return
		}
		let cancelled = false
		;(async () => {
			try {
				const list = await api.profiles.listTrust()
				if (cancelled) return
				for (const p of list) {
					rememberStoredTrust(p.idTag, p.trust ?? null)
				}
				setBootstrap({ idTag, ready: true })
			} catch (err) {
				console.error('[useProfileTrustBootstrap] failed to seed trust cache:', err)
				// Mark ready even on failure so the trust gate doesn't wait
				// forever; missing entries fall back to the "ask" path which
				// is the safe default.
				if (!cancelled) setBootstrap({ idTag, ready: true })
			}
		})()
		return () => {
			cancelled = true
		}
	}, [
		api,
		auth?.idTag,
		rememberStoredTrust,
		setBootstrap,
		setStored,
		setSession,
		setContextTokens
	])
}

// vim: ts=4

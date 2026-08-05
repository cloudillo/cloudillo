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
 * The rule itself lives in `trust-gate.ts` and is applied here through
 * `effectiveTrust`. Tokens whose effective trust is 'none' are left alone — the
 * trust gate in `getTokenFor` already handles them by staying anonymous.
 *
 * Call this hook once, high in the tree, alongside `useTokenRenewal` for the
 * primary auth token.
 */

import { getApiClient, setApiToken } from '@cloudillo/core'
import { getJwtTimes } from '@cloudillo/core/jwt'
import { useApi, useAuth } from '@cloudillo/react'
import { useAtom, useStore } from 'jotai'
import * as React from 'react'

import { createRenewer, type Renewer } from '../auth/renewal-timer.js'
import { activeContextAtom, contextRolesAtom, sessionTrustAtom, storedTrustAtom } from './atoms'
import { effectiveTrust } from './trust-gate.js'

// ±5% on the renewal point, against a thundering herd when several trusted tokens
// were issued close together. The point itself, the retry backoff and the
// already-expired path all live in `auth/renewal-timer.ts`.
const JITTER = 0.05

export function useContextTokenRenewal() {
	const [contextRoles, setContextRoles] = useAtom(contextRolesAtom)
	const [sessionTrust] = useAtom(sessionTrustAtom)
	const [storedTrust] = useAtom(storedTrustAtom)
	const [activeContext] = useAtom(activeContextAtom)
	const { api: primaryApi } = useApi()
	const [auth] = useAuth()
	const store = useStore()

	// One renewer per idTag, so the schedule can be rewritten when trust flips or the
	// token is replaced; the sweep below cancels any entry the latest pass no longer
	// needs. The stored expiry is what the renewer was armed against: a token
	// replaced out-of-band (an explicit action fetching a fresh one) shifts it, and
	// we re-schedule rather than fire against the previous horizon.
	const renewersRef = React.useRef<Map<string, { renewer: Renewer; expiresAt: number }>>(
		new Map()
	)

	// The fresh token, or undefined when the renewal failed — the renewer re-arms
	// its own retry on undefined.
	const renewOne = React.useCallback(
		async (idTag: string): Promise<string | undefined> => {
			if (!primaryApi) return undefined
			try {
				const result = await primaryApi.auth.getProxyToken(idTag)
				setApiToken(idTag, result.token)
				setContextRoles((prev) => {
					const roles = result.roles || []
					const cur = prev.get(idTag)
					// Same roles, same Map identity. A fresh identity re-runs the
					// effect below, and a token that effect still judges expired
					// would then loop straight back into another mint.
					if (cur && cur.length === roles.length && cur.every((r, i) => r === roles[i])) {
						return prev
					}
					const next = new Map(prev)
					next.set(idTag, roles)
					return next
				})
				return result.token
			} catch (err) {
				console.error(`[ContextTokenRenewal] Failed to renew ${idTag}:`, err)
				return undefined
			}
		},
		[primaryApi, setContextRoles]
	)

	React.useEffect(() => {
		if (!primaryApi || !auth?.idTag) return

		const renewers = renewersRef.current
		const keep = new Set<string>()

		for (const idTag of contextRoles.keys()) {
			if (idTag === auth.idTag) continue

			// `trust-gate.ts` is the single authority for this rule; duplicating it
			// would let the gate and the renewal loop drift apart. `effectiveTrust`
			// reads sessionTrust/storedTrust/activeContext through the store, so the
			// `useAtom` subscriptions above and the deps below are what re-run this
			// effect when trust flips.
			if (effectiveTrust(store, idTag) !== 'consent') continue

			// `getAuthToken` reaps at `exp`, so an absent token already means
			// expired — as does an unparseable or past-`exp` one.
			const token = getApiClient(idTag).getAuthToken()
			const times = token ? getJwtTimes(token) : null
			if (!token || !times || times.exp <= Date.now()) {
				// Expired. Keep (or create) the renewer and let `renewNow` mint a
				// replacement and arm the proactive timer from it — this effect
				// will not re-run on a successful same-roles mint, because
				// `renewOne` deliberately preserves the `contextRoles` identity.
				let entry = renewers.get(idTag)
				if (!entry) {
					entry = {
						renewer: createRenewer(() => renewOne(idTag), { jitter: JITTER }),
						expiresAt: 0
					}
					renewers.set(idTag, entry)
				} else {
					// Sentinel: a later pass that sees a healthy token re-schedules
					// rather than trusting the horizon this entry was armed against.
					entry.expiresAt = 0
				}
				keep.add(idTag)
				entry.renewer.renewNow()
				continue
			}

			keep.add(idTag)
			// A differing expiry means the token was replaced out-of-band.
			const existing = renewers.get(idTag)
			if (existing && existing.expiresAt === times.exp) continue

			if (existing) {
				existing.expiresAt = times.exp
				existing.renewer.schedule(token)
			} else {
				const renewer = createRenewer(() => renewOne(idTag), { jitter: JITTER })
				renewers.set(idTag, { renewer, expiresAt: times.exp })
				renewer.schedule(token)
			}
		}

		// Drop renewers for idTags that no longer need one (trust revoked, token
		// evicted). Do NOT clear the whole map — that would cancel every timer on
		// each re-run of this effect.
		for (const [idTag, entry] of renewers.entries()) {
			if (!keep.has(idTag)) {
				entry.renewer.cancel()
				renewers.delete(idTag)
			}
		}
	}, [
		contextRoles,
		sessionTrust,
		storedTrust,
		activeContext?.idTag,
		primaryApi,
		auth?.idTag,
		renewOne,
		store
	])

	// Unmount-only: cancel every pending renewer. Split from the main effect so
	// cancellation does not fire on each dependency change.
	React.useEffect(() => {
		const renewers = renewersRef.current
		return () => {
			for (const entry of renewers.values()) {
				entry.renewer.cancel()
			}
			renewers.clear()
		}
	}, [])
}

// vim: ts=4

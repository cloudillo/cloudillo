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
 * Hatted keys (`contextKey(B, A)`) are renewed only while `(B, A)` is the active
 * context, and always by re-running the hatted handshake (`proxy-token?idTag=B&hat=A`)
 * — the backend refuses a param-less refresh of a hatted token. A 403/404 on that
 * handshake means the hat was revoked: `onHatRevoked` drops the key (which stops
 * its renewer) and falls back to B's next remembered hat, or bare. Never retried.
 *
 * Call this hook once, high in the tree, alongside `useTokenRenewal` for the
 * primary auth token.
 */

import { contextKey, getApiClient, setApiToken, splitContextKey } from '@cloudillo/core'
import { getJwtTimes } from '@cloudillo/core/jwt'
import { useApi, useAuth, useToast } from '@cloudillo/react'
import { useAtom, useSetAtom, useStore } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { createRenewer, type Renewer } from '../auth/renewal-timer.js'
import { installHatToken } from '../pwa.js'
import { onSwMessage } from '../pwa/sw-rpc.js'
import {
	activeContextAtom,
	contextHatRoleAtom,
	contextRolesAtom,
	sessionTrustAtom,
	storedTrustAtom
} from './atoms'
import { useHatEntry } from './hat-entry.js'
import { hatRefusedText, isRefusal, registerHattedRecovery } from './hat-recovery.js'
import { effectiveTrust, hattedConsent, withoutKey } from './trust-gate.js'

// ±5% on the renewal point, against a thundering herd when several trusted tokens
// were issued close together. The point itself, the retry backoff and the
// already-expired path all live in `auth/renewal-timer.ts`.
const JITTER = 0.05

export function useContextTokenRenewal() {
	const [contextRoles, setContextRoles] = useAtom(contextRolesAtom)
	const setContextHatRole = useSetAtom(contextHatRoleAtom)
	const [sessionTrust] = useAtom(sessionTrustAtom)
	const [storedTrust] = useAtom(storedTrustAtom)
	const [activeContext] = useAtom(activeContextAtom)
	const { api: primaryApi } = useApi()
	const [auth] = useAuth()
	const store = useStore()
	const { fallback } = useHatEntry()
	const { error: toastError } = useToast()
	const { t } = useTranslation()

	// One renewer per context key, so the schedule can be rewritten when trust flips or the
	// token is replaced; the sweep below cancels any entry the latest pass no longer
	// needs. The stored expiry is what the renewer was armed against: a token
	// replaced out-of-band (an explicit action fetching a fresh one) shifts it, and
	// we re-schedule rather than fire against the previous horizon.
	const renewersRef = React.useRef<Map<string, { renewer: Renewer; expiresAt: number }>>(
		new Map()
	)
	// Handshakes in flight, so a 401 recovery and a renewer firing together share one.
	const inFlightRef = React.useRef(new Map<string, Promise<string | undefined>>())

	/**
	 * The hat A is no longer accepted in B (403/404 on the hatted handshake): drop
	 * the key — the sweep then cancels its renewer — tell the user, and, if `(B, A)`
	 * was the active context, forget A in B's remembered hats and fall back to the
	 * next one (or bare).
	 */
	const onHatRevoked = React.useCallback(
		(idTag: string, hat: string) => {
			const key = contextKey(idTag, hat)
			setApiToken(key, undefined)
			setContextRoles((prev) => withoutKey(prev, key))
			setContextHatRole((prev) => withoutKey(prev, key))

			const active = store.get(activeContextAtom)
			const isActive = active?.idTag === idTag && active.hat?.idTag === hat
			// Only the worn hat's token is in the worker; a stale hat must not clear it.
			if (isActive) installHatToken(idTag, undefined)
			toastError(
				hatRefusedText(
					t,
					(isActive && active.hat?.name) || hat,
					(isActive && active.name) || idTag
				)
			)
			if (isActive) {
				fallback(idTag, hat).catch((err) => {
					console.error(`[ContextTokenRenewal] Fallback from ${key} failed:`, err)
				})
			}
		},
		[store, setContextRoles, setContextHatRole, fallback, toastError, t]
	)

	// The fresh token, or undefined when the renewal failed — the renewer re-arms
	// its own retry on undefined (a revoked hat's renewer is cancelled by the sweep).
	const renewOne = React.useCallback(
		(key: string): Promise<string | undefined> => {
			if (!primaryApi) return Promise.resolve(undefined)
			const inFlight = inFlightRef.current.get(key)
			if (inFlight) return inFlight

			const { idTag, hat } = splitContextKey(key)
			const pending = (async () => {
				try {
					const result = await primaryApi.auth.getProxyToken(
						idTag,
						hat ? { hat } : undefined
					)
					setApiToken(key, result.token)
					// The worker re-signs token-less requests (images, downloads) with
					// whatever it holds for `idTag`: keep it on the worn hat's token.
					if (hat && hattedConsent(store, idTag, hat)) {
						installHatToken(idTag, result.token, hat)
					}
					if (hat) {
						const role = result.role ?? ''
						setContextHatRole((prev) =>
							prev.get(key) === role ? prev : new Map(prev).set(key, role)
						)
					}
					setContextRoles((prev) => {
						const roles = result.roles || []
						const cur = prev.get(key)
						// Same roles, same Map identity. A fresh identity re-runs the
						// effect below, and a token that effect still judges expired
						// would then loop straight back into another mint.
						if (
							cur &&
							cur.length === roles.length &&
							cur.every((r, i) => r === roles[i])
						) {
							return prev
						}
						const next = new Map(prev)
						next.set(key, roles)
						return next
					})
					return result.token
				} catch (err) {
					if (hat && isRefusal(err)) {
						onHatRevoked(idTag, hat)
						return undefined
					}
					console.error(`[ContextTokenRenewal] Failed to renew ${key}:`, err)
					return undefined
				} finally {
					inFlightRef.current.delete(key)
				}
			})()
			inFlightRef.current.set(key, pending)
			return pending
		},
		[primaryApi, setContextRoles, setContextHatRole, onHatRevoked, store]
	)

	// Mirror the active context's hatted token into the worker, and take it back when
	// the hat comes off or the context changes. `setActiveContext` has already minted
	// it by the time the atom changes; an expired one arrives via `renewOne` instead.
	const pushedHatRef = React.useRef<string | undefined>(undefined)
	const activeIdTag = activeContext?.idTag
	const activeHat = activeContext?.hat?.idTag
	React.useEffect(() => {
		if (pushedHatRef.current) installHatToken(pushedHatRef.current, undefined)
		pushedHatRef.current = undefined
		if (!activeIdTag || !activeHat) return
		pushedHatRef.current = activeIdTag
		const token = getApiClient(contextKey(activeIdTag, activeHat)).getAuthToken()
		if (token) installHatToken(activeIdTag, token, activeHat)
	}, [activeIdTag, activeHat])

	React.useEffect(() => registerHattedRecovery(renewOne), [renewOne])

	// The worker's hat token for this tab ran out: renew the worn hat (`renewOne` re-pushes
	// it), else answer with a clear so the worker stops waiting. The worker asks only the tab
	// that pushed the hat and keys hats by tab, so the clear touches this tab's entry only.
	React.useEffect(
		() =>
			onSwMessage('sw:hattoken.request', (msg) => {
				if (msg.type !== 'sw:hattoken.request') return
				const { idTag } = msg.payload
				const active = store.get(activeContextAtom)
				if (active?.idTag === idTag && active.hat) {
					void renewOne(contextKey(idTag, active.hat.idTag))
				} else {
					installHatToken(idTag, undefined)
				}
			}),
		[store, renewOne]
	)

	React.useEffect(() => {
		if (!primaryApi || !auth?.idTag) return

		const renewers = renewersRef.current
		const keep = new Set<string>()

		for (const key of contextRoles.keys()) {
			const { idTag, hat } = splitContextKey(key)
			if (!hat && idTag === auth.idTag) continue

			// `trust-gate.ts` is the single authority for both rules; duplicating it
			// would let the gate and the renewal loop drift apart. `effectiveTrust`
			// reads sessionTrust/storedTrust/activeContext through the store, so the
			// `useAtom` subscriptions above and the deps below are what re-run this
			// effect when trust flips. A hatted key is kept alive only while active.
			const consent = hat
				? hattedConsent(store, idTag, hat)
				: effectiveTrust(store, idTag) === 'consent'
			if (!consent) continue

			// `getAuthToken` reaps at `exp`, so an absent token already means
			// expired — as does an unparseable or past-`exp` one.
			const token = getApiClient(key).getAuthToken()
			const times = token ? getJwtTimes(token) : null
			if (!token || !times || times.exp <= Date.now()) {
				// Expired. Keep (or create) the renewer and let `renewNow` mint a
				// replacement and arm the proactive timer from it — this effect
				// will not re-run on a successful same-roles mint, because
				// `renewOne` deliberately preserves the `contextRoles` identity.
				let entry = renewers.get(key)
				if (!entry) {
					entry = {
						renewer: createRenewer(() => renewOne(key), { jitter: JITTER }),
						expiresAt: 0
					}
					renewers.set(key, entry)
				} else {
					// Sentinel: a later pass that sees a healthy token re-schedules
					// rather than trusting the horizon this entry was armed against.
					entry.expiresAt = 0
				}
				keep.add(key)
				entry.renewer.renewNow()
				continue
			}

			keep.add(key)
			// A differing expiry means the token was replaced out-of-band.
			const existing = renewers.get(key)
			if (existing && existing.expiresAt === times.exp) continue

			if (existing) {
				existing.expiresAt = times.exp
				existing.renewer.schedule(token)
			} else {
				const renewer = createRenewer(() => renewOne(key), { jitter: JITTER })
				renewers.set(key, { renewer, expiresAt: times.exp })
				renewer.schedule(token)
			}
		}

		// Drop renewers for keys that no longer need one (trust revoked, hat
		// revoked or taken off, token evicted). Do NOT clear the whole map — that
		// would cancel every timer on each re-run of this effect.
		for (const [key, entry] of renewers.entries()) {
			if (!keep.has(key)) {
				entry.renewer.cancel()
				renewers.delete(key)
			}
		}
	}, [
		contextRoles,
		sessionTrust,
		storedTrust,
		activeContext?.idTag,
		activeContext?.hat?.idTag,
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

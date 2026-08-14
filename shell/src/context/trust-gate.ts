// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The passive-read trust gate, as plain functions over the jotai store.
 *
 * Both context helpers run through it — `getTokenFor` (may a proxy token be
 * *fetched*?) and `getClientFor` (may an already-cached one be *used*?). One
 * authority is the point: a token seeded by a single explicit action would
 * otherwise keep identifying the user on every later passive read to that node.
 *
 * A leaf module so the rules are unit-testable without mounting a hook.
 */

import { hasApiToken } from '@cloudillo/core'
import type { createStore } from 'jotai'

import { activeContextAtom, communitiesAtom, sessionTrustAtom, storedTrustAtom } from './atoms'

/** The jotai store instance, as `useStore()` / `createStore()` produce it. */
export type ContextStore = ReturnType<typeof createStore>

/**
 * Does the user's current state amount to a positive consent to identify
 * themselves to `idTag`?
 *
 * Consent is a session 'S' (this-tab allow), a stored 'always', or the idTag
 * being the active context — the last one was entered by an explicit switch or
 * join and every view inside it depends on staying authenticated, so it
 * outranks even a session 'X'.
 */
export function effectiveTrust(store: ContextStore, idTag: string): 'consent' | 'none' {
	if (store.get(activeContextAtom)?.idTag === idTag) return 'consent'
	const session = store.get(sessionTrustAtom).get(idTag)
	if (session === 'S') return 'consent'
	if (session !== 'X' && store.get(storedTrustAtom).get(idTag) === 'always') return 'consent'
	return 'none'
}

/**
 * May `getClientFor` hand out the registry's cached, identified client for
 * `idTag`? The user's own node is never gated; an explicit user action is its
 * own consent.
 */
export function mayUseContextToken(
	store: ContextStore,
	idTag: string,
	opts: { ownIdTag?: string; explicit?: boolean } = {}
): boolean {
	// The user's own node is never gated — and not on a registered token either:
	// the ServiceWorker injects the session bearer for own-tenant requests, so a
	// registry entry lapsing mid-renewal must not turn getClientFor into a null.
	if (idTag === opts.ownIdTag) return true
	const consented = opts.explicit === true || effectiveTrust(store, idTag) === 'consent'
	return consented && hasApiToken(idTag)
}

/**
 * May a context named by the *URL* be entered without asking? A link is not a user
 * action: `setActiveContext` mints an identified proxy token, so an unknown idTag
 * arriving in a pathname must be confirmed rather than trusted.
 *
 * Known means: the user's own node, a community they already have (`communitiesAtom`),
 * or an idTag they have already consented to (`effectiveTrust`).
 */
export function isKnownContext(store: ContextStore, idTag: string, ownIdTag?: string): boolean {
	if (idTag === ownIdTag) return true
	if (store.get(communitiesAtom).some((c) => c.idTag === idTag)) return true
	return effectiveTrust(store, idTag) === 'consent'
}

// vim: ts=4

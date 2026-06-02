// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Engagement data hooks for the reaction/repost info dialog.
 *
 * Reactions and reposts both reference their target action via the `subject`
 * field. We fetch them from the *audience tenant* (where the subject is
 * authoritatively hosted) — which may be a remote node — using the cross-tenant
 * context helpers (`getTokenFor` / `getClientFor`). `includeTokens` asks the
 * server for each action's raw signed JWS so the dialog can verify signatures.
 */

import type { ApiClient, ListActionsQuery } from '@cloudillo/core'
import { useApi, useAuth } from '@cloudillo/react'
import type { ActionView, Profile } from '@cloudillo/types'
import * as React from 'react'

import { useApiContext } from '../../context/index.js'
import { reactionTypes } from './reactions.js'

/**
 * Drain every page of an action-list query via cursor pagination. `list` only
 * returns the first page, so a popular post would silently truncate its
 * reactor/reposter list. We accumulate pages until `hasMore` is false, with a
 * safety cap (logged when hit — see the "no silent caps" guidance).
 */
async function listAll(client: ApiClient, query: ListActionsQuery): Promise<ActionView[]> {
	const acc: ActionView[] = []
	let cursor: string | null = null
	const CAP = 1000
	do {
		const { data, cursorPagination } = await client.actions.listPaginated({
			...query,
			cursor: cursor ?? undefined,
			limit: 100
		})
		acc.push(...data)
		cursor = cursorPagination?.hasMore ? cursorPagination.nextCursor : null
		if (acc.length >= CAP) {
			console.warn('useEngagement: engagement list capped at', CAP, query.type)
			break
		}
	} while (cursor)
	return acc
}

export interface ReactionGroup {
	/** Reaction key, e.g. 'LIKE'. */
	key: string
	actions: ActionView[]
}

export interface EngagementData {
	/** All active REACT actions for the subject. */
	reactions: ActionView[]
	/** Active reactions grouped by reaction key, ordered as in `reactionTypes`. */
	reactionGroups: ReactionGroup[]
	reposts: ActionView[]
	loading: boolean
	error: Error | null
	reload: () => void
}

/**
 * Load reactions and reposts for `subjectActionId` from the audience tenant.
 * No network happens until `enabled` is true (the dialog only fetches on open).
 */
export function useEngagement(
	subjectActionId: string | undefined,
	audienceTag: string | undefined,
	enabled: boolean
): EngagementData {
	const { api } = useApi()
	const { getTokenFor, getClientFor } = useApiContext()
	const [reactions, setReactions] = React.useState<ActionView[]>([])
	const [reposts, setReposts] = React.useState<ActionView[]>([])
	const [loading, setLoading] = React.useState(false)
	const [error, setError] = React.useState<Error | null>(null)
	const [reloadTick, setReloadTick] = React.useState(0)

	React.useEffect(() => {
		if (!enabled || !subjectActionId || !audienceTag) return
		let cancelled = false
		setLoading(true)
		setError(null)
		;(async () => {
			try {
				// Explicit (user-initiated): bypass the passive-read trust gate so a
				// remote audience tenant yields a proxy token. Own tenant returns the
				// primary token / client transparently.
				const tokenResult = await getTokenFor(audienceTag, { explicit: true })
				const client =
					getClientFor(audienceTag, {
						token: tokenResult?.token,
						auth: 'preferred'
					}) ?? api
				if (!client) throw new Error('No API client available')
				const [reactRes, repostRes] = await Promise.all([
					listAll(client, {
						type: 'REACT',
						subject: subjectActionId,
						status: 'A',
						includeTokens: true
					}),
					listAll(client, {
						type: 'REPOST',
						subject: subjectActionId,
						status: 'A',
						includeTokens: true
					})
				])
				if (cancelled) return
				// REACT:DEL rows remove a reaction — never list them as reactors.
				setReactions(reactRes.filter((a) => a.subType !== 'DEL'))
				setReposts(repostRes)
			} catch (e) {
				if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)))
			} finally {
				if (!cancelled) setLoading(false)
			}
		})()
		return () => {
			cancelled = true
		}
	}, [enabled, subjectActionId, audienceTag, api, getTokenFor, getClientFor, reloadTick])

	const reactionGroups = React.useMemo(() => {
		const groups: ReactionGroup[] = []
		for (const rt of reactionTypes) {
			const acts = reactions.filter((a) => a.subType === rt.key)
			if (acts.length) groups.push({ key: rt.key, actions: acts })
		}
		// Surface any reaction keys not in the canonical list (forward-compat).
		const known = new Set<string>(reactionTypes.map((r) => r.key))
		const extra = new Map<string, ActionView[]>()
		for (const a of reactions) {
			const k = a.subType
			if (k && !known.has(k)) {
				const list = extra.get(k) ?? []
				list.push(a)
				extra.set(k, list)
			}
		}
		for (const [key, acts] of extra) groups.push({ key, actions: acts })
		return groups
	}, [reactions])

	const reload = React.useCallback(() => setReloadTick((t) => t + 1), [])

	return { reactions, reactionGroups, reposts, loading, error, reload }
}

// The viewer's connections/followed set is fetched at most once per session per
// logged-in identity. These identities' keys we trust enough to fetch & verify
// automatically; everyone else gets a manual Verify button.
let autoVerifyPromise: Promise<Set<string>> | null = null
let autoVerifyOwner: string | undefined

function loadAutoVerifySet(
	listConnected: () => Promise<Profile[]>,
	listFollowing: () => Promise<Profile[]>,
	ownIdTag: string
): Promise<Set<string>> {
	return Promise.all([listConnected(), listFollowing()]).then(([connected, following]) => {
		const set = new Set<string>()
		// We implicitly trust our own key, so auto-verify our own actions too.
		set.add(ownIdTag)
		for (const p of connected) set.add(p.idTag)
		for (const p of following) set.add(p.idTag)
		return set
	})
}

/**
 * The set of idTags whose action signatures we auto-verify in the background
 * (the viewer's connections + followed). `undefined` until first resolved.
 */
export function useAutoVerifySet(enabled: boolean): Set<string> | undefined {
	const { api } = useApi()
	const [auth] = useAuth()
	const [set, setSet] = React.useState<Set<string> | undefined>(undefined)

	React.useEffect(() => {
		if (!enabled || !api || !auth?.idTag) return
		let cancelled = false
		if (!autoVerifyPromise || autoVerifyOwner !== auth.idTag) {
			autoVerifyOwner = auth.idTag
			const ownIdTag = auth.idTag
			autoVerifyPromise = loadAutoVerifySet(
				() => api.profiles.list({ connected: true }),
				() => api.profiles.list({ following: true }),
				ownIdTag
			).catch(() => new Set<string>([ownIdTag]))
		}
		autoVerifyPromise.then((s) => {
			if (!cancelled) setSet(s)
		})
		return () => {
			cancelled = true
		}
	}, [enabled, api, auth?.idTag])

	return set
}

// vim: ts=4

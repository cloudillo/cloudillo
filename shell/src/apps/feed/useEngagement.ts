// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Engagement data hooks for the reaction/repost info dialog.
 *
 * Reactions and reposts both reference their target action via the `subject`
 * field. We fetch them from the *audience tenant* (where the subject is
 * authoritatively hosted) — which may be a remote node — using the cross-tenant
 * context helpers (`getTokenFor` / `getClientFor`). `includeTokens` asks the
 * server for each action's raw signed JWS so the dialog can verify signatures.
 */

import { type ApiClient, fetchAll, type ListActionsQuery } from '@cloudillo/core'
import { useApi } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'

import { useApiContext } from '../../context/index.js'
import { reactionTypes } from './reactions.js'

/**
 * Drain every page of an action-list query via cursor pagination. `list` only
 * returns the first page, so a popular post would silently truncate its
 * reactor/reposter list. Capped at 10 pages of 100; `fetchAll` throws when the cap is hit.
 */
function listAll(client: ApiClient, query: ListActionsQuery): Promise<ActionView[]> {
	return fetchAll((cursor) => client.actions.listPaginated({ ...query, cursor, limit: 100 }), {
		maxPages: 10
	})
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
						status: 'active',
						include: ['tokens']
					}),
					listAll(client, {
						type: 'REPOST',
						subject: subjectActionId,
						status: 'active',
						include: ['tokens']
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

// vim: ts=4

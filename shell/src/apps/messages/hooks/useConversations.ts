// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useApi, useAuth } from '@cloudillo/react'
import type { ActionView, Profile } from '@cloudillo/types'
import { atom, useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { createdAtToSeconds, nowSeconds } from '../../../read-position.js'
import { runWithLimit } from '../../../utils.js'
import type { ConvContent, Conversation, MsgAction } from '../types.js'

// Newest DMs scanned to reconstruct direct-message threads. `involved: me` returns the
// user's own DM history (issuer-or-audience rows), which we fold by peer client-side.
const DIRECT_SCAN_LIMIT = 200
// A DM whose newest message is older than this many days lands in Archived.
const DIRECT_STALE_DAYS = 30

export interface UseConversations {
	conversations: Conversation[] | undefined
	reload: () => void
}

// Shared unfiltered conversations for the current identity. Populated once by the
// loader mounted at Layout root (useGlobalMessageUnreadProbe); MessagesApp reads
// the same atom and layers cosmetic member enrichment on top only when it is open.
const conversationsAtom = atom<Conversation[] | undefined>(undefined)
const conversationsReloadAtom = atom(0)

// peer idTag → incoming (issuer !== me) DM timestamps (epoch seconds), newest-first.
// Populated by the loader's DM scan; consumed by useConversationUnread for DM unread
// (so the always-on probe runs a single `involved: me` MSG scan, not two).
export const directIncomingTsAtom = atom<Record<string, number[]>>({})

// Load direct (folded DM history) and group (SUBS→CONV) conversations into the shared
// atom. Mounted ONCE at the Layout root via useGlobalMessageUnreadProbe (always on), so
// it stays lean: DM scan + SUBS(includeSubject) only. The cosmetic member enrichment
// (stacked avatars + "N members") lives in useConversationMembersEnrichment(), mounted
// only when MessagesApp is open. MessagesApp reads the base result via `useConversations`.
//
// `includeSubject:true` embeds each SUBS's CONV (name/description + unread stat) in
// `subjectAction` in one round trip (no per-CONV N+1); falls back to bounded-concurrency
// per-CONV `get()` if the backend omits it.
export function useConversationsLoader(): void {
	const { api } = useApi()
	const [auth] = useAuth()
	const { t } = useTranslation()
	const setConversations = useSetAtom(conversationsAtom)
	const setDirectIncomingTs = useSetAtom(directIncomingTsAtom)
	const reloadKey = useAtomValue(conversationsReloadAtom)

	React.useEffect(
		function loadConversations() {
			setConversations(undefined)
			if (!auth || !api) return
			const ac = new AbortController()
			;(async function () {
				try {
					// The three base queries are independent → fire concurrently. The SUBS
					// call carries its own `.catch(() => [])` so a group-list failure still
					// lets DMs render. profiles: badge peers + New-message picker (not the
					// conversation source). MSG scan: `involved: me` = full DM history, folded
					// by peer below (group MSGs skipped). SUBS: the user's groups, CONV embedded.
					const [profiles, msgRes, subsActions] = await Promise.all([
						api.profiles.list({ type: 'person', connected: true }),
						api.actions.listPaginated({
							type: 'MSG',
							involved: auth.idTag,
							sort: 'created',
							sortDir: 'desc',
							limit: DIRECT_SCAN_LIMIT
						}),
						(
							api.actions.list({
								type: 'SUBS',
								issuer: auth.idTag,
								status: 'A',
								includeSubject: true
							}) as Promise<ActionView[]>
						).catch((err) => {
							console.error('Failed to load group subscriptions', err)
							return [] as ActionView[]
						})
					])
					if (ac.signal.aborted) return
					const connectedSet = new Set(profiles.map((p) => p.idTag))
					const profileByIdTag = new Map(profiles.map((p) => [p.idTag, p]))

					const staleBefore = nowSeconds() - DIRECT_STALE_DAYS * 86400
					// Per-peer incoming (non-own) DM timestamps for directIncomingTsAtom
					// (consumed by useConversationUnread for DM unread; newest-first as the
					// scan is sortDir desc).
					const byPeerIncoming: Record<string, number[]> = {}
					const threads = new Map<string, Conversation>()
					for (const m of msgRes.data as ActionView[]) {
						// Group MSGs carry a parentId (the CONV) — skip; only DMs fold
						// into direct threads.
						if (m.parentId) continue
						if (m.issuer.idTag !== auth.idTag) {
							byPeerIncoming[m.issuer.idTag] ??= []
							byPeerIncoming[m.issuer.idTag].push(createdAtToSeconds(m.createdAt))
						}
						const peer = m.issuer.idTag === auth.idTag ? m.audience : m.issuer
						if (!peer || peer.idTag === auth.idTag) continue
						if (threads.has(peer.idTag)) continue // desc order → first seen is newest
						const lastAt = createdAtToSeconds(m.createdAt)
						threads.set(peer.idTag, {
							id: peer.idTag,
							type: 'direct',
							profiles: [
								{ ...peer, msgReadAt: profileByIdTag.get(peer.idTag)?.msgReadAt }
							],
							lastMessage: m as MsgAction,
							lastMessageAt: m.createdAt,
							connected: connectedSet.has(peer.idTag) ? true : undefined,
							archived: lastAt < staleBefore
						})
					}
					const directConvs = [...threads.values()]

					// Group conversations (SUBS where I'm a member, CONV embedded).
					let groupConvs: Conversation[] = []
					const needFetch: ActionView[] = []
					for (const subs of subsActions) {
						// A SUBS:DEL marks a group the user has left — kept as a
						// read-only archived entry instead of being dropped.
						const left = subs.subType === 'DEL'
						const conv = subs.subjectAction
						if (conv && conv.type === 'CONV') {
							const content = conv.content as ConvContent | undefined
							groupConvs.push({
								id: conv.actionId,
								type: 'group',
								ownerTag: conv.issuer.idTag,
								name: content?.name || t('Unnamed Group'),
								description: content?.description,
								profiles: [],
								isOpen: conv.flags?.includes('O') ?? false,
								left,
								archived: left,
								stat: conv.stat,
								// Groups no longer fold a last-message from the DM scan;
								// the preview time comes from the CONV comment watermark.
								lastMessageAt: conv.stat?.lastCommentAt
							})
						} else if (subs.subject) {
							needFetch.push(subs)
						}
					}

					// Fallback: hydrate any SUBS the server didn't embed.
					if (needFetch.length) {
						await runWithLimit(
							needFetch.map((subs) => async () => {
								const left = subs.subType === 'DEL'
								try {
									const conv = await api.actions.get(subs.subject!)
									if (ac.signal.aborted) return
									if (conv && conv.type === 'CONV') {
										const content = conv.content as ConvContent | undefined
										groupConvs.push({
											id: conv.actionId,
											type: 'group',
											ownerTag: conv.issuer.idTag,
											name: content?.name || t('Unnamed Group'),
											description: content?.description,
											profiles: [],
											isOpen: conv.flags?.includes('O') ?? false,
											left,
											archived: left,
											stat: conv.stat,
											lastMessageAt: conv.stat?.lastCommentAt
										})
									}
								} catch (err) {
									console.error('Failed to load CONV', subs.subject, err)
								}
							}),
							4
						)
					}

					// Defensive dedup: the single-active-SUBS invariant means one row
					// per group, but a federation race could surface both a left and an
					// active entry for the same id — prefer the active (non-left) one.
					const byId = new Map<string, Conversation>()
					for (const g of groupConvs) {
						const existing = byId.get(g.id)
						if (!existing || (existing.left && !g.left)) byId.set(g.id, g)
					}
					groupConvs = [...byId.values()]

					if (ac.signal.aborted) return
					setDirectIncomingTs(byPeerIncoming)
					// Recency order (newest activity first): DM = last message, group =
					// last comment. Undefined timestamps (createdAtToSeconds → 0) sort last.
					const byRecency = [...directConvs, ...groupConvs].sort(
						(a, b) =>
							createdAtToSeconds(b.lastMessageAt) -
							createdAtToSeconds(a.lastMessageAt)
					)
					setConversations(byRecency)
				} catch (err) {
					if (ac.signal.aborted) return
					console.error('Failed to load conversations', err)
					setConversations([])
				}
			})()
			return () => ac.abort()
		},
		[auth, api, reloadKey, t, setConversations, setDirectIncomingTs]
	)
}

// Pure reader over the shared conversations atom. Applies the client-side search
// filter (`q`) without triggering a refetch — the loader owns the network work.
export function useConversations(q: string | undefined): UseConversations {
	const all = useAtomValue(conversationsAtom)
	const setReload = useSetAtom(conversationsReloadAtom)
	const reload = React.useCallback(() => setReload((k) => k + 1), [setReload])
	const conversations = React.useMemo(() => {
		if (!all || !q) return all
		const ql = q.toLowerCase()
		return all.filter((c) =>
			c.type === 'direct'
				? c.profiles[0]?.name?.toLowerCase().includes(ql) ||
					c.profiles[0]?.idTag.toLowerCase().includes(ql)
				: c.name?.toLowerCase().includes(ql) || c.description?.toLowerCase().includes(ql)
		)
	}, [all, q])
	return { conversations, reload }
}

// Cosmetic member enrichment for group cards (stacked avatars + "N members"). Kept OUT
// of the always-on useConversationsLoader — only shown inside MessagesApp — so the extra
// SUBS query fires only when Messages is open. One batched array-`subject` SUBS query
// replaces the per-group N+1, folded by `subs.subject`.
//
// Runs once per (identity, reload generation): `enrichedRef` tracks the group ids already
// attempted so a group that returns no members doesn't re-trigger on its own atom write
// (the length check alone would). A reload resets the set so avatars refill after a
// create/leave/invite.
export function useConversationMembersEnrichment(): void {
	const { api } = useApi()
	const [auth] = useAuth()
	const conversations = useAtomValue(conversationsAtom)
	const setConversations = useSetAtom(conversationsAtom)
	const reloadKey = useAtomValue(conversationsReloadAtom)
	const enrichedRef = React.useRef<{ key: string; ids: Set<string> }>({
		key: '',
		ids: new Set()
	})

	React.useEffect(
		function enrichMembers() {
			if (!api || !auth?.idTag || !conversations) return
			// Reset the attempted-id set when the identity or reload generation changes.
			const key = `${auth.idTag}:${reloadKey}`
			if (enrichedRef.current.key !== key) {
				enrichedRef.current = { key, ids: new Set() }
			}
			// Group convs still needing enrichment: active membership, no profiles yet,
			// and not already attempted for this key.
			const pending = conversations.filter(
				(c) =>
					c.type === 'group' &&
					!c.left &&
					c.profiles.length === 0 &&
					!enrichedRef.current.ids.has(c.id)
			)
			if (!pending.length) return
			for (const g of pending) enrichedRef.current.ids.add(g.id)
			const ac = new AbortController()
			;(async function () {
				try {
					const subsRes = (await api.actions.list({
						type: 'SUBS',
						subject: pending.map((g) => g.id), // A1 array subject
						status: 'A'
					})) as ActionView[]
					if (ac.signal.aborted) return
					const byGroup = new Map<string, Profile[]>()
					for (const subs of subsRes) {
						// A SUBS:DEL is a retired membership (leave), not an active member.
						if (subs.subType === 'DEL' || !subs.subject) continue
						const arr = byGroup.get(subs.subject) ?? []
						arr.push(subs.issuer)
						byGroup.set(subs.subject, arr)
					}
					// New object identities so the memoized ConversationCard re-renders.
					setConversations((prev) =>
						prev
							? prev.map((g) => {
									const profiles = byGroup.get(g.id)
									return profiles
										? { ...g, profiles, memberCount: profiles.length }
										: g
								})
							: prev
					)
				} catch (err) {
					console.error('Failed to load group members', err)
				}
			})()
			return () => ac.abort()
		},
		[api, auth?.idTag, conversations, setConversations, reloadKey]
	)
}

// vim: ts=4

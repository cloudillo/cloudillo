// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { useApi, useAuth } from '@cloudillo/react'
import type { ActionView, Profile, ReaderState } from '@cloudillo/types'
import { atom, useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { createdAtToSeconds, nowSeconds } from '../../../read-position.js'
import { runWithLimit } from '../../../utils.js'
import type { ConvContent, Conversation, MsgAction } from '../types.js'

// Reader-state page size (backend max). The loader walks every page: the header badge
// needs every conversation's unread count, not just the first screen.
const INBOX_PAGE = 200

export interface UseConversations {
	conversations: Conversation[] | undefined
	reload: () => void
}

// Shared unfiltered conversations for the current identity. Populated once by the
// loader mounted at Layout root (useGlobalMessageUnreadProbe); MessagesApp reads
// the same atom and layers cosmetic member enrichment on top only when it is open.
// Exported so useConvPrefs can write prefs optimistically.
export const conversationsAtom = atom<Conversation[] | undefined>(undefined)
const conversationsReloadAtom = atom(0)
// Bumped after every successful load: each one rebuilds groups with `profiles: []`.
const conversationsLoadGenAtom = atom(0)
// The last load failed (the list is then `[]`); cleared by the next successful load.
export const conversationsErrorAtom = atom<unknown>(undefined)

// The per-reader part of a Conversation, from its `P:MSG` / `A:CONV` reader-state row.
// Also used by useConvPrefs to re-derive the fields after an optimistic row edit.
export function readerStateFields(rs: ReaderState | undefined): Partial<Conversation> {
	if (!rs) return {}
	const until = createdAtToSeconds(rs.notifyUntil)
	const active = !until || until > nowSeconds() // an expired notifyUntil counts as unset
	const muteLevel =
		active && rs.notify === 'T' ? 'mentions' : active && rs.notify === 'M' ? 'none' : undefined
	return {
		readerState: rs,
		lastMessageAt: rs.lastAt ?? rs.createdAt,
		lastMessage: rs.last as MsgAction | undefined,
		pinned: rs.pinned,
		archived: rs.archived,
		ignoreAll: rs.ignoreAll,
		muteLevel,
		muteUntil: muteLevel && until ? until : undefined,
		unreadCount: Math.max(rs.unread ?? 0, rs.unreadFlag ? 1 : 0),
		mentioned: createdAtToSeconds(rs.mentionedAt) > createdAtToSeconds(rs.readAt)
	}
}

// Newest activity first; undefined timestamps (createdAtToSeconds → 0) sort last.
export function sortByRecency(list: Conversation[]): Conversation[] {
	return [...list].sort(
		(a, b) => createdAtToSeconds(b.lastMessageAt) - createdAtToSeconds(a.lastMessageAt)
	)
}

function groupFromConv(conv: ActionView, unnamed: string, left: boolean): Conversation {
	const content = conv.content as ConvContent | undefined
	return {
		id: conv.actionId,
		type: 'group',
		ownerTag: conv.issuer.idTag,
		name: content?.name || unnamed,
		description: content?.description,
		profiles: [],
		isOpen: conv.flags?.includes('O') ?? false,
		left: left || undefined,
		communityTag: conv.issuer.type === 'community' ? conv.issuer.idTag : undefined,
		stat: conv.stat,
		// Without a reader-state row (left group, or a membership predating it) the
		// preview time falls back to the CONV's last-comment stamp.
		lastMessageAt: conv.stat?.lastCommentAt,
		...readerStateFields(conv.readerState)
	}
}

// Load the inbox into the shared atom. Mounted ONCE at the Layout root via
// useGlobalMessageUnreadProbe (always on). The cosmetic member enrichment (stacked
// avatars + "N members") lives in useConversationMembersEnrichment(), mounted only when
// MessagesApp is open. MessagesApp reads the base result via `useConversations`.
//
// Sources, fired concurrently:
//  - `GET /reader-state?kind=P:MSG,A:CONV&include=ref,last` — DMs and groups with prefs,
//    unread counts and the last message, newest activity first;
//  - SUBS `includeSubject` — left groups (SUBS:DEL; their `A:CONV` row is deleted on
//    leave), plus active memberships that have no `A:CONV` row yet;
//  - connected persons — the "Not connected" badge (ProfileInfo carries no `connected`).
export function useConversationsLoader(): void {
	const { api } = useApi()
	const [auth] = useAuth()
	const { t } = useTranslation()
	const setConversations = useSetAtom(conversationsAtom)
	const setError = useSetAtom(conversationsErrorAtom)
	const setLoadGen = useSetAtom(conversationsLoadGenAtom)
	const reloadKey = useAtomValue(conversationsReloadAtom)
	const idTagRef = React.useRef(auth?.idTag)

	React.useEffect(
		function loadConversations() {
			// Only an identity change blanks the list; a reload keeps showing the
			// previous one until fresh data replaces it.
			if (idTagRef.current !== auth?.idTag) {
				idTagRef.current = auth?.idTag
				setConversations(undefined)
			}
			if (!auth?.idTag || !api) {
				setConversations(undefined)
				return
			}
			const idTag = auth.idTag
			const ac = new AbortController()
			const unnamed = t('Unnamed Group')
			;(async function () {
				try {
					const loadRows = async () => {
						const rows: ReaderState[] = []
						let cursor: string | undefined
						do {
							const res = await api.readerState.list({
								kind: ['P:MSG', 'A:CONV'],
								sort: 'lastAt',
								limit: INBOX_PAGE,
								cursor,
								include: ['ref', 'last']
							})
							rows.push(...res.data)
							cursor = res.cursorPagination?.hasMore
								? (res.cursorPagination.nextCursor ?? undefined)
								: undefined
						} while (cursor && !ac.signal.aborted)
						return rows
					}
					const [profiles, rows, subsActions] = await Promise.all([
						api.profiles.list({ type: 'person', connected: true }),
						loadRows(),
						(
							api.actions.list({
								type: 'SUBS',
								issuer: idTag,
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

					const byId = new Map<string, Conversation>()
					// Rows/SUBS the server didn't embed an action for → fetched below.
					const needFetch: { id: string; left: boolean; rs?: ReaderState }[] = []
					for (const rs of rows) {
						if (rs.kind === 'P:MSG') {
							if (rs.ref === idTag) continue
							const peer: Profile = rs.profile ?? { idTag: rs.ref }
							byId.set(rs.ref, {
								id: rs.ref,
								type: 'direct',
								profiles: [peer],
								connected: connectedSet.has(rs.ref) ? true : undefined,
								...readerStateFields(rs)
							})
						} else if (rs.action?.type === 'CONV') {
							byId.set(rs.ref, {
								...groupFromConv(rs.action, unnamed, false),
								...readerStateFields(rs)
							})
						} else if (!rs.action) {
							needFetch.push({ id: rs.ref, left: false, rs })
						}
					}

					for (const subs of subsActions) {
						const id = subs.subjectAction?.actionId ?? subs.subject
						// A reader-state row means an active membership: it wins over a
						// SUBS:DEL left behind by a federation race.
						if (!id || byId.has(id) || needFetch.some((f) => f.id === id)) continue
						const left = subs.subType === 'DEL'
						const conv = subs.subjectAction
						if (conv?.type === 'CONV') byId.set(id, groupFromConv(conv, unnamed, left))
						else if (!conv) needFetch.push({ id, left })
					}

					if (needFetch.length) {
						await runWithLimit(
							needFetch.map(({ id, left, rs }) => async () => {
								try {
									const conv = await api.actions.get(id)
									if (ac.signal.aborted || conv?.type !== 'CONV') return
									const g = groupFromConv(conv, unnamed, left)
									byId.set(id, rs ? { ...g, ...readerStateFields(rs) } : g)
								} catch (err) {
									console.error('Failed to load CONV', id, err)
								}
							}),
							4
						)
					}

					if (ac.signal.aborted) return
					setConversations(sortByRecency([...byId.values()]))
					setLoadGen((g) => g + 1)
					setError(undefined)
				} catch (err) {
					if (ac.signal.aborted) return
					console.error('Failed to load conversations', err)
					setConversations([])
					setError(err)
				}
			})()
			return () => ac.abort()
		},
		// `auth?.idTag`, not `auth`: a token renewal replaces the auth object.
		[auth?.idTag, api, reloadKey, t, setConversations, setError, setLoadGen]
	)
}

// Pure reader over the shared conversations atom. Applies the client-side search
// filter (`q`) without triggering a refetch — the loader owns the network work.
export function useConversations(q: string | undefined): UseConversations {
	const all = useAtomValue(conversationsAtom)
	const reload = useConversationsReload()
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

// Re-run the loader (e.g. after a create/leave, or a failed optimistic pref write).
export function useConversationsReload(): () => void {
	const setReload = useSetAtom(conversationsReloadAtom)
	return React.useCallback(() => setReload((k) => k + 1), [setReload])
}

// Cosmetic member enrichment for group cards (stacked avatars + "N members"). Kept OUT
// of the always-on useConversationsLoader — only shown inside MessagesApp — so the extra
// SUBS query fires only when Messages is open. One batched array-`subject` SUBS query
// replaces the per-group N+1, folded by `subs.subject`.
//
// Runs once per (identity, load generation): `enrichedRef` tracks the group ids already
// attempted so a group that returns no members doesn't re-trigger on its own atom write
// (the length check alone would). Every load (reload, `api`/`t` change) resets the set,
// since the loader rebuilds groups without profiles.
export function useConversationMembersEnrichment(): void {
	const { api } = useApi()
	const [auth] = useAuth()
	const conversations = useAtomValue(conversationsAtom)
	const setConversations = useSetAtom(conversationsAtom)
	const loadGen = useAtomValue(conversationsLoadGenAtom)
	const enrichedRef = React.useRef<{ key: string; ids: Set<string>; ac?: AbortController }>({
		key: '',
		ids: new Set()
	})
	React.useEffect(() => () => enrichedRef.current.ac?.abort(), [])

	React.useEffect(
		function enrichMembers() {
			if (!api || !auth?.idTag || !conversations) return
			// Reset the attempted-id set when the identity or load generation changes.
			const key = `${auth.idTag}:${loadGen}`
			if (enrichedRef.current.key !== key) {
				enrichedRef.current.ac?.abort()
				enrichedRef.current = { key, ids: new Set(), ac: new AbortController() }
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
			// Marked up front so a refire (every live message rewrites `conversations`)
			// neither duplicates nor aborts the request; rolled back on failure so the next
			// run retries. Only a key change or unmount aborts.
			// One controller per key, shared by every run under it.
			const { ids, ac } = enrichedRef.current
			if (!ac) return
			for (const g of pending) ids.add(g.id)
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
					// New object identities so the memoized InboxRow re-renders.
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
					if (ac.signal.aborted) return
					for (const g of pending) ids.delete(g.id)
					console.error('Failed to load group members', err)
				}
			})()
		},
		[api, auth?.idTag, conversations, setConversations, loadGen]
	)
}

// vim: ts=4

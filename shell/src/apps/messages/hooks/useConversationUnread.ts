// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { useAuth } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import { useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'

import {
	createdAtToSeconds,
	liveEdgeConvAtom,
	nowSeconds,
	readPositionAtom,
	unreadCountAtom
} from '../../../read-position.js'
import { useWsBus } from '../../../ws-bus.js'
import type { Conversation, MsgAction } from '../types.js'
import {
	conversationsAtom,
	sortByRecency,
	useConversations,
	useConversationsLoader,
	useConversationsReload
} from './useConversations.js'
import { applyConvPatch } from './useConvPrefs.js'

// Messages seen live over the WS bus for conversations not in the list yet (they
// trigger a reload): count + newest ts.
type LiveMap = Record<string, { n: number; ts: number }>

// Group comment → CONV; DM → the peer (the audience of an own message).
export function liveMsgConvId(a: ActionView, myIdTag: string | undefined): string | undefined {
	return a.parentId ?? (a.issuer.idTag === myIdTag ? a.audience?.idTag : a.issuer.idTag)
}

/** The inbox with a live MSG applied to its row, re-sorted; undefined if the row is unknown. */
export function applyLiveMsg(
	list: Conversation[],
	a: ActionView,
	myIdTag: string | undefined,
	liveEdgeConvId?: string
): Conversation[] | undefined {
	const id = liveMsgConvId(a, myIdTag)
	if (!id || !list.some((c) => c.id === id)) return
	// Seen at the open conversation's live edge: no unread bump.
	const own = a.issuer.idTag === myIdTag || id === liveEdgeConvId
	return sortByRecency(
		list.map((c) =>
			c.id === id
				? {
						...c,
						lastMessage: a as MsgAction,
						lastMessageAt: a.createdAt,
						unreadCount: own ? c.unreadCount : (c.unreadCount ?? 0) + 1
					}
				: c
		)
	)
}

// Populate `unreadCountAtom` per conversation (`<id>` = peer idTag or CONV id):
//  - `msg:<id>`      — counts toward the header badge (layout.tsx counts entries > 0):
//                      the effective unread, or 0 when muted and not mentioned;
//  - `msgMuted:<id>` — the effective unread of a muted conversation (grey row count).
// Effective unread = the backend count (`Conversation.unreadCount`) plus live arrivals,
// zeroed once the local read marker (readPositionAtom `msg:<peer>` / `thread:<convId>`)
// moves past the newest message.
export function useConversationUnread(conversations: Conversation[] | undefined): void {
	const [auth] = useAuth()
	const setUnread = useSetAtom(unreadCountAtom)
	const setConversations = useSetAtom(conversationsAtom)
	const readPositions = useAtomValue(readPositionAtom)
	const liveEdgeConvId = useAtomValue(liveEdgeConvAtom)
	const reload = useConversationsReload()
	// Conversation id → the live `ts` it was last reloaded for.
	const reloadedForRef = React.useRef(new Map<string, number>())
	const [live, setLive] = React.useState<LiveMap>({})
	// Bumped when the next timed mute runs out, so its count reaches the badge again.
	const [tick, setTick] = React.useState(0)

	React.useEffect(() => {
		const now = nowSeconds()
		let next = Number.POSITIVE_INFINITY
		for (const c of conversations ?? []) {
			if (c.muteUntil && c.muteUntil > now) next = Math.min(next, c.muteUntil)
		}
		if (next === Number.POSITIVE_INFINITY) return
		const timer = setTimeout(
			() => setTick((n) => n + 1),
			Math.min((next - now) * 1000 + 500, 2 ** 31 - 1)
		)
		return () => clearTimeout(timer)
	}, [conversations, tick])

	useWsBus({ cmds: ['ACTION'] }, function handleAction(m) {
		const a = m.data as ActionView
		if (a.type === 'CONV' && a.subType === 'UPD') {
			if (conversations?.some((c) => c.id === a.subject)) reload()
			return
		}
		if (a.type !== 'MSG' || a.subType === 'DEL' || a.subType === 'UPD') return
		const id = liveMsgConvId(a, auth?.idTag)
		if (!id) return
		// A known row takes the message directly (preview, order, unread).
		if (conversations?.some((c) => c.id === id)) {
			setConversations(
				(prev) => (prev && applyLiveMsg(prev, a, auth?.idTag, liveEdgeConvId)) || prev
			)
			return
		}
		// The reader's own message never creates unread.
		if (a.issuer.idTag === auth?.idTag) return
		const ts = createdAtToSeconds(a.createdAt)
		setLive((prev) => ({
			...prev,
			[id]: { n: (prev[id]?.n ?? 0) + 1, ts: Math.max(prev[id]?.ts ?? 0, ts) }
		}))
	})

	React.useEffect(() => {
		if (!conversations) return // loading — keep the previous counts, no badge flicker
		const now = nowSeconds()
		const byId = new Map(conversations.map((c) => [c.id, c]))
		const patch: Record<string, number> = {}
		// Conversations read past their newest message locally: their row in
		// `conversationsAtom` gets the read too, so a later live MSG counts from 0.
		const readThrough: Record<string, number> = {}
		for (const c of conversations) {
			// Left groups have no reader-state row and never feed the badge.
			if (c.left) continue
			const lastAt = createdAtToSeconds(c.lastMessageAt)
			const l = live[c.id]
			const serverRead = createdAtToSeconds(c.readerState?.readAt)
			const localRead =
				readPositions[`${c.type === 'direct' ? 'msg' : 'thread'}:${c.id}`] ?? 0
			// a partial local read keeps the loaded count until the next load;
			// only reading past the newest message (1s tolerance, as the feed's comment
			// dot) zeroes it.
			const readLocally =
				localRead > serverRead && localRead + 1 >= Math.max(lastAt, l?.ts ?? 0)
			let count = readLocally ? 0 : (c.unreadCount ?? 0) + (l && l.ts > lastAt ? l.n : 0)
			// A manual unread flag outlives older local reads. The server clears it once
			// `readAt` strictly advances, so a local read past both the server read and the
			// flag's own stamp (`updatedAt`, set by "Mark unread") wins.
			if (
				c.readerState?.unreadFlag &&
				localRead <= Math.max(serverRead, createdAtToSeconds(c.readerState.updatedAt))
			)
				count = Math.max(count, 1)
			// count === 0: never clears an outstanding "Mark unread" flag.
			if (readLocally && count === 0) readThrough[c.id] = localRead
			const mentioned =
				!!c.mentioned &&
				createdAtToSeconds(c.readerState?.mentionedAt) > Math.max(serverRead, localRead)
			const muted = !!c.muteLevel && (!c.muteUntil || c.muteUntil > now)
			patch[`msg:${c.id}`] = muted && !mentioned ? 0 : count
			patch[`msgMuted:${c.id}`] = muted ? count : 0
		}
		setUnread((prev) => {
			let changed = false
			const next = { ...prev }
			// Zero any entry we no longer compute (conversation dropped out) so the
			// badge never counts a conversation that has no row.
			for (const k of Object.keys(next)) {
				if (
					(k.startsWith('msg:') || k.startsWith('msgMuted:')) &&
					!(k in patch) &&
					next[k]
				) {
					next[k] = 0
					changed = true
				}
			}
			for (const [k, v] of Object.entries(patch)) {
				if ((next[k] ?? 0) !== v) {
					next[k] = v
					changed = true
				}
			}
			return changed ? next : prev
		})
		// unreadCount forced to 0: applyConvPatch only zeroes it when readAt >= lastAt,
		// the check above allows 1s tolerance.
		if (Object.keys(readThrough).length)
			setConversations((prev) =>
				prev?.map((c) =>
					c.id in readThrough
						? {
								...applyConvPatch(c, {
									readAt: new Date(readThrough[c.id] * 1000).toISOString()
								}),
								unreadCount: 0
							}
						: c
				)
			)
		// Drop live entries the loaded data already covers or that have no conversation.
		// A message from a conversation not in the list (first DM, new group) reloads it.
		const stale = (id: string, l: { ts: number }) => {
			const c = byId.get(id)
			return !c || l.ts <= createdAtToSeconds(c.lastMessageAt)
		}
		if (Object.entries(live).some(([id, l]) => stale(id, l))) {
			setLive((prev) => {
				const nextLive: LiveMap = {}
				for (const [id, l] of Object.entries(prev)) if (!stale(id, l)) nextLive[id] = l
				return nextLive
			})
		}
		// Once per live arrival from an unlisted conversation, not once per message: a
		// failed reload retries on the next arrival, and a reload can't loop (it leaves `ts`).
		const missing = Object.keys(live).filter(
			(id) => !byId.has(id) && reloadedForRef.current.get(id) !== live[id].ts
		)
		if (missing.length) {
			for (const id of missing) reloadedForRef.current.set(id, live[id].ts)
			reload()
		}
	}, [conversations, live, readPositions, setUnread, setConversations, reload, tick])
}

// Root-level probe: load all conversations (unfiltered) and keep the msg: unread
// counts in unreadCountAtom live regardless of whether MessagesApp is mounted.
// Mirrors useGlobalUnreadProbe() for the feed. Call once from Layout().
export function useGlobalMessageUnreadProbe(): void {
	useConversationsLoader()
	const { conversations } = useConversations(undefined)
	useConversationUnread(conversations)
}

// vim: ts=4

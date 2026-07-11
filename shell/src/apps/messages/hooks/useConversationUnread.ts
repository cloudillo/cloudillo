// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useAuth } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import { useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'

import { createdAtToSeconds, readPositionAtom, unreadCountAtom } from '../../../read-position.js'
import { useWsBus } from '../../../ws-bus.js'
import type { Conversation } from '../types.js'
import {
	directIncomingTsAtom,
	useConversations,
	useConversationsLoader
} from './useConversations.js'

// Cap on retained per-peer incoming-DM timestamps. Live WS arrivals prepend to the
// loader's seed array; bound the tail so a long-lived session doesn't accumulate an
// unbounded list (only the newest matter for the `> read` unread compare).
const DM_TS_CAP = 100

// Populate `unreadCountAtom` under `msg:<convId>` keys from two generic sources:
//  - Group unread from each CONV's `stat` (lastCommentAt > commentsReadAt),
//    mirroring the feed's comment dot.
//  - DM unread from the loader's per-peer incoming timestamps (directIncomingTsAtom),
//    compared against profiles.msgReadAt — no second involved:me MSG scan.
// The open conversation's count zeroes automatically as its read marker advances
// (readPositionAtom is a dependency of the recompute).
export function useConversationUnread(conversations: Conversation[] | undefined): void {
	const [auth] = useAuth()
	const setUnread = useSetAtom(unreadCountAtom)
	const readPositions = useAtomValue(readPositionAtom)
	// peer idTag → incoming DM timestamps (epoch seconds), newest-first. Seeded by the
	// loader's DM scan; live WS arrivals append here (no extra network round trip).
	const dmTs = useAtomValue(directIncomingTsAtom)
	const setDmTs = useSetAtom(directIncomingTsAtom)
	// convId → newest incoming (non-own) group-comment ts seen live over the WS bus.
	// Folded into the group-unread compare so a new comment lights the badge without a
	// conversations reload (stat.lastCommentAt is fetched once and otherwise frozen).
	const [liveGroupTs, setLiveGroupTs] = React.useState<Record<string, number>>({})

	// Per-peer DM read watermark seed from the loaded direct-conversation profiles.
	const peerReadAt = React.useMemo(() => {
		const map: Record<string, number> = {}
		for (const c of conversations || []) {
			if (c.type !== 'direct') continue
			map[c.id] = createdAtToSeconds(c.profiles[0]?.msgReadAt)
		}
		return map
	}, [conversations])

	// Live overlay for both channels. Incoming group comments fold into liveGroupTs;
	// incoming DMs append to the shared directIncomingTsAtom (capped tail). The reader's
	// own message never creates unread, so short-circuit it up front.
	useWsBus({ cmds: ['ACTION'] }, function handleAction(m) {
		const a = m.data as ActionView
		if (a.type !== 'MSG') return
		if (a.issuer.idTag === auth?.idTag) return
		const ts = createdAtToSeconds(a.createdAt)
		if (a.parentId) {
			// Group comment: fold its timestamp into the live overlay.
			const convId = a.parentId
			setLiveGroupTs((prev) => (ts > (prev[convId] ?? 0) ? { ...prev, [convId]: ts } : prev))
			return
		}
		// DM: prepend to this peer's timestamp array, bounded to a recent tail (L3).
		const peer = a.issuer.idTag
		setDmTs((prev) => {
			const arr = prev[peer] ?? []
			return { ...prev, [peer]: [ts, ...arr].slice(0, DM_TS_CAP) }
		})
	})

	// Recompute the msg: unread map whenever inputs or watermarks change.
	React.useEffect(() => {
		const groupIds = new Set<string>()
		const patch: Record<string, number> = {}
		for (const c of conversations || []) {
			// Left/archived groups live under the collapsed "Archived" section and have no
			// clearable card — never feed the nav badge (M1). The zeroing pass below drops
			// any entry a group carried before it became `left`.
			if (c.type !== 'group' || c.left) continue
			groupIds.add(c.id)
			const last = Math.max(createdAtToSeconds(c.stat?.lastCommentAt), liveGroupTs[c.id] ?? 0)
			const read = Math.max(
				createdAtToSeconds(c.stat?.commentsReadAt),
				readPositions[`thread:${c.id}`] ?? 0
			)
			// 1s tolerance mirrors the feed's comment dot (feed.tsx), guarding an
			// off-by-one between the federated comments_ts and a locally advanced
			// commentsReadAt.
			patch[`msg:${c.id}`] = last > read + 1 ? 1 : 0
		}
		for (const [peer, tsList] of Object.entries(dmTs)) {
			// No direct-conversation card for this peer → don't badge (the nav sum must
			// equal the sum of visible card badges; non-connected senders render no card).
			if (!(peer in peerReadAt)) continue
			const read = Math.max(peerReadAt[peer] ?? 0, readPositions[`msg:${peer}`] ?? 0)
			patch[`msg:${peer}`] = tsList.filter((ts) => ts > read).length
		}
		setUnread((prev) => {
			let changed = false
			const next = { ...prev }
			// Zero any msg: entry we no longer compute (conv/peer dropped out) so the
			// nav badge never counts a conversation that has no visible card.
			for (const k of Object.keys(next)) {
				if (k.startsWith('msg:') && !(k in patch) && next[k] !== 0) {
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
		// Prune liveGroupTs entries for groups no longer present (left/removed) so the
		// live overlay doesn't grow unbounded over a long session (L3). Guard the write
		// so an unchanged map returns `prev` and doesn't re-trigger this effect.
		setLiveGroupTs((prev) => {
			let changed = false
			const nextTs: Record<string, number> = {}
			for (const [id, ts] of Object.entries(prev)) {
				if (groupIds.has(id)) nextTs[id] = ts
				else changed = true
			}
			return changed ? nextTs : prev
		})
	}, [conversations, dmTs, liveGroupTs, readPositions, peerReadAt, setUnread])
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

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { useApi, useAuth } from '@cloudillo/react'
import type { ActionView, ProfileInfo } from '@cloudillo/types'
import * as React from 'react'

import { createdAtToSeconds } from '../../../read-position.js'
import { useWsBus } from '../../../ws-bus.js'
import type { ActionEvt, Conversation } from '../types.js'

/** One reader's newest-read point (an RCPT row) */
export interface Receipt {
	profile: ProfileInfo
	/** Epoch seconds */
	readAt: number
}

// RCPT content is the reader's newest-read epoch seconds.
export function toReceipt(a: ActionView): Receipt | undefined {
	const readAt = Number(a.content)
	return Number.isFinite(readAt) && readAt > 0 ? { profile: a.issuer, readAt } : undefined
}

// Group RCPTs name the CONV as subject; DM RCPTs have none and involve the peer.
export function isConvRcpt(a: ActionView, convId: string, isGroup: boolean): boolean {
	if (a.type !== 'RCPT') return false
	return isGroup
		? a.subject === convId
		: !a.subject && (a.issuer.idTag === convId || a.audience?.idTag === convId)
}

/** One receipt per reader, the newest `readAt` winning */
export function mergeReceipts(a: Receipt[], b: Receipt[]): Receipt[] {
	const byId = new Map<string, Receipt>()
	for (const r of [...a, ...b]) {
		const cur = byId.get(r.profile.idTag)
		if (!cur || r.readAt > cur.readAt) byId.set(r.profile.idTag, r)
	}
	return [...byId.values()]
}

/**
 * Read receipts of a conversation, others' only. Read-only: the backend
 * sends RCPT from the reader-state handler; while `msg.send_read_receipts` is off it
 * hides everyone else's too, so this list is simply empty then.
 */
export function useReceipts(conversation: Conversation | undefined): Receipt[] {
	const { api } = useApi()
	const [auth] = useAuth()
	const me = auth?.idTag
	const convId = conversation?.id
	const isGroup = conversation?.type === 'group'
	const [receipts, setReceipts] = React.useState<Receipt[]>([])

	// Deps: refetch on conversation switch
	React.useEffect(() => {
		setReceipts([])
		if (!api || !convId) return
		let cancelled = false
		;(async function () {
			const rows: ActionView[] = []
			let cursor: string | undefined
			// at most 10 pages of 200 RCPTs (one per reader, so 2000 readers);
			// raise the cap if groups ever grow past that.
			for (let page = 0; page < 10 && !cancelled; page++) {
				const res = await api.actions.listPaginated({
					type: 'RCPT',
					...(isGroup ? { subject: convId } : { involved: convId }),
					limit: 200,
					cursor
				})
				rows.push(...res.data)
				cursor = res.cursorPagination?.hasMore
					? (res.cursorPagination.nextCursor ?? undefined)
					: undefined
				if (!cursor) break
			}
			return rows
		})()
			.then((rows) => {
				if (cancelled) return
				const fetched = rows
					.filter((a) => isConvRcpt(a, convId, isGroup) && a.issuer.idTag !== me)
					.map(toReceipt)
					.filter((r): r is Receipt => !!r)
				// Merge: a live RCPT that arrived during the fetch may be newer.
				setReceipts((prev) => mergeReceipts(fetched, prev))
			})
			.catch((err) => console.error('Failed to load read receipts', err))
		return () => {
			cancelled = true
		}
	}, [api, convId, isGroup, me])

	// A live RCPT supersedes that reader's older one (key RCPT:{conv}:{audience}:{issuer}).
	useWsBus({ cmds: ['ACTION'] }, (m) => {
		const a = m.data as ActionView
		if (!convId || a.issuer?.idTag === me || !isConvRcpt(a, convId, isGroup)) return
		const r = toReceipt(a)
		if (!r) return
		setReceipts((prev) => mergeReceipts(prev, [r]))
	})

	return receipts
}

/** Where receipts render in the message list */
export interface ReceiptPoints {
	/** Group: actionId → readers whose read point is that message */
	byMsg: Map<string, ProfileInfo[]>
	/** DM: the newest own message the peer has read ("Seen") */
	seenId?: string
}

/** Places each reader at the newest loaded message at or before their read time. */
export function receiptPoints(
	msg: ActionEvt[] | undefined,
	receipts: Receipt[],
	ownIdTag: string | undefined,
	isGroup: boolean
): ReceiptPoints {
	const byMsg = new Map<string, ProfileInfo[]>()
	if (!msg?.length || !receipts.length) return { byMsg }
	const at = (i: number) => createdAtToSeconds(msg[i]?.createdAt ?? 0)
	// Newest loaded message index with createdAt <= ts (msg is oldest → newest).
	function pointOf(ts: number, own?: boolean): number {
		for (let i = msg!.length - 1; i >= 0; i--) {
			const m = msg![i]
			if (!m || m.actionId === m.tempId) continue
			if (own && m.issuer.idTag !== ownIdTag) continue
			if (at(i) <= ts) return i
		}
		return -1
	}
	if (!isGroup) {
		const peerReadAt = Math.max(...receipts.map((r) => r.readAt))
		const i = pointOf(peerReadAt, true)
		return { byMsg, seenId: i >= 0 ? msg[i]?.actionId : undefined }
	}
	for (const r of receipts) {
		const i = pointOf(r.readAt)
		const id = i >= 0 ? msg[i]?.actionId : undefined
		if (!id) continue
		byMsg.set(id, [...(byMsg.get(id) ?? []), r.profile])
	}
	return { byMsg }
}

/** Readers who have reached `action` ("Seen by" in the message menu), its author excluded */
export function seenBy(action: ActionEvt, receipts: Receipt[]): ProfileInfo[] {
	const ts = createdAtToSeconds(action.createdAt)
	return receipts
		.filter((r) => r.readAt >= ts && r.profile.idTag !== action.issuer.idTag)
		.map((r) => r.profile)
}

// vim: ts=4

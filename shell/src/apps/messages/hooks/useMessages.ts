// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useApi, useAuth } from '@cloudillo/react'
import type { ActionView, NewAction } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { createdAtToSeconds, nowSeconds, useReadMarker } from '../../../read-position.js'
import { useWsBus } from '../../../ws-bus.js'
import type {
	ActionEvt,
	ConvContent,
	Conversation,
	ConversationMember,
	MemberStatus
} from '../types.js'
import { getActionRole } from '../types.js'
import { genTempId, isGroupId } from '../utils.js'

const PAGE_SIZE = 30

// What produced the most recent change to `msg`, so the consumer can decide
// whether to auto-scroll to the bottom ('append'/'init') or preserve the
// viewport ('prepend' = an older page was loaded at the top).
export type MsgChangeKind = 'init' | 'append' | 'prepend'

export interface UseMessages {
	msg: ActionEvt[] | undefined
	conversation: Conversation | undefined
	members: ConversationMember[] | undefined
	hasMore: boolean
	loadingOlder: boolean
	loadOlder: () => void
	send: (input: { content: string; attachmentIds: string[] }) => Promise<boolean>
	retry: (tempId: string) => Promise<void>
	markRead: (ts: number) => void
	unreadBoundaryTs: number | undefined
	// Read-marker cap: newest incoming ts, seeded from the list load then advanced by
	// live WS arrivals. A WS `createdAt` (received time) can exceed the list's authored
	// `created_at` on federation delay, so clamp to now — the backend's forward-only
	// write rejects a future timestamp.
	newestListIncomingTs: number
	// Newest message ts (including own), seeded from the list load then advanced by live
	// WS arrivals (clamped to now). Ceiling for the bottom-dwell "caught up" signal.
	newestListTs: number
	reload: () => void
	lastChangeRef: React.MutableRefObject<MsgChangeKind>
}

function buildNewAction(
	conversation: Conversation,
	convId: string,
	content: string,
	attachmentIds: string[]
): NewAction {
	return {
		type: 'MSG',
		subType: attachmentIds.length ? 'IMG' : 'TEXT',
		content,
		attachments: attachmentIds.length ? attachmentIds : undefined,
		// Groups thread under the CONV via parentId; DMs target the peer via audienceTag.
		...(conversation.type === 'group' ? { parentId: convId } : { audienceTag: convId })
	}
}

// Newest incoming (non-own) message timestamp from an oldest→newest ordered list.
function findNewestIncomingTs(ordered: ActionEvt[], ownIdTag: string | undefined): number {
	for (let i = ordered.length - 1; i >= 0; i--) {
		if (ordered[i].issuer.idTag !== ownIdTag) return createdAtToSeconds(ordered[i].createdAt)
	}
	return 0
}

// Newest message timestamp (including own) from an oldest→newest ordered list.
function findNewestListTs(ordered: ActionEvt[]): number {
	const last = ordered[ordered.length - 1]
	return last ? createdAtToSeconds(last.createdAt) : 0
}

export function useMessages(convId: string | undefined): UseMessages {
	const { api } = useApi()
	const [auth] = useAuth()
	const { t } = useTranslation()

	const [msg, setMsg] = React.useState<ActionEvt[] | undefined>()
	const [conversation, setConversation] = React.useState<Conversation | undefined>()
	const [members, setMembers] = React.useState<ConversationMember[] | undefined>()
	const [cursor, setCursor] = React.useState<string | undefined>()
	const [hasMore, setHasMore] = React.useState(false)
	const [loadingOlder, setLoadingOlder] = React.useState(false)
	// Seed for the read marker: group → CONV stat.commentsReadAt, DM → peer
	// profile.msgReadAt. Set after the conversation loads.
	const [convReadSeed, setConvReadSeed] = React.useState<number | undefined>()
	// Reset the seed synchronously on conversation change (adjust-state-during-render):
	// convReadSeed otherwise updates only in the async load effect below, so useReadMarker
	// would run one render with the stale seed and its forward-only SEED effect would
	// poison the new conversation's read position.
	const seedConvIdRef = React.useRef(convId)
	if (seedConvIdRef.current !== convId) {
		seedConvIdRef.current = convId
		setConvReadSeed(undefined)
	}
	// Read watermark snapshotted at open, anchoring the "New messages" divider so it
	// doesn't move as the live marker advances.
	const [unreadBoundaryTs, setUnreadBoundaryTs] = React.useState<number | undefined>()
	// Frozen cap for the read marker (see UseMessages.newestListIncomingTs).
	const [newestListIncomingTs, setNewestListIncomingTs] = React.useState(0)
	// Own-inclusive newest list ts (see UseMessages.newestListTs).
	const [newestListTs, setNewestListTs] = React.useState(0)
	const [reloadKey, setReloadKey] = React.useState(0)
	const reload = React.useCallback(() => setReloadKey((k) => k + 1), [])

	const lastChangeRef = React.useRef<MsgChangeKind>('init')
	// Staleness guard for loadOlder: bumped whenever the conversation (re)loads,
	// so an in-flight older-page fetch from a previous conversation can't prepend
	// foreign messages or overwrite the new conversation's cursor/hasMore.
	const loadGenRef = React.useRef(0)

	// A group CONV + its MSG children is structurally a post + comments, so reuse
	// the generic `thread` read-marker scope; DMs use the per-peer `msg` scope.
	const scopeKey = convId ? (isGroupId(convId) ? `thread:${convId}` : `msg:${convId}`) : ''
	const { advanceTo } = useReadMarker(scopeKey, convReadSeed)

	// Keep a stable reference for the WS handler and send/retry closures.
	const conversationRef = React.useRef(conversation)
	conversationRef.current = conversation

	// Load conversation + initial (newest) page of messages.
	React.useEffect(
		function loadMessages() {
			loadGenRef.current++
			setMsg(undefined)
			setConversation(undefined)
			setMembers(undefined)
			setConvReadSeed(undefined)
			setUnreadBoundaryTs(undefined)
			setNewestListIncomingTs(0)
			setNewestListTs(0)
			setCursor(undefined)
			setHasMore(false)
			setLoadingOlder(false)
			lastChangeRef.current = 'init'
			if (!auth || !convId || !api) return
			const ac = new AbortController()
			;(async function () {
				try {
					if (isGroupId(convId)) {
						// The four group-open queries are independent → fire concurrently.
						// INVT carries its own `.catch` since pending invites are optional.
						const [convAction, membersRes, invitesRes, res] = await Promise.all([
							api.actions.get(convId),
							api.actions.list({
								type: 'SUBS',
								subject: convId,
								status: 'A'
							}) as Promise<ActionView[]>,
							(
								api.actions.list({
									type: 'INVT',
									subject: convId
								}) as Promise<ActionView[]>
							).catch((err) => {
								console.error('Failed to load invitations', err)
								return [] as ActionView[]
							}),
							api.actions.listPaginated({
								type: 'MSG',
								parentId: convId,
								sort: 'created',
								sortDir: 'desc',
								limit: PAGE_SIZE
							})
						])
						if (ac.signal.aborted) return
						if (convAction?.type !== 'CONV') return
						const content = convAction.content as ConvContent | undefined

						// Active members (SUBS status A). A SUBS:DEL is a retired
						// membership (leave), not an active member — the generic listing
						// doesn't apply the backend's DEL exclusion.
						const activeMembers: ConversationMember[] = membersRes
							.filter((subs) => subs.subType !== 'DEL')
							.map((subs) => ({
								profile: subs.issuer,
								role: getActionRole(subs),
								status: 'active' as MemberStatus,
								actionId: subs.actionId,
								joinedAt: String(subs.createdAt)
							}))

						// Pending invitations (INVT not yet accepted).
						const activeIdTags = new Set(activeMembers.map((m) => m.profile.idTag))
						// INVT:DEL is a revocation record, not a pending invite — it
						// rests at 'A' on the group node, so filter it explicitly.
						const invitedMembers: ConversationMember[] = invitesRes
							.filter(
								(invt) =>
									invt.subType !== 'DEL' &&
									invt.audience &&
									!activeIdTags.has(invt.audience.idTag)
							)
							.map((invt) => ({
								profile: invt.audience!,
								role: getActionRole(invt),
								status: 'invited' as MemberStatus,
								actionId: invt.actionId,
								joinedAt: String(invt.createdAt)
							}))

						setMembers([...activeMembers, ...invitedMembers])
						setConversation({
							id: convId,
							type: 'group',
							ownerTag: convAction.issuer.idTag,
							name: content?.name || t('Unnamed Group'),
							description: content?.description,
							profiles: activeMembers.map((m) => m.profile),
							memberCount: activeMembers.length,
							isOpen: convAction.flags?.includes('O') ?? false,
							stat: convAction.stat
						})
						// Seed the group read marker from the CONV's comment watermark.
						setConvReadSeed(createdAtToSeconds(convAction.stat?.commentsReadAt))

						const ordered = (res.data as ActionEvt[]).slice().reverse()
						setMsg(ordered)
						setCursor(res.cursorPagination?.nextCursor ?? undefined)
						setHasMore(res.cursorPagination?.hasMore ?? false)
						// Boundary from the server-persisted watermark only: the in-memory
						// readPosition atom can be poisoned by WS messages (see
						// newestListIncomingTs), pushing it past every loaded message and
						// suppressing the divider forever.
						const seedTs = createdAtToSeconds(convAction.stat?.commentsReadAt)
						setUnreadBoundaryTs(seedTs)
						setNewestListIncomingTs(findNewestIncomingTs(ordered, auth.idTag))
						setNewestListTs(findNewestListTs(ordered))
					} else {
						// Profile fetch and the message page are independent → parallel.
						const [profile, res] = await Promise.all([
							api.profiles.get(convId),
							api.actions.listPaginated({
								type: 'MSG',
								involved: convId,
								sort: 'created',
								sortDir: 'desc',
								limit: PAGE_SIZE
							})
						])
						if (ac.signal.aborted) return
						setConversation({
							id: convId,
							type: 'direct',
							profiles: profile ? [profile] : []
						})
						// Seed the DM watermark from the peer's profiles.msg_read_at.
						setConvReadSeed(createdAtToSeconds(profile?.msgReadAt))

						const ordered = (res.data as ActionEvt[]).slice().reverse()
						setMsg(ordered)
						setCursor(res.cursorPagination?.nextCursor ?? undefined)
						setHasMore(res.cursorPagination?.hasMore ?? false)
						// Boundary from the server-persisted watermark only (see group branch).
						const seedTs = createdAtToSeconds(profile?.msgReadAt)
						setUnreadBoundaryTs(seedTs)
						setNewestListIncomingTs(findNewestIncomingTs(ordered, auth.idTag))
						setNewestListTs(findNewestListTs(ordered))
					}
				} catch (err) {
					if (ac.signal.aborted) return
					console.error('Failed to load messages', err)
					setMsg([])
				}
			})()
			return () => ac.abort()
		},
		[auth, convId, api, t, reloadKey]
	)

	// Older-page pagination (scroll-up). Prepends the next older page and marks
	// the change as 'prepend' so the consumer preserves the viewport.
	const loadOlder = React.useCallback(
		async function loadOlder() {
			if (!api || !convId || !cursor || !hasMore || loadingOlder) return
			setLoadingOlder(true)
			const gen = loadGenRef.current
			try {
				const filter = isGroupId(convId) ? { parentId: convId } : { involved: convId }
				const res = await api.actions.listPaginated({
					type: 'MSG',
					...filter,
					sort: 'created',
					sortDir: 'desc',
					limit: PAGE_SIZE,
					cursor
				})
				// The conversation changed (or reloaded) while the fetch was in
				// flight — this page belongs to the previous list, drop it.
				if (gen !== loadGenRef.current) return
				const older = (res.data as ActionEvt[]).slice().reverse()
				if (older.length) {
					lastChangeRef.current = 'prepend'
					setMsg((prev) => (prev ? [...older, ...prev] : older))
				}
				setCursor(res.cursorPagination?.nextCursor ?? undefined)
				setHasMore(res.cursorPagination?.hasMore ?? false)
			} catch (err) {
				console.error('Failed to load older messages', err)
			} finally {
				setLoadingOlder(false)
			}
		},
		[api, convId, cursor, hasMore, loadingOlder]
	)

	// Live messages from other clients (and our own server echo). Reconciliation
	// of optimistic rows happens in `send`/`retry` on create-success — the server
	// echo carries no client tempId, so it is deduped here by final actionId.
	useWsBus({ cmds: ['ACTION'] }, function handleAction(m) {
		const action = m.data as ActionEvt
		if (action.type !== 'MSG' || !convId || !auth?.idTag) return
		// Restrict to the open conversation.
		const belongs = isGroupId(convId)
			? action.parentId === convId
			: (action.issuer.idTag === convId && action.audience?.idTag === auth.idTag) ||
				(action.issuer.idTag === auth.idTag && action.audience?.idTag === convId)
		if (!belongs) return
		setMsg((prev) => {
			if (!prev) return [action]
			if (prev.some((x) => x.actionId === action.actionId)) return prev
			// Our own message echoed back: reconcile the optimistic row rather than
			// append. The echo carries no tempId, so match a still-unreconciled row
			// (actionId === tempId, since reconciliation replaces actionId with the real
			// id) by content — so two identical consecutive sends reconcile two distinct
			// rows instead of both matching the first.
			if (action.issuer.idTag === auth.idTag) {
				const idx = prev.findIndex(
					(x) =>
						x.tempId !== undefined &&
						x.actionId === x.tempId &&
						x.content === action.content
				)
				if (idx >= 0) {
					const updated = [...prev]
					updated[idx] = {
						...updated[idx],
						actionId: action.actionId,
						sendStatus: 'sent'
					}
					// The reconciled row is now the newest own message — advance the
					// own-inclusive ceiling so bottom-dwell can clear its phantom (M4).
					const ts = Math.min(createdAtToSeconds(action.createdAt), nowSeconds())
					setNewestListTs((p) => Math.max(p, ts))
					return updated
				}
			}
			// Genuine append of a live message: advance the read-marker ceilings so the
			// bottom-dwell / above-tracker can mark it read without a reload. Clamp to
			// now — a federation/received `createdAt` in the future must never be written
			// (that future-timestamp rejection is what the frozen caps guarded against).
			const ts = Math.min(createdAtToSeconds(action.createdAt), nowSeconds())
			setNewestListTs((p) => Math.max(p, ts))
			if (action.issuer.idTag !== auth.idTag) {
				setNewestListIncomingTs((p) => Math.max(p, ts))
			}
			lastChangeRef.current = 'append'
			return [...prev, action]
		})
	})

	const send = React.useCallback(
		async function send({
			content,
			attachmentIds
		}: {
			content: string
			attachmentIds: string[]
		}): Promise<boolean> {
			const conv = conversationRef.current
			if (!api || !auth?.idTag || !convId || !conv) return false
			const tempId = genTempId()
			const optimistic = {
				actionId: tempId,
				tempId,
				sendStatus: 'sending',
				type: 'MSG',
				subType: attachmentIds.length ? 'IMG' : 'TEXT',
				content,
				attachments: attachmentIds.length
					? attachmentIds.map((id) => ({ fileId: id }))
					: undefined,
				issuer: { name: auth.name ?? '', idTag: auth.idTag, profilePic: auth.profilePic },
				audience: undefined,
				createdAt: nowSeconds(),
				parentId: conv.type === 'group' ? convId : undefined
			} as ActionEvt
			lastChangeRef.current = 'append'
			setMsg((prev) => [...(prev || []), optimistic])
			// Own message is the newest — advance the own-inclusive ceiling so the
			// bottom-dwell clears the group's phantom badge without a reload (M4).
			setNewestListTs((p) => Math.max(p, createdAtToSeconds(optimistic.createdAt)))

			try {
				const res = await api.actions.create(
					buildNewAction(conv, convId, content, attachmentIds)
				)
				// Apply the real actionId to the optimistic row, and drop any other row
				// already carrying that actionId — the WS echo can beat this response and,
				// if the server normalized `content`, fall through to a genuine append;
				// this removes the resulting duplicate deterministically (L7).
				setMsg((prev) =>
					prev
						?.filter((mm) => !(mm.actionId === res.actionId && mm.tempId !== tempId))
						.map((mm) =>
							mm.tempId === tempId
								? {
										...mm,
										actionId: res.actionId,
										sendStatus: 'sent'
									}
								: mm
						)
				)
				return true
			} catch (err) {
				console.error('Failed to send message', err)
				setMsg((prev) =>
					prev?.map((mm) => (mm.tempId === tempId ? { ...mm, sendStatus: 'failed' } : mm))
				)
				return false
			}
		},
		[api, auth, convId]
	)

	const retry = React.useCallback(
		async function retry(tempId: string): Promise<void> {
			const conv = conversationRef.current
			if (!api || !convId || !conv) return
			let target: ActionEvt | undefined
			setMsg((prev) => {
				target = prev?.find((m) => m.tempId === tempId)
				return prev?.map((m) => (m.tempId === tempId ? { ...m, sendStatus: 'sending' } : m))
			})
			if (!target) return
			const attachmentIds = (target.attachments || []).map((a) =>
				typeof a === 'string' ? a : a.fileId
			)
			try {
				const res = await api.actions.create(
					buildNewAction(conv, convId, target.content, attachmentIds)
				)
				// Same duplicate guard as `send` (L7): drop any row already holding the
				// real actionId (a WS echo that slipped through) while reconciling ours.
				setMsg((prev) =>
					prev
						?.filter((mm) => !(mm.actionId === res.actionId && mm.tempId !== tempId))
						.map((mm) =>
							mm.tempId === tempId
								? {
										...mm,
										actionId: res.actionId,
										sendStatus: 'sent'
									}
								: mm
						)
				)
			} catch (err) {
				console.error('Failed to retry message', err)
				setMsg((prev) =>
					prev?.map((mm) => (mm.tempId === tempId ? { ...mm, sendStatus: 'failed' } : mm))
				)
			}
		},
		[api, convId]
	)

	return {
		msg,
		conversation,
		members,
		hasMore,
		loadingOlder,
		loadOlder,
		send,
		retry,
		markRead: advanceTo,
		unreadBoundaryTs,
		newestListIncomingTs,
		newestListTs,
		reload,
		lastChangeRef
	}
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { useApi, useAuth } from '@cloudillo/react'
import type { ActionView, NewAction } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { createdAtToSeconds, nowSeconds, useReadMarker } from '../../../read-position.js'
import { updateReactionCounts } from '../../feed/reactions.js'
import { useWsBus } from '../../../ws-bus.js'
import type {
	ActionEvt,
	ConvContent,
	Conversation,
	ConversationMember,
	MemberStatus
} from '../types.js'
import { getActionRole } from '../types.js'
import { genTempId, isConvEvent, isGroupId, mergeEvents } from '../utils.js'

const PAGE_SIZE = 30
// How long a jump target stays highlighted.
const HIGHLIGHT_MS = 2000

// What produced the most recent change to `msg`, so the consumer can decide how to
// scroll: 'init' = first page of a conversation, 'append' = a live/own message at the
// end (stick to bottom), 'prepend' = an older page at the top (preserve viewport),
// 'newer' = a newer page at the bottom of a non-live window (leave scroll alone),
// 'jump' = scroll to `highlightId`, 'latest' = the window was reset to the live edge
// (scroll to bottom).
export type MsgChangeKind = 'init' | 'append' | 'prepend' | 'newer' | 'jump' | 'latest'

export interface UseMessages {
	// Loaded window, oldest → newest; may end before the newest message (see `atLive`).
	msg: ActionEvt[] | undefined
	/** Group events loaded alongside the messages (oldest → newest); placed by `placeEvents` */
	events: ActionView[] | undefined
	conversation: Conversation | undefined
	members: ConversationMember[] | undefined
	/** Older pages exist above the window */
	hasMore: boolean
	loadingOlder: boolean
	loadOlder: () => void
	loadingNewer: boolean
	/** Load the next newer page (no-op at the live edge) */
	loadNewer: () => void
	/** The window ends at the newest message; live WS messages are appended only then */
	atLive: boolean
	/** Bring `actionId` into the window (fetching ~30 around it if unloaded) and highlight it */
	jumpTo: (actionId: string, createdAt?: number) => Promise<void>
	/** Reset the window to the newest page */
	jumpToLatest: () => Promise<boolean>
	/** Jump target, highlighted for 2 s */
	highlightId: string | undefined
	/** Bumped on every jump, so a repeat jump to the same target still scrolls */
	jumpSeq: number
	/** True once the message is queued (sent or a retryable failed bubble); false if nothing was queued */
	send: (input: SendInput) => Promise<boolean>
	/** Send a MSG quoting `replyTo` (carried in `subject`; parent/audience and result as `send`) */
	reply: (replyTo: string, input: SendInput) => Promise<boolean>
	/** MSG:UPD own message (optimistic; reverted on failure) */
	edit: (actionId: string, content: string) => Promise<boolean>
	/** MSG:DEL (own, or moderator+ in a group; optimistic; reverted on failure) */
	remove: (actionId: string) => Promise<boolean>
	/** REACT with one of the six keys; reacting with the current own reaction removes it */
	react: (actionId: string, reaction: string) => Promise<void>
	retry: (tempId: string) => Promise<void>
	markRead: (ts: number) => void
	unreadBoundaryTs: number | undefined
	// Read-marker cap: newest incoming ts, seeded from the list load then advanced by
	// live WS arrivals. Not clamped to the client clock: the backend clamps a future
	// `read_at` to now - 1.
	newestListIncomingTs: number
	// Newest message ts (including own), seeded from the list load then advanced by live
	// WS arrivals. Ceiling for the bottom-dwell "caught up" signal.
	newestListTs: number
	reload: () => void
	// The first-page load failure, cleared on every (re)load. `msg` stays `[]` meanwhile.
	error: unknown
	// Re-read the group header + members in place (no window reset).
	refreshGroupMeta: () => Promise<void>
	lastChangeRef: React.MutableRefObject<MsgChangeKind>
}

export interface SendInput {
	content: string
	attachmentIds: string[]
	/** `IMG` (image grid) or e.g. `FILE` (file card); default `IMG` with attachments, else `TEXT` */
	subType?: string
}

export function defaultSubType(subType: string | undefined, attachmentIds: string[]): string {
	return subType ?? (attachmentIds.length ? 'IMG' : 'TEXT')
}

// Reconcile the optimistic row with its real actionId. The WS echo can beat the create
// response and, if the server normalized `content`, land as a genuine append; drop that
// duplicate deterministically.
export function markSent(
	prev: ActionEvt[] | undefined,
	tempId: string,
	actionId: string
): ActionEvt[] | undefined {
	return prev
		?.filter((m) => !(m.actionId === actionId && m.tempId !== tempId))
		.map((m) => (m.tempId === tempId ? { ...m, actionId, sendStatus: 'sent' } : m))
}

// Only a still-unreconciled row: an echo that beat a client-side failure already sent it.
export function markFailed(prev: ActionEvt[] | undefined, tempId: string): ActionEvt[] | undefined {
	return prev?.map((m) =>
		m.tempId === tempId && m.actionId === m.tempId ? { ...m, sendStatus: 'failed' } : m
	)
}

// `fresh` plus the unreconciled optimistic rows of `from` (sending/failed bubbles) it
// lacks, so a window replace doesn't drop the only copy of a failed message.
export function keepPending(fresh: ActionEvt[], from: ActionEvt[] | undefined): ActionEvt[] {
	const ids = new Set(fresh.map((m) => m.actionId))
	const pending = (from ?? []).filter(
		(m) => m.tempId !== undefined && m.actionId === m.tempId && !ids.has(m.actionId)
	)
	return pending.length ? [...fresh, ...pending] : fresh
}

function buildNewAction(
	conversation: Conversation,
	convId: string,
	content: string,
	attachmentIds: string[],
	replyTo?: string,
	subType?: string
): NewAction {
	return {
		type: 'MSG',
		subType: defaultSubType(subType, attachmentIds),
		content,
		attachments: attachmentIds.length ? attachmentIds : undefined,
		// A reply names the quoted MSG as `subject`; the parent stays the CONV (a
		// MSG-parented MSG drops out of lists and counters).
		...(replyTo ? { subject: replyTo } : {}),
		// Groups thread under the CONV via parentId; DMs target the peer via audienceTag.
		...(conversation.type === 'group' ? { parentId: convId } : { audienceTag: convId })
	}
}

// Audience of edit / delete / react: the CONV owner relays them to every group member;
// a DM's go straight to the peer.
function opAudience(conversation: Conversation, convId: string): string | undefined {
	return conversation.type === 'group' ? conversation.ownerTag : convId
}

// Groups list the CONV's rows, messages and group events in one stream (`container`);
// DMs the messages involving the peer.
function convQuery(convId: string) {
	return isGroupId(convId)
		? { type: ['MSG', 'CONV', 'SUBS', 'INVT', 'PIN'], container: convId }
		: { type: 'MSG', involved: convId }
}

// A list page's messages and group events. MSG:UPD / MSG:DEL rewrite their target in
// place, so their own rows are never shown (dropped defensively, should the backend
// list them).
export function splitPage(data: unknown): { msgs: ActionEvt[]; events: ActionView[] } {
	const rows = data as ActionEvt[]
	return {
		msgs: rows.filter((a) => a.type === 'MSG' && a.subType !== 'UPD' && a.subType !== 'DEL'),
		events: rows.filter(isConvEvent)
	}
}

function isoSec(sec: number): string {
	return new Date(sec * 1000).toISOString()
}

// Newest incoming (non-own) message timestamp from an oldest→newest ordered list.
export function findNewestIncomingTs(ordered: ActionEvt[], ownIdTag: string | undefined): number {
	for (let i = ordered.length - 1; i >= 0; i--) {
		if (ordered[i].issuer.idTag !== ownIdTag) return createdAtToSeconds(ordered[i].createdAt)
	}
	return 0
}

// Newest message timestamp (including own) from an oldest→newest ordered list.
export function findNewestListTs(ordered: ActionEvt[]): number {
	const last = ordered[ordered.length - 1]
	return last ? createdAtToSeconds(last.createdAt) : 0
}

// Join the two halves of a jump window (each oldest → newest). Their widened bounds
// overlap on the target's second, so drop the repeated rows.
export function mergeWindow(older: ActionEvt[], newer: ActionEvt[]): ActionEvt[] {
	const have = new Set(older.map((m) => m.actionId))
	return [...older, ...newer.filter((m) => !have.has(m.actionId))]
}

// The group header and member list from the CONV, its active SUBS and its INVTs.
export function buildGroupMeta(
	convAction: ActionView,
	membersRes: ActionView[],
	invitesRes: ActionView[],
	t: (key: string) => string
): { conversation: Conversation; members: ConversationMember[] } {
	// libs/types' tConvContent lacks the join policy and avatar fields.
	const content = convAction.content as
		| (ConvContent & Pick<Conversation, 'picture' | 'join' | 'joinMinRole'>)
		| undefined

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
				invt.subType !== 'DEL' && invt.audience && !activeIdTags.has(invt.audience.idTag)
		)
		.map((invt) => ({
			profile: invt.audience!,
			role: getActionRole(invt),
			status: 'invited' as MemberStatus,
			actionId: invt.actionId,
			joinedAt: String(invt.createdAt)
		}))

	return {
		members: [...activeMembers, ...invitedMembers],
		conversation: {
			id: convAction.actionId,
			type: 'group',
			ownerTag: convAction.issuer.idTag,
			communityTag:
				convAction.issuer.type === 'community' ? convAction.issuer.idTag : undefined,
			name: content?.name || t('Unnamed Group'),
			description: content?.description,
			picture: content?.picture,
			join: content?.join,
			joinMinRole: content?.joinMinRole,
			profiles: activeMembers.map((m) => m.profile),
			memberCount: activeMembers.length,
			isOpen: convAction.flags?.includes('O') ?? false,
			editedBy: (convAction.x as { editedBy?: string } | undefined)?.editedBy,
			stat: convAction.stat,
			readerState: convAction.readerState
		}
	}
}

export function useMessages(convId: string | undefined): UseMessages {
	const { api } = useApi()
	const [auth] = useAuth()
	const { t } = useTranslation()

	const [msg, setMsg] = React.useState<ActionEvt[] | undefined>()
	const [events, setEvents] = React.useState<ActionView[] | undefined>()
	const [conversation, setConversation] = React.useState<Conversation | undefined>()
	const [members, setMembers] = React.useState<ConversationMember[] | undefined>()
	// Continuation cursors for the two window edges: older (desc) and newer (asc).
	const [olderCursor, setOlderCursor] = React.useState<string | undefined>()
	const [hasMore, setHasMore] = React.useState(false)
	const [loadingOlder, setLoadingOlder] = React.useState(false)
	const [newerCursor, setNewerCursor] = React.useState<string | undefined>()
	const [hasNewer, setHasNewer] = React.useState(false)
	const [loadingNewer, setLoadingNewer] = React.useState(false)
	const [highlightId, setHighlightId] = React.useState<string | undefined>()
	const [jumpSeq, setJumpSeq] = React.useState(0)
	const highlightTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	// Seed for the read marker: group → CONV readerState.readAt, DM → peer
	// profile.msgState.readAt. Set after the conversation loads.
	const [convReadSeed, setConvReadSeed] = React.useState<number | undefined>()
	// Reset the seed synchronously on conversation change (adjust-state-during-render):
	// convReadSeed otherwise updates only in the async load effect below, so useReadMarker
	// would run one render with the stale seed and its forward-only SEED effect would
	// poison the new conversation's read position.
	const seedConvIdRef = React.useRef(convId)
	if (seedConvIdRef.current !== convId) {
		seedConvIdRef.current = convId
		setConvReadSeed(undefined)
		// Never pair the old conversation/members with the new convId.
		setConversation(undefined)
		setMembers(undefined)
		setMsg(undefined)
		setEvents(undefined)
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
	const [error, setError] = React.useState<unknown>()

	const lastChangeRef = React.useRef<MsgChangeKind>('init')
	// Window generation: bumped whenever the window is replaced (conversation (re)load,
	// jump, jump-to-latest), so an in-flight page fetch for the previous window can't
	// splice foreign messages in or overwrite the new window's cursors.
	const loadGenRef = React.useRef(0)
	// Optimistic rows stashed by a jump off the live edge; fetchLatest puts them back.
	const pendingRef = React.useRef<ActionEvt[]>([])

	const atLive = !hasNewer
	// Read by the WS handler and send; set eagerly by fetchLatest ahead of the re-render.
	const atLiveRef = React.useRef(atLive)
	atLiveRef.current = atLive
	const msgRef = React.useRef(msg)
	msgRef.current = msg

	// A group CONV + its MSG children is structurally a post + comments, so reuse
	// the generic `thread` read-marker scope; DMs use the per-peer `msg` scope.
	const scopeKey = convId ? (isGroupId(convId) ? `thread:${convId}` : `msg:${convId}`) : ''
	const { advanceTo } = useReadMarker(scopeKey, convReadSeed)

	// Keep a stable reference for the WS handler and send/retry closures.
	const conversationRef = React.useRef(conversation)
	// Guard the render before the reset above lands (Conversation.id matches convId).
	conversationRef.current = conversation?.id === convId ? conversation : undefined

	React.useEffect(() => () => clearTimeout(highlightTimerRef.current), [])

	// Load conversation + initial (newest) page of messages.
	React.useEffect(
		function loadMessages() {
			const gen = ++loadGenRef.current
			setMsg(undefined)
			setEvents(undefined)
			setConversation(undefined)
			setMembers(undefined)
			setConvReadSeed(undefined)
			setUnreadBoundaryTs(undefined)
			setNewestListIncomingTs(0)
			setNewestListTs(0)
			setOlderCursor(undefined)
			setHasMore(false)
			setLoadingOlder(false)
			setNewerCursor(undefined)
			setHasNewer(false)
			setLoadingNewer(false)
			setHighlightId(undefined)
			setError(undefined)
			lastChangeRef.current = 'init'
			pendingRef.current = []
			if (!auth?.idTag || !convId || !api) return
			const ac = new AbortController()
			const latestQuery = {
				...convQuery(convId),
				sort: 'created' as const,
				sortDir: 'desc' as const,
				limit: PAGE_SIZE
			}
			// The newest page. A jump that already replaced the window wins (the caps
			// are set regardless: they describe the live edge, not the window).
			function applyLatest(
				res: Awaited<ReturnType<NonNullable<typeof api>['actions']['listPaginated']>>
			) {
				const page = splitPage(res.data)
				const ordered = page.msgs.reverse()
				setNewestListIncomingTs(findNewestIncomingTs(ordered, auth?.idTag))
				setNewestListTs(findNewestListTs(ordered))
				if (gen !== loadGenRef.current) return
				// Keep WS arrivals that beat the page in; position as an initial load.
				lastChangeRef.current = 'init'
				setMsg((prev) => (prev ? mergeWindow(ordered, prev) : ordered))
				setEvents((prev) => mergeEvents(prev, page.events))
				setOlderCursor(res.cursorPagination?.nextCursor ?? undefined)
				setHasMore(res.cursorPagination?.hasMore ?? false)
			}
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
							api.actions.listPaginated(latestQuery)
						])
						if (ac.signal.aborted) return
						if (convAction?.type !== 'CONV') {
							if (gen === loadGenRef.current) setMsg([])
							return
						}
						const meta = buildGroupMeta(convAction, membersRes, invitesRes, t)
						setMembers(meta.members)
						setConversation(meta.conversation)
						// Seed the group read marker from the CONV's comment watermark.
						setConvReadSeed(createdAtToSeconds(convAction.readerState?.readAt))

						applyLatest(res)
						// Boundary from the server-persisted watermark only: the in-memory
						// readPosition atom can be poisoned by WS messages (see
						// newestListIncomingTs), pushing it past every loaded message and
						// suppressing the divider forever.
						setUnreadBoundaryTs(createdAtToSeconds(convAction.readerState?.readAt))
					} else {
						// Profile fetch and the message page are independent → parallel.
						const [profile, res] = await Promise.all([
							api.profiles.get(convId),
							api.actions.listPaginated(latestQuery)
						])
						if (ac.signal.aborted) return
						setConversation({
							id: convId,
							type: 'direct',
							profiles: profile ? [profile] : []
						})
						// Seed the DM watermark from the peer's `P:MSG` reader-state row.
						setConvReadSeed(createdAtToSeconds(profile?.msgState?.readAt))

						applyLatest(res)
						// Boundary from the server-persisted watermark only (see group branch).
						setUnreadBoundaryTs(createdAtToSeconds(profile?.msgState?.readAt))
					}
				} catch (err) {
					if (ac.signal.aborted) return
					console.error('Failed to load messages', err)
					if (gen === loadGenRef.current) {
						setMsg([])
						setError(err)
					}
				}
			})()
			return () => ac.abort()
		},
		// `auth?.idTag`, not `auth`: a token renewal replaces the auth object.
		[auth?.idTag, convId, api, t, reloadKey]
	)

	// Re-read the group header and members in place after a group event. Unlike `reload`
	// it keeps the window and `conversation` mounted, so the composer's draft survives.
	const refreshGroupMeta = React.useCallback(
		async function refreshGroupMeta() {
			if (!api || !convId || !isGroupId(convId)) return
			try {
				const [convAction, membersRes, invitesRes] = await Promise.all([
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
					})
				])
				// Another conversation opened meanwhile.
				if (seedConvIdRef.current !== convId) return
				if (convAction?.type !== 'CONV') return reload()
				const meta = buildGroupMeta(convAction, membersRes, invitesRes, t)
				setMembers(meta.members)
				setConversation(meta.conversation)
			} catch (err) {
				console.error('Failed to refresh group', err)
			}
		},
		[api, convId, t, reload]
	)

	// Older-page pagination (scroll-up). Prepends the next older page and marks
	// the change as 'prepend' so the consumer preserves the viewport.
	const loadOlder = React.useCallback(
		async function loadOlder() {
			if (!api || !convId || !olderCursor || !hasMore || loadingOlder) return
			setLoadingOlder(true)
			const gen = loadGenRef.current
			try {
				const res = await api.actions.listPaginated({
					...convQuery(convId),
					sort: 'created',
					sortDir: 'desc',
					limit: PAGE_SIZE,
					cursor: olderCursor
				})
				// The window was replaced while the fetch was in flight — this page
				// belongs to the previous one, drop it.
				if (gen !== loadGenRef.current) return
				const page = splitPage(res.data)
				setEvents((prev) => mergeEvents(prev, page.events))
				const older = page.msgs.reverse()
				if (older.length) {
					lastChangeRef.current = 'prepend'
					setMsg((prev) => {
						if (!prev) return older
						const have = new Set(prev.map((m) => m.actionId))
						return [...older.filter((m) => !have.has(m.actionId)), ...prev]
					})
				}
				setOlderCursor(res.cursorPagination?.nextCursor ?? undefined)
				setHasMore(res.cursorPagination?.hasMore ?? false)
			} catch (err) {
				console.error('Failed to load older messages', err)
			} finally {
				if (gen === loadGenRef.current) setLoadingOlder(false)
			}
		},
		[api, convId, olderCursor, hasMore, loadingOlder]
	)

	// Newer-page pagination in a non-live window; the last page (hasMore false) rejoins live.
	const loadNewer = React.useCallback(
		async function loadNewer() {
			if (!api || !convId || !newerCursor || !hasNewer || loadingNewer) return
			setLoadingNewer(true)
			const gen = loadGenRef.current
			try {
				const res = await api.actions.listPaginated({
					...convQuery(convId),
					sort: 'created',
					sortDir: 'asc',
					limit: PAGE_SIZE,
					cursor: newerCursor
				})
				if (gen !== loadGenRef.current) return
				const page = splitPage(res.data)
				setEvents((prev) => mergeEvents(prev, page.events))
				const newer = page.msgs
				if (newer.length) {
					lastChangeRef.current = 'newer'
					setMsg((prev) => {
						if (!prev) return newer
						const have = new Set(prev.map((m) => m.actionId))
						return [...prev, ...newer.filter((m) => !have.has(m.actionId))]
					})
					const newest = findNewestListTs(newer)
					const incoming = findNewestIncomingTs(newer, auth?.idTag)
					setNewestListTs((p) => Math.max(p, newest))
					setNewestListIncomingTs((p) => Math.max(p, incoming))
				}
				// a live message landing between this last page's query and
				// atLive flipping true is neither listed nor appended; reopen shows it.
				setNewerCursor(res.cursorPagination?.nextCursor ?? undefined)
				setHasNewer(res.cursorPagination?.hasMore ?? false)
			} catch (err) {
				console.error('Failed to load newer messages', err)
			} finally {
				if (gen === loadGenRef.current) setLoadingNewer(false)
			}
		},
		[api, convId, newerCursor, hasNewer, loadingNewer, auth?.idTag]
	)

	function flash(actionId: string) {
		lastChangeRef.current = 'jump'
		setHighlightId(actionId)
		setJumpSeq((n) => n + 1)
		clearTimeout(highlightTimerRef.current)
		highlightTimerRef.current = setTimeout(() => setHighlightId(undefined), HIGHLIGHT_MS)
	}
	const flashRef = React.useRef(flash)
	flashRef.current = flash

	const jumpTo = React.useCallback(
		async function jumpTo(actionId: string, createdAt?: number): Promise<void> {
			if (!api || !convId) return
			if (msgRef.current?.some((m) => m.actionId === actionId)) {
				flashRef.current(actionId)
				return
			}
			const startGen = loadGenRef.current
			try {
				// A missing (0) timestamp is unknown. Resolve before bumping, so a bail-out
				// doesn't cancel in-flight paging; bail if another load replaced the window
				// meanwhile.
				let ts = createdAt && createdAt > 0 ? createdAt : undefined
				if (ts === undefined) {
					const target = await api.actions.get(actionId)
					if (!target) return
					ts = createdAtToSeconds(target.createdAt)
					if (!(ts > 0)) return
				}
				if (loadGenRef.current !== startGen) return
				const gen = ++loadGenRef.current
				setLoadingOlder(false)
				setLoadingNewer(false)
				// The bounds are strict (bound row excluded): widen each by 1 s so the
				// target and its same-second neighbours land in the window, then dedupe.
				const query = convQuery(convId)
				const [olderRes, newerRes] = await Promise.all([
					api.actions.listPaginated({
						...query,
						sort: 'created',
						sortDir: 'desc',
						createdBefore: isoSec(ts + 1),
						limit: PAGE_SIZE
					}),
					api.actions.listPaginated({
						...query,
						sort: 'created',
						sortDir: 'asc',
						createdAfter: isoSec(ts - 1),
						limit: PAGE_SIZE
					})
				])
				if (gen !== loadGenRef.current) return
				const older = splitPage(olderRes.data)
				const newer = splitPage(newerRes.data)
				// Off the live edge: stash the pending bubbles until fetchLatest.
				pendingRef.current = keepPending(pendingRef.current, msgRef.current)
				setMsg(mergeWindow(older.msgs.reverse(), newer.msgs))
				setEvents((prev) => mergeEvents(prev, [...older.events, ...newer.events]))
				setOlderCursor(olderRes.cursorPagination?.nextCursor ?? undefined)
				setHasMore(olderRes.cursorPagination?.hasMore ?? false)
				setNewerCursor(newerRes.cursorPagination?.nextCursor ?? undefined)
				setHasNewer(newerRes.cursorPagination?.hasMore ?? false)
				flashRef.current(actionId)
			} catch (err) {
				console.error('Failed to jump to message', err)
				// Our bump gated out an initial load still in flight: start it over.
				if (loadGenRef.current !== startGen && msgRef.current === undefined) reload()
			}
		},
		[api, convId, reload]
	)

	// Replace the window with the newest page ("Jump to latest", or a send off the live edge).
	const fetchLatest = React.useCallback(
		async function fetchLatest(): Promise<boolean> {
			if (!api || !convId) return false
			const gen = ++loadGenRef.current
			setLoadingOlder(false)
			setLoadingNewer(false)
			try {
				const res = await api.actions.listPaginated({
					...convQuery(convId),
					sort: 'created',
					sortDir: 'desc',
					limit: PAGE_SIZE
				})
				if (gen !== loadGenRef.current) return false
				lastChangeRef.current = 'latest'
				atLiveRef.current = true
				const page = splitPage(res.data)
				setMsg(
					keepPending(
						page.msgs.reverse(),
						keepPending(pendingRef.current, msgRef.current)
					)
				)
				pendingRef.current = []
				setEvents((prev) => mergeEvents(prev, page.events))
				setOlderCursor(res.cursorPagination?.nextCursor ?? undefined)
				setHasMore(res.cursorPagination?.hasMore ?? false)
				setNewerCursor(undefined)
				setHasNewer(false)
				return true
			} catch (err) {
				console.error('Failed to load latest messages', err)
				return false
			}
		},
		[api, convId]
	)

	// Live actions from other clients (and our own server echo). Reconciliation
	// of optimistic rows happens in `send`/`retry` on create-success — the server
	// echo carries no client tempId, so it is deduped here by final actionId.
	useWsBus({ cmds: ['ACTION'] }, function handleAction(m) {
		const action = m.data as ActionEvt
		if (!convId || !auth?.idTag) return
		const subject = action.subject

		// REACT on a loaded message: refetch it for the authoritative counts and
		// ownReaction (a changed reaction's previous type isn't on the wire).
		if ((action.type as string) === 'REACT') {
			if (!api || !subject || !msgRef.current?.some((x) => x.actionId === subject)) return
			api.actions
				.get(subject)
				.then((fresh) => {
					if (!fresh) return
					setMsg((prev) =>
						prev?.map((x) => (x.actionId === subject ? { ...x, stat: fresh.stat } : x))
					)
				})
				.catch((err) => console.error('Failed to refresh reactions', err))
			return
		}
		// A group event is appended at the live edge; a settings, membership or invitation
		// change also refreshes the header and members. A kick names the member's SUBS
		// rather than the CONV.
		if (isGroupId(convId) && isConvEvent(action)) {
			const isMemberSubs = (id: string) =>
				!!members?.some((m) => m.actionId === id) ||
				!!events?.some((e) => e.actionId === id && (e.type as string) === 'SUBS')
			const belongs =
				action.parentId === convId ||
				action.actionId === convId ||
				(!action.parentId && subject === convId) ||
				((action.type as string) === 'SUBS' && !!subject && isMemberSubs(subject))
			if (!belongs) return
			if (atLiveRef.current) setEvents((prev) => mergeEvents(prev, [action]))
			if ((action.type as string) !== 'PIN') refreshGroupMeta()
			return
		}
		if (action.type !== 'MSG') return

		// Edit / delete rewrite the target in place (as the backend does); a target
		// outside the window is simply not loaded.
		if (action.subType === 'UPD' || action.subType === 'DEL') {
			if (!subject) return
			const del = action.subType === 'DEL'
			setMsg((prev) =>
				prev?.map((x) => {
					if (x.actionId !== subject) return x
					return del
						? {
								...x,
								content: null,
								attachments: undefined,
								x: { ...x.x, deletedBy: action.issuer.idTag }
							}
						: {
								...x,
								content: action.content,
								x: { ...x.x, editedAt: createdAtToSeconds(action.createdAt) }
							}
				})
			)
			return
		}

		// Restrict to the open conversation.
		const belongs = isGroupId(convId)
			? action.parentId === convId
			: (action.issuer.idTag === convId && action.audience?.idTag === auth.idTag) ||
				(action.issuer.idTag === auth.idTag && action.audience?.idTag === convId)
		if (!belongs) return
		const own = action.issuer.idTag === auth.idTag
		// Advance the read-marker ceilings so the bottom-dwell / above-tracker can mark
		// it read without a reload (even off the live edge: it is a real message). No clamp
		// to the client clock (one running behind would never reach `lastAt`): the backend
		// clamps a future `read_at` to now - 1 (`patch_reader_state`).
		const ts = createdAtToSeconds(action.createdAt)
		setNewestListTs((p) => Math.max(p, ts))
		if (!own) setNewestListIncomingTs((p) => Math.max(p, ts))
		setMsg((prev) => {
			if (!prev) return [action]
			if (prev.some((x) => x.actionId === action.actionId)) return prev
			// Our own message echoed back: reconcile the optimistic row rather than
			// append. The echo carries no tempId, so match a still-unreconciled row
			// (actionId === tempId, since reconciliation replaces actionId with the real
			// id) by content — so two identical consecutive sends reconcile two distinct
			// rows instead of both matching the first.
			if (own) {
				const idx = prev.findIndex(
					(x) =>
						x.tempId !== undefined &&
						x.actionId === x.tempId &&
						(x.sendStatus === 'sending' || x.sendStatus === 'failed') &&
						x.content === action.content
				)
				if (idx >= 0) {
					const updated = [...prev]
					updated[idx] = {
						...updated[idx],
						actionId: action.actionId,
						sendStatus: 'sent'
					}
					return updated
				}
			}
			// Off the live edge the window doesn't end at the newest message: appending
			// would leave a gap; loadNewer / jumpToLatest pick it up.
			if (!atLiveRef.current) return prev
			lastChangeRef.current = 'append'
			return [...prev, action]
		})
	})

	const sendMsg = React.useCallback(
		async function sendMsg(
			{ content, attachmentIds, subType }: SendInput,
			replyTo?: string
		): Promise<boolean> {
			const conv = conversationRef.current
			if (!api || !auth?.idTag || !convId || !conv) return false
			// Sending rejoins the live edge first, so the new message isn't appended
			// after a gap (and doesn't send at all if that fails).
			const wasLive = atLiveRef.current
			if (!wasLive && !(await fetchLatest())) return false
			const tempId = genTempId()
			const optimistic = {
				actionId: tempId,
				tempId,
				sendStatus: 'sending',
				type: 'MSG',
				subType: defaultSubType(subType, attachmentIds),
				content,
				attachments: attachmentIds.length
					? attachmentIds.map((id) => ({ fileId: id }))
					: undefined,
				issuer: { name: auth.name ?? '', idTag: auth.idTag, profilePic: auth.profilePic },
				audience: undefined,
				createdAt: nowSeconds(),
				parentId: conv.type === 'group' ? convId : undefined,
				subject: replyTo
			} as ActionEvt
			lastChangeRef.current = wasLive ? 'append' : 'latest'
			setMsg((prev) => [...(prev || []), optimistic])
			// Own message is the newest — advance the own-inclusive ceiling so the
			// bottom-dwell clears the group's phantom badge without a reload (M4).
			setNewestListTs((p) => Math.max(p, createdAtToSeconds(optimistic.createdAt)))

			try {
				const res = await api.actions.create(
					buildNewAction(conv, convId, content, attachmentIds, replyTo, subType)
				)
				setMsg((prev) => markSent(prev, tempId, res.actionId))
				pendingRef.current = markSent(pendingRef.current, tempId, res.actionId) ?? []
				return true
			} catch (err) {
				console.error('Failed to send message', err)
				setMsg((prev) => markFailed(prev, tempId))
				pendingRef.current = markFailed(pendingRef.current, tempId) ?? []
				// Handed off: the failed bubble owns the content and offers retry.
				return true
			}
		},
		[api, auth, convId, fetchLatest]
	)
	const send = React.useCallback((input: SendInput) => sendMsg(input), [sendMsg])
	const reply = React.useCallback(
		(replyTo: string, input: SendInput) => sendMsg(input, replyTo),
		[sendMsg]
	)

	// Optimistically patch one loaded message; returns the row as it was, for revert.
	function patchMsg(actionId: string, patch: (m: ActionEvt) => ActionEvt): ActionEvt | undefined {
		const before = msgRef.current?.find((m) => m.actionId === actionId)
		setMsg((prev) => prev?.map((m) => (m.actionId === actionId ? patch(m) : m)))
		return before
	}
	const patchMsgRef = React.useRef(patchMsg)
	patchMsgRef.current = patchMsg
	function restore(before: ActionEvt | undefined) {
		if (before)
			setMsg((prev) => prev?.map((m) => (m.actionId === before.actionId ? before : m)))
	}

	const edit = React.useCallback(
		async function edit(actionId: string, content: string): Promise<boolean> {
			const conv = conversationRef.current
			if (!api || !convId || !conv) return false
			const before = patchMsgRef.current(actionId, (m) => ({
				...m,
				content,
				x: { ...m.x, editedAt: nowSeconds() }
			}))
			try {
				await api.actions.create({
					type: 'MSG',
					subType: 'UPD',
					subject: actionId,
					content,
					audienceTag: opAudience(conv, convId)
				})
				return true
			} catch (err) {
				console.error('Failed to edit message', err)
				restore(before)
				return false
			}
		},
		[api, convId]
	)

	const remove = React.useCallback(
		async function remove(actionId: string): Promise<boolean> {
			const conv = conversationRef.current
			if (!api || !convId || !conv || !auth?.idTag) return false
			const deletedBy = auth.idTag
			const before = patchMsgRef.current(actionId, (m) => ({
				...m,
				content: null,
				attachments: undefined,
				x: { ...m.x, deletedBy }
			}))
			try {
				await api.actions.create({
					type: 'MSG',
					subType: 'DEL',
					subject: actionId,
					audienceTag: opAudience(conv, convId)
				})
				return true
			} catch (err) {
				console.error('Failed to delete message', err)
				restore(before)
				return false
			}
		},
		[api, convId, auth?.idTag]
	)

	const react = React.useCallback(
		async function react(actionId: string, reaction: string): Promise<void> {
			const conv = conversationRef.current
			if (!api || !convId || !conv) return
			const target = msgRef.current?.find((m) => m.actionId === actionId)
			const prevOwn = target?.stat?.ownReaction
			const isRemove = reaction === prevOwn
			const before = patchMsgRef.current(actionId, (m) => {
				let reactions = m.stat?.reactions || ''
				if (prevOwn) reactions = updateReactionCounts(reactions, prevOwn, -1)
				if (!isRemove) reactions = updateReactionCounts(reactions, reaction, 1)
				return {
					...m,
					stat: { ...m.stat, reactions, ownReaction: isRemove ? undefined : reaction }
				}
			})
			try {
				await api.actions.create({
					type: 'REACT',
					subType: isRemove ? 'DEL' : reaction,
					subject: actionId,
					audienceTag: opAudience(conv, convId)
				})
			} catch (err) {
				console.error('Failed to react', err)
				restore(before)
				return
			}
			// Authoritative counts (other members may have reacted meanwhile). The
			// reaction itself was accepted, so a failed refetch keeps the optimistic one.
			try {
				const fresh = await api.actions.get(actionId)
				if (fresh) patchMsgRef.current(actionId, (m) => ({ ...m, stat: fresh.stat }))
			} catch (err) {
				console.error('Failed to refresh reactions', err)
			}
		},
		[api, convId]
	)

	const retry = React.useCallback(
		async function retry(tempId: string): Promise<void> {
			const conv = conversationRef.current
			if (!api || !convId || !conv) return
			const target = msgRef.current?.find((m) => m.tempId === tempId)
			if (!target) return
			setMsg((prev) =>
				prev?.map((m) => (m.tempId === tempId ? { ...m, sendStatus: 'sending' } : m))
			)
			const attachmentIds = (target.attachments || []).map((a) =>
				typeof a === 'string' ? a : a.fileId
			)
			try {
				const res = await api.actions.create(
					buildNewAction(
						conv,
						convId,
						target.content ?? '',
						attachmentIds,
						target.subject,
						target.subType
					)
				)
				setMsg((prev) => markSent(prev, tempId, res.actionId))
				pendingRef.current = markSent(pendingRef.current, tempId, res.actionId) ?? []
			} catch (err) {
				console.error('Failed to retry message', err)
				setMsg((prev) => markFailed(prev, tempId))
				pendingRef.current = markFailed(pendingRef.current, tempId) ?? []
			}
		},
		[api, convId]
	)

	return {
		msg,
		events,
		conversation,
		members,
		hasMore,
		loadingOlder,
		loadOlder,
		loadingNewer,
		loadNewer,
		atLive,
		jumpTo,
		jumpToLatest: fetchLatest,
		highlightId,
		jumpSeq,
		send,
		reply,
		edit,
		remove,
		react,
		retry,
		markRead: advanceTo,
		unreadBoundaryTs,
		newestListIncomingTs,
		newestListTs,
		reload,
		error,
		refreshGroupMeta,
		lastChangeRef
	}
}

// vim: ts=4

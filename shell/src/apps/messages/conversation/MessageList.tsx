// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { Divider, EmptyState, FAB, LoadMoreTrigger, SkeletonList } from '@cloudillo/react'
import type { ActionView, Profile } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcGroup, IcMessages, IcScrollToBottom } from '../../../icons.js'
import { createdAtToSeconds } from '../../../read-position.js'
import type { ActionEvt, ConversationMember } from '../types.js'
import type { ReceiptPoints } from '../hooks/useReceipts.js'
import { groupMessages, localDay, placeEvents } from '../utils.js'
import { EventLine } from './EventLine.js'
import type { MessageMenuSlots } from './MessageActions.js'
import { MessageBubble } from './MessageBubble.js'
import { ReadReceipts } from './ReadReceipts.js'

export interface MessageListProps {
	msg: ActionEvt[] | undefined
	/** Group events, drawn as lines between the messages (`UseMessages.events`) */
	events?: ActionView[]
	/** Names the members a role change or kick refers to */
	members?: ConversationMember[]
	convId?: string
	isGroup: boolean
	ownIdTag: string | undefined
	/** Index into `msg` of the first unread message (-1: none) */
	firstUnreadIdx: number
	unreadDividerRef: React.Ref<HTMLDivElement>
	highlightId: string | undefined
	/** Read-position tracker registration, passed to every bubble */
	register: (node: Element | null) => (() => void) | undefined
	onRetry: (tempId: string) => void
	/** Moderator+ in a group: may delete anyone's message */
	canModerate: boolean
	/** Whether a sender's `@all` notifies (renders as a pill) */
	allowAll: (idTag: string) => boolean
	onReact: (actionId: string, reaction: string) => void
	onReply: (action: ActionEvt) => void
	onEdit: (action: ActionEvt) => void
	onDelete: (action: ActionEvt) => void
	/** Reply quote → bring the original into the window (`UseMessages.jumpTo`) */
	onJumpTo: (actionId: string, createdAt?: number) => void
	/** Per-message Pin / "Seen by" menu items */
	menuSlots?: MessageMenuSlots
	/** Read receipts: group reader avatars per message, the DM "Seen" message (`receiptPoints`) */
	receipts?: ReceiptPoints
	/** Scroll container: IntersectionObserver root of the sentinels */
	root: HTMLElement | null
	hasOlder: boolean
	loadingOlder: boolean
	onLoadOlder: () => void
	atLive: boolean
	loadingNewer: boolean
	onLoadNewer: () => void
	/** Show the FAB: "Jump to latest" off the live edge, else "Scroll to bottom" */
	showFab: boolean
	onFabClick: () => void
}

// "Today" / "Yesterday" / "Mon 3 Nov" (+ year outside the current year), in the UI language.
function dayLabel(sec: number, lang: string, t: (s: string) => string): string {
	const d = new Date(sec * 1000)
	const today = new Date()
	const yesterday = new Date()
	yesterday.setDate(today.getDate() - 1)
	const day = localDay(sec)
	if (day === localDay(today.getTime() / 1000)) return t('Today')
	if (day === localDay(yesterday.getTime() / 1000)) return t('Yesterday')
	return d.toLocaleDateString(lang, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {})
	})
}

// Loads a page when it scrolls into view. Re-observed after every load, so a
// sentinel still on screen afterwards fires again.
function Sentinel({
	root,
	isLoading,
	onReach
}: {
	root: HTMLElement | null
	isLoading: boolean
	onReach: () => void
}) {
	const ref = React.useRef<HTMLDivElement>(null)
	const onReachRef = React.useRef(onReach)
	onReachRef.current = onReach
	React.useEffect(() => {
		const el = ref.current
		if (!root || !el || isLoading) return
		const ob = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) onReachRef.current()
			},
			{ root, threshold: 0 }
		)
		ob.observe(el)
		return () => ob.disconnect()
	}, [root, isLoading])
	return <LoadMoreTrigger ref={ref} hasMore isLoading={isLoading} />
}

export function MessageList({
	msg,
	events,
	members,
	convId,
	isGroup,
	ownIdTag,
	firstUnreadIdx,
	unreadDividerRef,
	highlightId,
	register,
	onRetry,
	canModerate,
	allowAll,
	onReact,
	onReply,
	onEdit,
	onDelete,
	onJumpTo,
	menuSlots,
	receipts,
	root,
	hasOlder,
	loadingOlder,
	onLoadOlder,
	atLive,
	loadingNewer,
	onLoadNewer,
	showFab,
	onFabClick
}: MessageListProps) {
	const { t, i18n } = useTranslation()
	const grouped = React.useMemo(() => groupMessages(msg || []), [msg])
	// Reply quotes resolve their original from the window when it is loaded.
	const byId = React.useMemo(() => new Map((msg || []).map((m) => [m.actionId, m])), [msg])
	const placed = React.useMemo(
		() => placeEvents(msg || [], events || [], { hasOlder, atLive }),
		[msg, events, hasOlder, atLive]
	)
	const memberOf = React.useMemo(() => {
		const bySubs = new Map<string, Profile>()
		for (const e of events || [])
			if ((e.type as string) === 'SUBS') bySubs.set(e.actionId, e.issuer)
		for (const m of members || []) bySubs.set(m.actionId, m.profile)
		return (subsId: string) => bySubs.get(subsId)
	}, [events, members])
	const eventLine = (e: ActionView) => (
		<EventLine key={e.actionId} event={e} convId={convId} memberOf={memberOf} />
	)

	return (
		<>
			{showFab && (
				<FAB
					size="sm"
					color="secondary"
					icon={<IcScrollToBottom />}
					aria-label={atLive ? t('Scroll to bottom') : t('Jump to latest')}
					onClick={onFabClick}
				/>
			)}
			{msg === undefined ? (
				<SkeletonList count={5} showAvatar />
			) : msg.length === 0 && !placed.after.length ? (
				<EmptyState
					fill
					icon={isGroup ? <IcGroup /> : <IcMessages />}
					title={t('No messages yet')}
					description={t('Start the conversation by sending a message!')}
				/>
			) : (
				<>
					{hasOlder && (
						<Sentinel root={root} isLoading={loadingOlder} onReach={onLoadOlder} />
					)}
					{grouped.map((g, i) => {
						const local = g.action.issuer.idTag === ownIdTag
						return (
							<React.Fragment key={g.action.tempId ?? g.action.actionId}>
								{g.newDay && (
									<Divider
										label={dayLabel(
											createdAtToSeconds(g.action.createdAt),
											i18n.language,
											t
										)}
										className="my-2"
									/>
								)}
								{i === firstUnreadIdx && (
									<Divider
										ref={unreadDividerRef}
										label={t('New messages')}
										color="primary"
										className="my-2"
									/>
								)}
								{placed.before[i].map(eventLine)}
								{/* biome-ignore lint/plugin/no-raw-intrinsic: ds-allow: display:contents jump anchor around the bubble */}
								<div
									data-msg-id={g.action.actionId}
									style={{ display: 'contents' }}
								>
									<MessageBubble
										register={register}
										action={g.action}
										local={local}
										showSender={isGroup && g.showSender && !local}
										showTimestamp={grouped[i + 1]?.showSender ?? true}
										highlighted={highlightId === g.action.actionId}
										replyTarget={
											g.action.subject
												? byId.get(g.action.subject)
												: undefined
										}
										canModerate={canModerate}
										allowAll={allowAll(g.action.issuer.idTag)}
										onRetry={onRetry}
										onReact={onReact}
										onReply={onReply}
										onEdit={onEdit}
										onDelete={onDelete}
										onJumpTo={onJumpTo}
										menuSlots={menuSlots}
									/>
								</div>
								{receipts && (
									<ReadReceipts
										readers={receipts.byMsg.get(g.action.actionId)}
										seen={receipts.seenId === g.action.actionId}
										local={local}
									/>
								)}
							</React.Fragment>
						)
					})}
					{placed.after.map(eventLine)}
					{!atLive && (
						<Sentinel root={root} isLoading={loadingNewer} onReach={onLoadNewer} />
					)}
				</>
			)}
		</>
	)
}

// vim: ts=4

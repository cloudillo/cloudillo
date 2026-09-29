// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Alert,
	Button,
	Divider,
	EmptyState,
	FAB,
	Fcd,
	Icon,
	IdentityTag,
	LoadMoreTrigger,
	PageHeader,
	ProfilePicture,
	SkeletonList,
	useApi,
	useAuth,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuMessagesSquare as IcConvList,
	LuUsers as IcGroup,
	LuInfo as IcInfo,
	LuArrowDownToLine as IcScrollBottom
} from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router-dom'

import { useCtx } from '../../context/index.js'
import {
	createdAtToSeconds,
	useBottomDwell,
	useReadPositionTracker,
	useScrollEngaged
} from '../../read-position.js'
import { FilterToggle } from '../../ui/FilterToggle.js'
import { messagesPath } from '../../routes.js'
import '@cloudillo/react/components.css'

import { ContactPickerDialog } from './components/ContactPickerDialog.js'
import { ConversationBar, type ConversationFilter } from './components/ConversationBar.js'
import { CreateGroupDialog } from './components/CreateGroupDialog.js'
import { GroupDetailsPanel } from './components/GroupDetailsPanel.js'
import { InviteMemberDialog } from './components/InviteMemberDialog.js'
import { Msg } from './components/Msg.js'
import { NewMsg } from './components/NewMsg.js'
import { useConversationMembersEnrichment, useConversations } from './hooks/useConversations.js'
import { useMessages } from './hooks/useMessages.js'
import { usePendingInvites } from './hooks/usePendingInvites.js'
import { groupMessages } from './utils.js'

// Distance (px) from the bottom within which we consider the user "at the
// bottom" and auto-stick to new messages.
const SCROLL_BOTTOM_THRESHOLD = 120

export function MessagesApp() {
	const { convId } = useParams()
	const navigate = useNavigate()
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const urlContext = useCtx().base

	// Below md the rail is a drawer; with no conversation the list renders in the
	// content column instead, so the drawer starts closed.
	const [showFilter, setShowFilter] = React.useState(false)
	const [showDetails, setShowDetails] = React.useState(false)
	const [showCreateGroup, setShowCreateGroup] = React.useState(false)
	const [showContactPicker, setShowContactPicker] = React.useState(false)
	const [showInviteMember, setShowInviteMember] = React.useState(false)
	const [filter, setFilter] = React.useState<ConversationFilter>({ tab: 'all' })
	const [scrollBottom, setScrollBottom] = React.useState(true)
	// True only AFTER the initial scroll has been positioned for the current
	// conversation. Gates the scroll-driven read trackers so the programmatic init
	// scroll can't trip the engagement gate and mark the thread read on open.
	const [positioned, setPositioned] = React.useState(false)

	const convRef = React.useRef<HTMLDivElement>(null)
	// The scroll container is also tracked as state: the read-position trackers
	// need it reactively as their IntersectionObserver `root` / scroll target.
	const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null)
	const setConvEl = React.useCallback((el: HTMLDivElement | null) => {
		convRef.current = el
		setScrollEl(el)
	}, [])
	const unreadDividerRef = React.useRef<HTMLDivElement>(null)
	const topSentinelRef = React.useRef<HTMLDivElement>(null)
	// Saved scroll position per conversation, for restoration on switch.
	const scrollPositions = React.useRef<Map<string, number>>(new Map())
	// scrollHeight captured just before an older-page prepend, to preserve viewport.
	const prevScrollHeightRef = React.useRef(0)

	const { conversations, reload: reloadConversations } = useConversations(filter.q)
	// Cosmetic group-member avatars/counts — only enriched while Messages is open.
	useConversationMembersEnrichment()
	const {
		msg,
		conversation,
		members,
		hasMore,
		loadingOlder,
		loadOlder,
		send,
		retry,
		markRead,
		unreadBoundaryTs,
		newestListIncomingTs,
		newestListTs,
		reload: reloadMessages,
		lastChangeRef
	} = useMessages(convId)
	const { pendingInvites, acceptInvite, rejectInvite } = usePendingInvites()

	const isGroup = conversation?.type === 'group'
	// The user has left the group when the members list has resolved and doesn't
	// include them (their only status-A SUBS is the DEL tombstone, filtered out of
	// `members`). History stays readable, but compose is hidden.
	const isLeftGroup =
		isGroup &&
		members !== undefined &&
		!!auth &&
		!members.some((m) => m.profile.idTag === auth.idTag)

	async function handleRejoin() {
		if (!api || !convId || !conversation?.ownerTag) return
		try {
			await api.actions.create({
				type: 'SUBS',
				subject: convId,
				audienceTag: conversation.ownerTag
			})
			reloadMessages()
			reloadConversations()
		} catch (err) {
			console.error('Failed to rejoin group', err)
		}
	}

	// Scroll-driven mark-read. `enabled` toggles false→true on each conversation
	// switch (useMessages sets `msg` to undefined then repopulates), which resets
	// the engagement gate so a passive landing never advances the marker.
	const trackerEnabled = !!convId && msg !== undefined && positioned
	const { engagedRef } = useScrollEngaged(trackerEnabled, scrollEl)
	// Cap the marker at `newestListIncomingTs` so a WS message's future createdAt can't
	// push a timestamp the backend rejects (see useMessages.newestListIncomingTs).
	const { register } = useReadPositionTracker({
		enabled: trackerEnabled,
		onReach: (ts) => markRead(Math.min(ts, newestListIncomingTs)),
		mode: 'above',
		engagedRef,
		root: scrollEl
	})
	// Reaching/dwelling at the bottom of the newest page means the user has seen the
	// newest message (own or not), so advance to the own-inclusive newestListTs — this
	// clears an own-last-message group phantom that the incoming cap can never reach.
	useBottomDwell({
		scrollEl,
		enabled: trackerEnabled,
		delayMs: 3000,
		recheckKey: newestListTs,
		onDwell: () => {
			if (newestListTs > 0) markRead(newestListTs)
		}
	})

	// A fresh load (conv switch or reload) sets msg→undefined; re-arm initial
	// positioning so trackers stay gated until the new conversation is positioned.
	React.useEffect(() => {
		if (msg === undefined) setPositioned(false)
	}, [msg])

	React.useEffect(() => {
		if (convId) setShowFilter(false)
	}, [convId])

	const conversationBarProps = {
		filter,
		setFilter,
		conversations,
		activeId: convId,
		onCreateGroup: () => setShowCreateGroup(true),
		onNewMessage: () => setShowContactPicker(true),
		pendingInvites,
		onAcceptInvite: handleAcceptInvite,
		onRejectInvite: rejectInvite
	}

	const grouped = React.useMemo(() => groupMessages(msg || []), [msg])

	// Index of the first unread message (indices align with `msg`).
	const firstUnreadIdx = React.useMemo(() => {
		// undefined boundary = still loading → no divider. A 0 boundary is real (a
		// never-opened conversation has no read marker), making every message unread.
		if (!msg || unreadBoundaryTs === undefined) return -1
		// First incoming message newer than the boundary. Skipping own messages
		// avoids a spurious divider when the only un-marked messages are ours.
		return msg.findIndex(
			(m) =>
				m.issuer.idTag !== auth?.idTag && createdAtToSeconds(m.createdAt) > unreadBoundaryTs
		)
	}, [msg, unreadBoundaryTs, auth?.idTag])

	function onLoadOlder() {
		if (convRef.current) prevScrollHeightRef.current = convRef.current.scrollHeight
		loadOlder()
	}
	const onLoadOlderRef = React.useRef(onLoadOlder)
	onLoadOlderRef.current = onLoadOlder

	// Top-sentinel IntersectionObserver: load the next older page on scroll-up.
	React.useEffect(() => {
		const root = convRef.current
		const sentinel = topSentinelRef.current
		if (!root || !sentinel || !hasMore) return
		const ob = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) onLoadOlderRef.current()
			},
			{ root, threshold: 0 }
		)
		ob.observe(sentinel)
		return () => ob.disconnect()
	}, [convId, hasMore])

	function onConvScroll() {
		const el = convRef.current
		if (!el) return
		const bottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
		if (scrollBottom && bottom > SCROLL_BOTTOM_THRESHOLD) setScrollBottom(false)
		if (!scrollBottom && bottom <= SCROLL_BOTTOM_THRESHOLD) setScrollBottom(true)
		if (convId) scrollPositions.current.set(convId, el.scrollTop)
	}

	function onConvScrollBottomClick() {
		setScrollBottom(true)
		convRef.current?.scrollTo({ top: convRef.current.scrollHeight, behavior: 'smooth' })
	}

	// Scroll management on message changes (init positioning, prepend preservation, append stick).
	React.useLayoutEffect(() => {
		const el = convRef.current
		if (!el || msg === undefined) return
		const kind = lastChangeRef.current
		if (kind === 'prepend') {
			// Older page prepended: keep the same content under the viewport.
			el.scrollTop += el.scrollHeight - prevScrollHeightRef.current
			lastChangeRef.current = 'append'
		} else if (kind === 'init') {
			// Defer initial positioning until the unread boundary has resolved, so the
			// "New messages" divider has rendered and we can scroll to it instead of
			// falling through to the bottom. Keep kind === 'init' so this effect re-runs
			// (via the unreadBoundaryTs dep) once the boundary lands.
			if (unreadBoundaryTs === undefined) return
			const saved = convId ? scrollPositions.current.get(convId) : undefined
			if (saved != null) {
				el.scrollTop = saved
			} else if (unreadDividerRef.current) {
				const d = unreadDividerRef.current
				const top =
					d.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
				el.scrollTop = Math.max(0, top - 8)
			} else {
				el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
			}
			const bottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
			setScrollBottom(bottom <= SCROLL_BOTTOM_THRESHOLD)
			lastChangeRef.current = 'append'
			// Unlock the scroll-driven trackers only AFTER the programmatic init scroll,
			// with a freshly-reset engagement gate, so the init scroll cannot mark read.
			setPositioned(true)
		} else if (kind === 'append' && scrollBottom) {
			// New/own message while at the bottom: stick to the bottom. The read
			// marker is advanced by the bottom-dwell timer, not here.
			el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [msg, unreadBoundaryTs])

	async function handleAcceptInvite(invite: Parameters<typeof acceptInvite>[0]) {
		const subject = await acceptInvite(invite)
		reloadConversations()
		if (subject) navigate(messagesPath(urlContext, subject))
	}

	return (
		<>
			<Fcd.Container className="g-1">
				{!!auth && (
					<>
						<Fcd.Filter
							className="messages-rail"
							isVisible={showFilter}
							hide={() => setShowFilter(false)}
						>
							<ConversationBar {...conversationBarProps} />
						</Fcd.Filter>
						<Fcd.Content
							ref={setConvEl}
							onScroll={onConvScroll}
							width="fluid"
							header={
								<PageHeader
									title={
										!conversation
											? t('Messages')
											: isGroup
												? conversation.name || t('Unnamed Group')
												: conversation.profiles[0]?.name ||
													conversation.profiles[0]?.idTag
									}
									leading={
										!conversation ? undefined : isGroup ? (
											<Icon as={IcGroup} />
										) : (
											conversation.profiles[0] && (
												<ProfilePicture
													profile={conversation.profiles[0]}
													size="sm"
												/>
											)
										)
									}
									subtitle={
										!conversation ? undefined : isGroup ? (
											t('{{count}} members', {
												count: conversation.memberCount
											})
										) : conversation.profiles[0] ? (
											<IdentityTag idTag={conversation.profiles[0].idTag} />
										) : undefined
									}
									actions={
										<>
											{!!convId && (
												<FilterToggle onClick={() => setShowFilter(true)} />
											)}
											{isGroup && (
												<Button
													variant="ghost"
													icon={<IcInfo />}
													aria-label={t('Group details')}
													className="lg-hide"
													onClick={() => setShowDetails(true)}
												/>
											)}
										</>
									}
								/>
							}
						>
							{!scrollBottom && (
								<FAB
									size="sm"
									color="secondary"
									icon={<IcScrollBottom />}
									aria-label={t('Scroll to bottom')}
									onClick={onConvScrollBottomClick}
								/>
							)}
							{!convId ? (
								<>
									<ConversationBar
										{...conversationBarProps}
										className="md-hide lg-hide"
									/>
									<EmptyState
										fill
										className="sm-hide"
										icon={<IcConvList />}
										title={t('Select a conversation')}
										description={t(
											'Choose a contact from the list to start messaging'
										)}
									/>
								</>
							) : msg === undefined ? (
								<SkeletonList count={5} showAvatar />
							) : msg.length === 0 ? (
								<EmptyState
									fill
									icon={isGroup ? <IcGroup /> : <IcConvList />}
									title={t('No messages yet')}
									description={t('Start the conversation by sending a message!')}
								/>
							) : (
								<>
									{hasMore && (
										<LoadMoreTrigger
											ref={topSentinelRef}
											hasMore
											isLoading={loadingOlder}
										/>
									)}
									{grouped.map((g, i) => {
										const local = g.action.issuer.idTag === auth?.idTag
										return (
											<React.Fragment
												key={g.action.tempId ?? g.action.actionId}
											>
												{i === firstUnreadIdx && (
													<Divider
														ref={unreadDividerRef}
														label={t('New messages')}
														color="primary"
														className="my-2"
													/>
												)}
												<Msg
													register={register}
													action={g.action}
													local={local}
													showSender={g.showSender && !local}
													showTimestamp={
														grouped[i + 1]?.showSender ?? true
													}
													onRetry={retry}
												/>
											</React.Fragment>
										)
									})}
								</>
							)}
							{/* Composer / left-group banner: sticky at the bottom of the message column */}
							{!!convId && conversation && (
								<VBox className="pos-sticky bottom-0 mt-auto pt-1">
									{isLeftGroup ? (
										<Alert
											color="neutral"
											compact
											actions={
												conversation.isOpen ? (
													<Button color="primary" onClick={handleRejoin}>
														{t('Rejoin')}
													</Button>
												) : undefined
											}
										>
											{t('You left this group')}
											{!conversation.isOpen &&
												` — ${t('This group is invite-only')}`}
										</Alert>
									) : (
										<NewMsg onSend={send} />
									)}
								</VBox>
							)}
						</Fcd.Content>

						{/* Group Details Panel */}
						<Fcd.Details isVisible={showDetails} hide={() => setShowDetails(false)}>
							{isGroup && conversation && auth.idTag && (
								<GroupDetailsPanel
									conversation={conversation}
									members={members}
									currentUserIdTag={auth.idTag}
									onClose={() => setShowDetails(false)}
									onInvite={() => setShowInviteMember(true)}
									onLeave={() => {
										setShowDetails(false)
										reloadConversations()
									}}
								/>
							)}
						</Fcd.Details>
					</>
				)}
			</Fcd.Container>

			{/* Create Group Dialog */}
			<CreateGroupDialog
				open={showCreateGroup}
				onClose={() => setShowCreateGroup(false)}
				onCreated={(newConvId) => {
					setShowCreateGroup(false)
					reloadConversations()
					navigate(messagesPath(urlContext, newConvId))
				}}
			/>

			{/* New-message contact picker */}
			<ContactPickerDialog
				open={showContactPicker}
				onClose={() => setShowContactPicker(false)}
				onPick={(idTag) => {
					setShowContactPicker(false)
					navigate(messagesPath(urlContext, idTag))
				}}
			/>

			{/* Invite Member Dialog */}
			{conversation && (
				<InviteMemberDialog
					open={showInviteMember}
					onClose={() => setShowInviteMember(false)}
					conversation={conversation}
					members={members}
					onInvited={() => {
						setShowInviteMember(false)
						reloadMessages()
					}}
				/>
			)}
		</>
	)
}

// vim: ts=4

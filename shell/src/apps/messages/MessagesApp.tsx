// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Badge,
	Button,
	EmptyState,
	Fcd,
	IdentityTag,
	LoadingSpinner,
	SkeletonList,
	useApi,
	useAuth
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

import { HOME_CONTEXT, useUrlContextIdTag } from '../../context/index.js'
import {
	createdAtToSeconds,
	useBottomDwell,
	useReadPositionTracker,
	useScrollEngaged
} from '../../read-position.js'
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
	const urlContext = useUrlContextIdTag()

	const [showFilter, setShowFilter] = React.useState(!convId)
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
		setShowFilter(!convId)
	}, [convId])

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
		if (subject) navigate(`/app/${urlContext || HOME_CONTEXT}/messages/${subject}`)
	}

	return (
		<>
			<Fcd.Container className="g-1">
				{!!auth && (
					<>
						<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
							<ConversationBar
								className="col col-md-4 col-lg-3 h-100"
								filter={filter}
								setFilter={setFilter}
								conversations={conversations}
								activeId={convId}
								onCreateGroup={() => setShowCreateGroup(true)}
								onNewMessage={() => setShowContactPicker(true)}
								pendingInvites={pendingInvites}
								onAcceptInvite={handleAcceptInvite}
								onRejectInvite={rejectInvite}
							/>
						</Fcd.Filter>
						<Fcd.Content
							ref={setConvEl}
							onScroll={onConvScroll}
							header={
								<div className="c-panel c-hbox align-items-center flex-nowrap g-2 p-2 w-100">
									<Button
										kind="link"
										className="md-hide lg-hide p-1 flex-shrink-0"
										onClick={() => setShowFilter(true)}
									>
										<IcConvList />
									</Button>
									{conversation && (
										<div className="c-hbox align-items-center g-2 fill overflow-hidden">
											{isGroup ? (
												<>
													<IcGroup className="flex-shrink-0" />
													<span className="fw-medium text-truncate">
														{conversation.name}
													</span>
													<Badge className="flex-shrink-0">
														{t('{{count}} members', {
															count: conversation.memberCount
														})}
													</Badge>
													<Button
														kind="link"
														className="lg-hide p-1 flex-shrink-0 ms-auto"
														title={t('Group details')}
														onClick={() => setShowDetails(true)}
													>
														<IcInfo />
													</Button>
												</>
											) : (
												conversation.profiles[0] && (
													<IdentityTag
														idTag={conversation.profiles[0].idTag}
													/>
												)
											)}
										</div>
									)}
								</div>
							}
						>
							{!scrollBottom && (
								<button
									className="c-button float m-1 secondary pos-absolute bottom-0 right-0"
									aria-label={t('Scroll to bottom')}
									onClick={onConvScrollBottomClick}
								>
									<IcScrollBottom />
								</button>
							)}
							{!convId ? (
								<EmptyState
									icon={<IcConvList style={{ fontSize: '2.5rem' }} />}
									title={t('Select a conversation')}
									description={t(
										'Choose a contact from the list to start messaging'
									)}
								/>
							) : msg === undefined ? (
								<SkeletonList count={5} showAvatar />
							) : msg.length === 0 ? (
								<EmptyState
									icon={
										isGroup ? (
											<IcGroup style={{ fontSize: '2.5rem' }} />
										) : (
											<IcConvList style={{ fontSize: '2.5rem' }} />
										)
									}
									title={t('No messages yet')}
									description={t('Start the conversation by sending a message!')}
								/>
							) : (
								<>
									{hasMore && <div ref={topSentinelRef} style={{ height: 1 }} />}
									{loadingOlder && (
										<div className="c-hbox justify-content-center p-2">
											<LoadingSpinner size="sm" />
										</div>
									)}
									{grouped.map((g, i) => {
										const local = g.action.issuer.idTag === auth?.idTag
										return (
											<React.Fragment
												key={g.action.tempId ?? g.action.actionId}
											>
												{i === firstUnreadIdx && (
													<div
														ref={unreadDividerRef}
														className="c-hbox align-items-center g-2 my-2 text-small fw-medium"
														style={{ color: 'var(--col-primary)' }}
													>
														<hr
															className="fill m-0"
															style={{
																borderColor: 'var(--col-primary)'
															}}
														/>
														<span className="flex-shrink-0">
															{t('New messages')}
														</span>
														<hr
															className="fill m-0"
															style={{
																borderColor: 'var(--col-primary)'
															}}
														/>
													</div>
												)}
												<Msg
													register={register}
													action={g.action}
													local={local}
													showSender={g.showSender && !local}
													showTimestamp={g.showTimestamp}
													onRetry={retry}
												/>
											</React.Fragment>
										)
									})}
								</>
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

			{/* Left-group banner (read-only history) */}
			{!!auth && !!convId && conversation && isLeftGroup && (
				<div className="c-panel c-hbox align-items-center g-2 p-2 mt-1">
					<span className="fill">{t('You left this group')}</span>
					{conversation.isOpen ? (
						<Button variant="primary" onClick={handleRejoin}>
							{t('Rejoin')}
						</Button>
					) : (
						<span className="text-muted text-small">
							{t('This group is invite-only')}
						</span>
					)}
				</div>
			)}

			{/* Message Input */}
			{!!auth && !!convId && conversation && !isLeftGroup && (
				<NewMsg className="mt-1" onSend={send} />
			)}

			{/* Create Group Dialog */}
			<CreateGroupDialog
				open={showCreateGroup}
				onClose={() => setShowCreateGroup(false)}
				onCreated={(newConvId) => {
					setShowCreateGroup(false)
					reloadConversations()
					navigate(`/app/${urlContext || HOME_CONTEXT}/messages/${newConvId}`)
				}}
			/>

			{/* New-message contact picker */}
			<ContactPickerDialog
				open={showContactPicker}
				onClose={() => setShowContactPicker(false)}
				onPick={(idTag) => {
					setShowContactPicker(false)
					navigate(`/app/${urlContext || HOME_CONTEXT}/messages/${idTag}`)
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

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	Alert,
	AvatarGroup,
	Button,
	DocBar,
	DropZone,
	Fcd,
	friendlyError,
	HBox,
	IcBack,
	IcInfo,
	IcPin,
	IcSearch,
	Icon,
	LoadError,
	MenuHeader,
	MenuItem,
	ProfilePicture,
	useApi,
	useAuth,
	useDialog,
	useIsMobile,
	useToast,
	VBox
} from '@cloudillo/react'
import { useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { contextRolesAtom } from '../../../context/index.js'
import { IcGroup, IcUnpin } from '../../../icons.js'
import {
	createdAtToSeconds,
	liveEdgeConvAtom,
	useBottomDwell,
	useReadPositionTracker,
	useScrollEngaged
} from '../../../read-position.js'
import { Composer } from '../composer/Composer.js'
import { useAttachments } from '../composer/useAttachments.js'
import { useConvPrefs } from '../hooks/useConvPrefs.js'
import { conversationsAtom, useConversationsReload } from '../hooks/useConversations.js'
import type { UseMessages } from '../hooks/useMessages.js'
import { receiptPoints, seenBy, useReceipts } from '../hooks/useReceipts.js'
import { useTypingSender } from '../hooks/useTyping.js'
import { ConvSearchField, useConvSearch } from '../details/SearchResults.js'
import type { ActionEvt } from '../types.js'
import { effectiveRole, myGroupRole } from '../types.js'
import type { MessageMenuSlots } from './MessageActions.js'
import { MessageList } from './MessageList.js'
import { PinBanner, usePins } from './PinBanner.js'
import { TypingLine } from './TypingLine.js'

// Px from the bottom that still counts as "at the bottom" (auto-stick to new messages).
const SCROLL_BOTTOM_THRESHOLD = 120

export interface ConversationViewProps {
	convId: string
	/** `useMessages(convId)`, owned by the host: the details panel shares it */
	messages: UseMessages
	/** Community roles of the members (`useCommunityMemberRoles`), owned by the host */
	memberRoles: Map<string, string[]>
	/** Saved scrollTop per conversation, owned by the host so it outlives this view */
	scrollPositions: Map<string, number>
	/** Shown below md: back to the inbox list */
	onBack?: () => void
	/** Details panel toggle (`?panel=details`): header title and info button, DMs and groups */
	onToggleDetails?: () => void
	detailsOpen?: boolean
}

export function ConversationView({
	convId,
	messages,
	memberRoles,
	scrollPositions,
	onBack,
	onToggleDetails,
	detailsOpen
}: ConversationViewProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const isMobile = useIsMobile()
	const toast = useToast()
	const [rejoining, setRejoining] = React.useState(false)
	const reloadConversations = useConversationsReload()
	const convPrefs = useConvPrefs()
	const listed = useAtomValue(conversationsAtom)?.find((c) => c.id === convId)
	const convPrefsRef = React.useRef(convPrefs)
	convPrefsRef.current = convPrefs
	const unreadClearedRef = React.useRef(false)

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
	// `msg` at the last scroll run, to tell a list change from a highlight-only re-run.
	const lastMsgRef = React.useRef<UseMessages['msg']>(undefined)
	// scrollHeight captured just before an older-page prepend, to preserve viewport.
	const prevScrollHeightRef = React.useRef(0)

	const {
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
		jumpToLatest,
		highlightId,
		jumpSeq,
		send,
		reply,
		edit,
		remove,
		react,
		retry,
		markRead,
		unreadBoundaryTs,
		newestListIncomingTs,
		newestListTs,
		reload: reloadMessages,
		error: loadError,
		lastChangeRef
	} = messages

	const isGroup = conversation?.type === 'group'
	// The user has left the group when the members list has resolved and doesn't
	// include them (their only status-A SUBS is the DEL tombstone, filtered out of
	// `members`). History stays readable, but compose is hidden.
	const isLeftGroup =
		isGroup &&
		members !== undefined &&
		!!auth &&
		!members.some((m) => m.profile.idTag === auth.idTag)

	const contextRoles = useAtomValue(contextRolesAtom)
	const community = conversation?.communityTag ?? listed?.communityTag
	const myRole = !isGroup
		? undefined
		: myGroupRole({
				ownerTag: conversation?.ownerTag,
				members,
				me: auth?.idTag,
				communityRoles: community ? contextRoles.get(community) : undefined,
				left: isLeftGroup
			})
	const canModerate = myRole === 'moderator' || myRole === 'admin'

	// `@all` notifies only from a moderator+ group member (the backend gate), by effective
	// role: SUBS role raised by community role. Until the community roles load, a sender
	// moderator+ only by community role renders a plain `@all`.
	const allowAll = React.useCallback(
		(idTag: string) =>
			isGroup &&
			(idTag === conversation?.ownerTag ||
				(idTag === auth?.idTag && canModerate) ||
				!!members?.some((m) => {
					if (m.profile.idTag !== idTag || m.status !== 'active') return false
					const role = effectiveRole(
						m.role,
						community ? memberRoles.get(idTag) : undefined
					)
					return role === 'moderator' || role === 'admin'
				})),
		[isGroup, conversation?.ownerTag, auth?.idTag, canModerate, members, community, memberRoles]
	)

	// Pins: moderator+ in groups, either person in DMs.
	const pins = usePins(conversation)
	const canPin = isGroup ? canModerate && !isLeftGroup : !!conversation
	// Read receipts: others' RCPTs placed at their read points.
	const receipts = useReceipts(conversation)
	const points = React.useMemo(
		() => receiptPoints(msg, receipts, auth?.idTag, isGroup),
		[msg, receipts, auth?.idTag, isGroup]
	)
	const menuSlots = React.useMemo<MessageMenuSlots>(
		() => ({
			pin: canPin
				? (a) =>
						a.actionId === a.tempId ? null : pins.isPinned(a.actionId) ? (
							<MenuItem
								icon={<IcUnpin />}
								label={t('Unpin')}
								onClick={() => pins.unpin(a.actionId)}
							/>
						) : (
							<MenuItem
								icon={<IcPin />}
								label={t('Pin')}
								onClick={() => pins.pin(a.actionId)}
							/>
						)
				: undefined,
			seenBy: isGroup
				? (a) => {
						const readers = seenBy(a, receipts)
						if (a.actionId === a.tempId || !readers.length) return null
						return (
							<>
								<MenuHeader>
									{t('Seen by {{count}}', { count: readers.length })}
								</MenuHeader>
								{readers.slice(0, 8).map((r) => (
									<MenuItem
										key={r.idTag}
										disabled
										icon={<ProfilePicture profile={r} size="xs" />}
										label={r.name || r.idTag}
									/>
								))}
								{readers.length > 8 && (
									<MenuItem
										disabled
										label={t('and {{count}} more', {
											count: readers.length - 8
										})}
									/>
								)}
							</>
						)
					}
				: undefined
		}),
		[canPin, pins, isGroup, receipts, t]
	)
	// In-conversation search: the header swaps for the field; results in details.
	const search = useConvSearch(convId)
	function startSearch() {
		search.open()
		if (!detailsOpen) onToggleDetails?.()
	}
	// `@` autocomplete: groups only, active members other than me.
	const mentionMembers = React.useMemo(
		() =>
			isGroup
				? members
						?.filter((m) => m.status === 'active' && m.profile.idTag !== auth?.idTag)
						.map((m) => m.profile)
				: undefined,
		[isGroup, members, auth?.idTag]
	)
	const onTyping = useTypingSender(convId, conversation)

	// Reply / edit target, set from the message actions; the Composer renders the bars.
	const [replyTo, setReplyTo] = React.useState<ActionEvt | undefined>()
	const [editing, setEditing] = React.useState<ActionEvt | undefined>()
	// Deps: reset on conversation switch
	React.useEffect(() => {
		setReplyTo(undefined)
		setEditing(undefined)
	}, [convId])
	const onReply = React.useCallback((a: ActionEvt) => {
		setEditing(undefined)
		setReplyTo(a)
	}, [])
	const onEdit = React.useCallback((a: ActionEvt) => {
		setReplyTo(undefined)
		setEditing(a)
	}, [])
	const dialog = useDialog()
	const dialogRef = React.useRef(dialog)
	dialogRef.current = dialog
	const onDelete = React.useCallback(
		async (a: ActionEvt) => {
			const ok = await dialogRef.current.confirm(
				t('Delete message?'),
				t('The message is removed for everyone in this conversation.'),
				{ color: 'error', confirmLabel: t('Delete') }
			)
			if (ok) await remove(a.actionId)
		},
		[remove, t]
	)
	const clearTarget = React.useCallback(() => {
		setReplyTo(undefined)
		setEditing(undefined)
	}, [])
	// Owned here so the conversation-wide drop zone feeds the composer's attachments.
	const attachments = useAttachments()
	const canAttach = !!conversation && !isLeftGroup && !editing

	async function handleRejoin() {
		if (!api || !convId || !conversation?.ownerTag) return
		setRejoining(true)
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
			toast.error(friendlyError(t, err))
		} finally {
			setRejoining(false)
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
		// Off the live edge the bottom of the window is not the newest message.
		enabled: trackerEnabled && atLive,
		delayMs: 3000,
		recheckKey: newestListTs,
		onDwell: () => {
			if (newestListTs > 0) markRead(newestListTs)
		}
	})

	// Tell the inbox unread counter that live MSGs here are seen (same gate as the dwell).
	const setLiveEdgeConv = useSetAtom(liveEdgeConvAtom)
	const liveEdge = trackerEnabled && atLive
	React.useEffect(() => {
		if (!liveEdge) return
		setLiveEdgeConv(convId)
		return () => setLiveEdgeConv((cur) => (cur === convId ? undefined : cur))
	}, [liveEdge, convId, setLiveEdgeConv])

	// A fresh load (conv switch or reload) sets msg→undefined; re-arm initial
	// positioning so trackers stay gated until the new conversation is positioned.
	React.useEffect(() => {
		if (msg === undefined) setPositioned(false)
	}, [msg])

	// Opening a manually-unread conversation clears the flag: the backend only drops
	// it when readAt advances, which never happens if everything was already read.
	// Once per open: waits for `listed` (deep links land before the list), then stays
	// cleared until `positioned` drops on a switch, so "Mark unread" on the open
	// conversation sticks across list refreshes and token renewals.
	React.useEffect(() => {
		if (!positioned) {
			unreadClearedRef.current = false
			return
		}
		if (unreadClearedRef.current || !listed) return
		unreadClearedRef.current = true
		if (listed.readerState?.unreadFlag) {
			convPrefsRef.current(listed, { unreadFlag: null }).catch(() => {})
		}
	}, [positioned, listed])

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

	function onConvScroll() {
		const el = convRef.current
		if (!el) return
		const bottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
		if (scrollBottom && bottom > SCROLL_BOTTOM_THRESHOLD) setScrollBottom(false)
		if (!scrollBottom && bottom <= SCROLL_BOTTOM_THRESHOLD) setScrollBottom(true)
		// Only once positioned: the skeleton's shrink clamps `scrollTop`, and saving that
		// under the new convId would make the init branch restore it.
		if (convId && msg !== undefined && positioned) scrollPositions.set(convId, el.scrollTop)
	}

	function onConvScrollBottomClick() {
		// Off the live edge, reload the newest page (the effect below scrolls to it).
		if (!atLive) {
			jumpToLatest()
			return
		}
		setScrollBottom(true)
		convRef.current?.scrollTo({ top: convRef.current.scrollHeight, behavior: 'smooth' })
	}

	// Scroll management on message changes (init positioning, prepend preservation, append stick).
	React.useLayoutEffect(() => {
		const el = convRef.current
		if (!el || msg === undefined) return
		const msgChanged = msg !== lastMsgRef.current
		lastMsgRef.current = msg
		const kind = lastChangeRef.current
		if (kind === 'jump') {
			// Jump target (loaded or freshly fetched window): centre it.
			const target = highlightId
				? el.querySelector(`[data-msg-id="${CSS.escape(highlightId)}"] > *`)
				: null
			target?.scrollIntoView({ block: 'center', behavior: 'instant' })
			const bottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
			setScrollBottom(bottom <= SCROLL_BOTTOM_THRESHOLD)
			lastChangeRef.current = 'append'
			// A jump can land before the initial positioning (opened via a jump): it is
			// the programmatic positioning then.
			setPositioned(true)
		} else if (kind === 'latest') {
			el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
			setScrollBottom(true)
			lastChangeRef.current = 'append'
		} else if (kind === 'newer') {
			// Newer page appended below a non-live window: leave the viewport alone (a
			// bottom stick here would chain-load every page up to live).
		} else if (kind === 'prepend') {
			// Older page prepended: keep the same content under the viewport.
			el.scrollTop += el.scrollHeight - prevScrollHeightRef.current
			lastChangeRef.current = 'append'
		} else if (kind === 'init') {
			// Defer initial positioning until the unread boundary has resolved, so the
			// "New messages" divider has rendered and we can scroll to it instead of
			// falling through to the bottom. Keep kind === 'init' so this effect re-runs
			// (via the unreadBoundaryTs dep) once the boundary lands.
			if (unreadBoundaryTs === undefined) return
			const saved = convId ? scrollPositions.get(convId) : undefined
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
		} else if (kind === 'append' && scrollBottom && msgChanged) {
			// New/own message while at the bottom: stick to the bottom. The read
			// marker is advanced by the bottom-dwell timer, not here.
			el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [msg, unreadBoundaryTs, highlightId, jumpSeq])

	const avatar = !conversation ? undefined : isGroup ? (
		<Icon as={IcGroup} />
	) : (
		conversation.profiles[0] && <ProfilePicture profile={conversation.profiles[0]} size="sm" />
	)
	const titleText = !conversation
		? t('Messages')
		: isGroup
			? conversation.name || t('Unnamed Group')
			: conversation.profiles[0]?.name || conversation.profiles[0]?.idTag
	const activeMembers = isGroup ? (members?.filter((m) => m.status === 'active') ?? []) : []

	return (
		<Fcd.Content
			ref={setConvEl}
			onScroll={onConvScroll}
			layout="column"
			width="wide"
			surface="raised"
			header={
				<>
					{search.active ? (
						<HBox gap={1} align="center" className="p-2">
							{onBack && (
								<Button
									variant="ghost"
									icon={<IcBack />}
									aria-label={t('Back')}
									onClick={onBack}
								/>
							)}
							<ConvSearchField convId={convId} autoFocus />
						</HBox>
					) : (
						<DocBar
							title={titleText}
							state={conversation ? 'ready' : 'loading'}
							start={
								<>
									{onBack && (
										<Button
											variant="ghost"
											icon={<IcBack />}
											aria-label={t('Back')}
											onClick={onBack}
										/>
									)}
									{avatar}
								</>
							}
						>
							{conversation && onToggleDetails && (
								<>
									{/* Group members, not live presence: messages has no presence feed */}
									{isGroup && activeMembers.length > 0 && (
										<Button
											variant="ghost"
											aria-label={t('{{count}} members', {
												count: activeMembers.length
											})}
											aria-expanded={!!detailsOpen}
											onClick={onToggleDetails}
										>
											<AvatarGroup max={isMobile ? 2 : 4} size="xs">
												{activeMembers.map((m) => (
													<ProfilePicture
														key={m.profile.idTag}
														profile={m.profile}
														size="xs"
													/>
												))}
											</AvatarGroup>
										</Button>
									)}
									<Button
										variant="ghost"
										icon={<IcSearch />}
										aria-label={t('Search in this conversation')}
										onClick={startSearch}
									/>
									<Button
										variant="ghost"
										icon={<IcInfo />}
										aria-label={
											isGroup ? t('Group details') : t('Conversation details')
										}
										aria-pressed={!!detailsOpen}
										onClick={onToggleDetails}
									/>
								</>
							)}
						</DocBar>
					)}
					<PinBanner pins={pins.pins} onJump={jumpTo} />
				</>
			}
		>
			{loadError && msg?.length === 0 ? (
				<LoadError
					error={loadError}
					onRetry={reloadMessages}
					title={t("Couldn't load messages")}
				/>
			) : (
				<MessageList
					menuSlots={menuSlots}
					receipts={points}
					msg={msg}
					events={events}
					members={members}
					convId={convId}
					isGroup={isGroup}
					ownIdTag={auth?.idTag}
					firstUnreadIdx={firstUnreadIdx}
					unreadDividerRef={unreadDividerRef}
					highlightId={highlightId}
					register={register}
					onRetry={retry}
					canModerate={canModerate}
					allowAll={allowAll}
					onReact={react}
					onReply={onReply}
					onEdit={onEdit}
					onDelete={onDelete}
					onJumpTo={jumpTo}
					root={scrollEl}
					hasOlder={hasMore}
					loadingOlder={loadingOlder}
					onLoadOlder={onLoadOlder}
					atLive={atLive}
					loadingNewer={loadingNewer}
					onLoadNewer={loadNewer}
					showFab={!scrollBottom || !atLive}
					onFabClick={onConvScrollBottomClick}
				/>
			)}
			{/* Composer / left-group banner: sticky at the bottom of the message column */}
			{conversation && (
				<VBox className="pos-sticky bottom-0 mt-auto pt-1">
					{isLeftGroup ? (
						<Alert
							color="neutral"
							compact
							actions={
								conversation.isOpen ? (
									<Button
										color="primary"
										loading={rejoining}
										onClick={handleRejoin}
									>
										{t('Rejoin')}
									</Button>
								) : undefined
							}
						>
							{t('You left this group')}
							{!conversation.isOpen && ` — ${t('This group is invite-only')}`}
						</Alert>
					) : (
						<>
							<TypingLine convId={convId} />
							<Composer
								convId={convId}
								attachments={attachments}
								replyTo={replyTo}
								editing={editing}
								onClearTarget={clearTarget}
								send={send}
								reply={reply}
								edit={edit}
								mentionMembers={mentionMembers}
								canMentionAll={canModerate}
								onTyping={onTyping}
							/>
						</>
					)}
				</VBox>
			)}
			{/* Viewport overlay: a parent-target wrapper would break the sticky composer's
			    flex column inside Fcd.Content. */}
			<DropZone
				variant="overlay"
				target="viewport"
				disabled={!canAttach}
				onFiles={attachments.add}
			/>
		</Fcd.Content>
	)
}

// vim: ts=4

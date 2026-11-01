// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	Alert,
	Badge,
	Button,
	Dialog,
	Disclosure,
	EmptyState,
	HBox,
	IcOffline,
	Icon,
	List,
	ListItem,
	LoadError,
	Panel,
	SearchInput,
	SkeletonList,
	Tag,
	Text,
	useApi,
	VBox
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { activeContextAtom } from '../../../context/atoms.js'
import { useCtx } from '../../../context/index.js'
import { IcCompose, IcGroup, IcInvitation, IcMessages } from '../../../icons.js'
import { unreadCountAtom } from '../../../read-position.js'
import { messagesPath } from '../../../routes.js'
import { CommunityGroupsBrowser, useIsCommunityMember } from '../details/CommunityGroupsBrowser.js'
import { conversationsErrorAtom, useConversations } from '../hooks/useConversations.js'
import type { UsePendingInvites } from '../hooks/usePendingInvites.js'
import type { Conversation } from '../types.js'
import { InboxRow } from './InboxRow.js'
import { InvitationsView } from './InvitationsView.js'
import { rowUnread } from './RowActions.js'

type InboxFilter = 'all' | 'unread' | 'groups'

export interface InboxListProps {
	activeId?: string
	invites: UsePendingInvites
	onNewChat: () => void
}

function subscribeOnline(cb: () => void) {
	window.addEventListener('online', cb)
	window.addEventListener('offline', cb)
	return () => {
		window.removeEventListener('online', cb)
		window.removeEventListener('offline', cb)
	}
}

function Rows({
	list,
	activeId,
	requests
}: {
	list: Conversation[]
	activeId?: string
	requests: Record<string, number>
}) {
	return (
		<List className="inbox-list">
			{list.map((c) => (
				<InboxRow
					key={c.id}
					conversation={c}
					selected={activeId === c.id}
					requests={requests[c.id]}
				/>
			))}
		</List>
	)
}

// The unified inbox: search + New chat, All/Unread/Groups chips,
// the community context chip, Invitations row, Pinned, the recency list and Archived.
export function InboxList({ activeId, invites, onNewChat }: InboxListProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const ctx = useCtx()
	const activeContext = useAtomValue(activeContextAtom)
	const counts = useAtomValue(unreadCountAtom)
	const online = React.useSyncExternalStore(subscribeOnline, () => navigator.onLine)
	const [q, setQ] = React.useState<string>()
	const [filter, setFilter] = React.useState<InboxFilter>('all')
	// The chip is on by default in a community context; removing it holds until the
	// context changes (a different community brings its own chip back).
	const [chipRemovedFor, setChipRemovedFor] = React.useState<string>()
	// local state, not a URL level — browser back from here leaves the list.
	const [showInvites, setShowInvites] = React.useState(false)
	const { conversations, reload } = useConversations(q)
	const loadFailed = useAtomValue(conversationsErrorAtom)

	const communityTag = !ctx.isHome ? activeContext?.idTag : undefined
	const chipTag = communityTag && chipRemovedFor !== communityTag ? communityTag : undefined
	const inviteCount = invites.pendingInvites?.length ?? 0
	const isMember = useIsCommunityMember(communityTag)
	const [showBrowse, setShowBrowse] = React.useState(false)

	// Pending knocks the viewer can answer, per CONV, read once from the
	// community node while the chip is on (the list filter returns only answerable ones).
	const { api: chipApi } = useApi(chipTag)
	const [requests, setRequests] = React.useState<Record<string, number>>({})
	React.useEffect(() => {
		setRequests({})
		if (!chipApi || !chipTag) return
		let live = true
		;(chipApi.actions.list({ type: 'SUBS', status: 'C' }) as Promise<ActionView[]>)
			.then((res) => {
				if (!live) return
				const n: Record<string, number> = {}
				for (const s of res) {
					if (s.subject) n[s.subject] = (n[s.subject] ?? 0) + 1
				}
				setRequests(n)
			})
			.catch((err) => console.error('Failed to load join requests', err))
		return () => {
			live = false
		}
	}, [chipApi, chipTag])

	const visible = conversations?.filter(
		(c) =>
			(filter !== 'groups' || c.type === 'group') &&
			(filter !== 'unread' || rowUnread(counts, c) > 0 || !!c.readerState?.unreadFlag) &&
			(!chipTag || c.communityTag === chipTag)
	)
	const pinned = visible?.filter((c) => c.pinned && !c.archived && !c.left) ?? []
	const main = visible?.filter((c) => !c.pinned && !c.archived && !c.left) ?? []
	// Left groups (read-only history) sit with the archived ones.
	const archived = visible?.filter((c) => c.archived || c.left) ?? []
	const narrowed = !!q || filter !== 'all' || !!chipTag

	async function acceptInvite(invite: ActionView) {
		const subject = await invites.acceptInvite(invite)
		reload()
		if (subject) {
			setShowInvites(false)
			navigate(messagesPath(ctx.base, subject))
		}
	}

	if (showInvites) {
		return (
			<InvitationsView
				invites={invites.pendingInvites}
				onAccept={acceptInvite}
				onDecline={invites.rejectInvite}
				onBack={() => setShowInvites(false)}
			/>
		)
	}

	const chips: [InboxFilter, string][] = [
		['all', t('All')],
		['unread', t('Unread')],
		['groups', t('Groups')]
	]

	return (
		<VBox gap={1} className="h-100">
			<Panel variant="plain" padding={2}>
				<HBox align="center" gap={1}>
					<SearchInput
						className="flex-fill w-min-0"
						placeholder={t('Search conversations...')}
						aria-label={t('Search conversations...')}
						debounce={300}
						onSearch={setQ}
					/>
					<Button
						variant="ghost"
						icon={<IcCompose />}
						aria-label={t('New chat')}
						onClick={onNewChat}
					/>
					{isMember && communityTag && (
						<>
							<Button
								variant="ghost"
								icon={<IcGroup />}
								aria-label={t('Browse community groups')}
								onClick={() => setShowBrowse(true)}
							/>
							<Dialog
								open={showBrowse}
								onClose={() => setShowBrowse(false)}
								size="sm"
								title={t('Community group chats')}
							>
								<CommunityGroupsBrowser
									communityTag={communityTag}
									onJoined={(convId) => {
										setShowBrowse(false)
										reload()
										navigate(messagesPath(ctx.base, convId))
									}}
								/>
							</Dialog>
						</>
					)}
				</HBox>
				<HBox gap={1} wrap align="center" className="mt-2">
					{chips.map(([value, label]) => (
						<Tag
							key={value}
							pressed={filter === value}
							onClick={() => setFilter(value)}
						>
							{label}
						</Tag>
					))}
					{chipTag && (
						<Tag
							color="secondary"
							onRemove={() => setChipRemovedFor(chipTag)}
							removeLabel={t('Show all conversations')}
						>
							@{chipTag}
						</Tag>
					)}
				</HBox>
			</Panel>

			{!online && (
				<Alert color="warning" compact icon={<IcOffline />}>
					{t('You are offline. The list may be out of date.')}
				</Alert>
			)}
			{invites.error && (
				<Alert
					color="error"
					compact
					actions={
						<Button size="sm" onClick={invites.reload}>
							{t('Retry')}
						</Button>
					}
				>
					{t('Could not load invitations')}
				</Alert>
			)}

			<Panel variant="plain" className="flex-fill overflow-y-auto">
				{inviteCount > 0 && (
					<List>
						<ListItem
							leading={<Icon as={IcInvitation} />}
							title={t('Invitations')}
							onClick={() => setShowInvites(true)}
							trailing={
								<Badge
									color="accent"
									aria-label={t('{{count}} pending', { count: inviteCount })}
								>
									{inviteCount}
								</Badge>
							}
						/>
					</List>
				)}
				{!visible ? (
					<SkeletonList count={5} showAvatar />
				) : loadFailed && !conversations?.length ? (
					<LoadError
						error={loadFailed}
						onRetry={reload}
						title={t("Couldn't load conversations")}
					/>
				) : !visible.length ? (
					narrowed ? (
						<EmptyState
							icon={<IcMessages />}
							title={t('No matching conversations')}
							actions={
								(filter !== 'all' || chipTag) && (
									<Button
										onClick={() => {
											setFilter('all')
											if (chipTag) setChipRemovedFor(chipTag)
										}}
									>
										{t('Show all')}
									</Button>
								)
							}
						/>
					) : (
						<EmptyState
							icon={<IcMessages />}
							title={t('No conversations yet')}
							description={t('Start a chat with one of your connections')}
							actions={
								<Button color="primary" icon={<IcCompose />} onClick={onNewChat}>
									{t('New chat')}
								</Button>
							}
						/>
					)
				) : (
					<>
						{pinned.length > 0 && (
							<>
								<Text size="sm" emphasis="muted" className="px-2 pt-2">
									{t('Pinned')}
								</Text>
								<Rows list={pinned} activeId={activeId} requests={requests} />
							</>
						)}
						<Rows list={main} activeId={activeId} requests={requests} />
						{archived.length > 0 && (
							<Disclosure
								summary={
									<HBox gap={2} align="center">
										{t('Archived')}
										<Badge>{archived.length}</Badge>
									</HBox>
								}
							>
								<Rows list={archived} activeId={activeId} requests={requests} />
							</Disclosure>
						)}
					</>
				)}
			</Panel>
		</VBox>
	)
}

// vim: ts=4

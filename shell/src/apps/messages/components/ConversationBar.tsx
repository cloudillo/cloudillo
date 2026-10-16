// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Badge,
	Button,
	Disclosure,
	EmptyState,
	HBox,
	IcAdd,
	Icon,
	Link,
	List,
	ListItem,
	Menu,
	MenuItem,
	Panel,
	ProfileCard,
	SearchInput,
	SkeletonList,
	Tab,
	Tabs,
	VBox
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useCtx } from '../../../context/index.js'
import { IcAccept, IcCompose, IcDirectChat, IcGroup, IcMessages, IcReject } from '../../../icons.js'
import { profilePath } from '../../../routes.js'
import type { Conversation, ConversationTab } from '../types.js'
import { ConversationCard } from './ConversationCard.js'

export interface ConversationFilter {
	q?: string
	tab: ConversationTab
}

interface ConversationBarProps {
	className?: string
	filter: ConversationFilter
	setFilter: React.Dispatch<React.SetStateAction<ConversationFilter>>
	conversations?: Conversation[]
	activeId?: string
	onCreateGroup: () => void
	onNewMessage: () => void
	pendingInvites?: ActionView[]
	onAcceptInvite?: (invite: ActionView) => void
	onRejectInvite?: (invite: ActionView) => void
}

export function ConversationBar({
	className,
	filter,
	setFilter,
	conversations,
	activeId,
	onCreateGroup,
	onNewMessage,
	pendingInvites,
	onAcceptInvite,
	onRejectInvite
}: ConversationBarProps) {
	const { t } = useTranslation()
	const urlContext = useCtx().base

	function onSearch(q: string) {
		setFilter((filter) => ({ ...filter, q }))
	}

	function onTabChange(tab: ConversationTab) {
		setFilter((filter) => ({ ...filter, tab }))
	}

	const filteredConversations = React.useMemo(() => {
		if (!conversations) return undefined
		switch (filter.tab) {
			case 'direct':
				return conversations.filter((c) => c.type === 'direct')
			case 'groups':
				return conversations.filter((c) => c.type === 'group')
			default:
				return conversations
		}
	}, [conversations, filter.tab])

	// Split the tab-filtered list into the active list and the collapsed
	// "Archived" section (stale DMs + left groups).
	const active = filteredConversations?.filter((c) => !c.archived)
	const archived = filteredConversations?.filter((c) => c.archived)

	return (
		<VBox gap={1} className={className ? `h-100 ${className}` : 'h-100'}>
			{/* Header panel: Tabs + Search */}
			<Panel variant="plain" padding={2}>
				<Tabs
					value={filter.tab}
					onTabChange={(value) => onTabChange(value as ConversationTab)}
					className="mb-2"
				>
					<Tab value="all" icon={<IcMessages />}>
						{t('All')}
					</Tab>
					<Tab value="direct" icon={<IcDirectChat />}>
						{t('Direct')}
					</Tab>
					<Tab value="groups" icon={<IcGroup />}>
						{t('Groups')}
					</Tab>
				</Tabs>
				<HBox align="center" gap={1}>
					<SearchInput
						className="flex-fill w-min-0"
						placeholder={t('Search conversations...')}
						aria-label={t('Search conversations...')}
						defaultValue={filter.q}
						debounce={300}
						onSearch={onSearch}
					/>
					<Menu
						placement="bottom-end"
						trigger={
							<Button
								color="primary"
								icon={<IcAdd />}
								aria-label={t('New conversation')}
							/>
						}
					>
						<MenuItem
							icon={<IcCompose />}
							label={t('New message')}
							onClick={onNewMessage}
						/>
						<MenuItem
							icon={<IcGroup />}
							label={t('New group')}
							onClick={onCreateGroup}
						/>
					</Menu>
				</HBox>
			</Panel>

			{/* Pending Invitations */}
			{pendingInvites && pendingInvites.length > 0 && (
				<Panel
					variant="plain"
					title={
						<HBox gap={2} align="center">
							{t('Pending Invitations')}
							<Badge>{pendingInvites.length}</Badge>
						</HBox>
					}
				>
					<List>
						{pendingInvites.map((invite) => {
							const inviteContent = invite.content as
								| { groupName?: string; message?: string }
								| string
								| undefined
							const inviteMessage =
								typeof inviteContent === 'string'
									? inviteContent
									: inviteContent?.message
							const inviteGroupName =
								typeof inviteContent === 'string'
									? undefined
									: inviteContent?.groupName
							return (
								<ListItem
									key={invite.actionId}
									leading={<Icon as={IcGroup} />}
									title={
										invite.subjectProfile ? (
											<Link
												href={profilePath(
													urlContext,
													invite.subjectProfile.idTag
												)}
											>
												<ProfileCard
													profile={invite.subjectProfile}
													className="small"
												/>
											</Link>
										) : (
											inviteGroupName || t('Group invitation')
										)
									}
									subtitle={`${t('From')} ${invite.issuer.name || invite.issuer.idTag}`}
									meta={inviteMessage}
									actions={
										<>
											<Button
												variant="ghost"
												color="primary"
												size="sm"
												icon={<IcAccept />}
												aria-label={t('Accept')}
												onClick={() => onAcceptInvite?.(invite)}
											/>
											<Button
												variant="ghost"
												size="sm"
												icon={<IcReject />}
												aria-label={t('Reject')}
												onClick={() => onRejectInvite?.(invite)}
											/>
										</>
									}
								/>
							)
						})}
					</List>
				</Panel>
			)}

			{/* List panel */}
			<Panel variant="plain" className="flex-fill overflow-y-auto">
				{filteredConversations === undefined || !active || !archived ? (
					<SkeletonList count={5} showAvatar />
				) : active.length === 0 && archived.length === 0 ? (
					<EmptyState
						icon={
							filter.tab === 'groups' ? (
								<IcGroup />
							) : filter.tab === 'direct' ? (
								<IcDirectChat />
							) : (
								<IcMessages />
							)
						}
						title={
							filter.tab === 'groups'
								? t('No groups yet')
								: filter.tab === 'direct'
									? t('No direct messages')
									: t('No conversations')
						}
						description={
							filter.tab === 'groups'
								? t('Create a group to chat with multiple people')
								: filter.tab === 'direct'
									? t('Connect with someone to start messaging')
									: t('Start a conversation or create a group')
						}
						actions={
							filter.tab === 'groups' ? (
								<Button color="primary" icon={<IcAdd />} onClick={onCreateGroup}>
									{t('Create Group')}
								</Button>
							) : undefined
						}
					/>
				) : (
					<>
						<List>
							{active.map((con) => (
								<ConversationCard
									key={con.id}
									conversation={con}
									selected={activeId === con.id}
								/>
							))}
						</List>
						{archived.length > 0 && (
							<Disclosure
								summary={
									<HBox gap={2} align="center">
										{t('Archived')}
										<Badge>{archived.length}</Badge>
									</HBox>
								}
							>
								<List>
									{archived.map((con) => (
										<ConversationCard
											key={con.id}
											conversation={con}
											selected={activeId === con.id}
										/>
									))}
								</List>
							</Disclosure>
						)}
					</>
				)}
			</Panel>
		</VBox>
	)
}

// vim: ts=4

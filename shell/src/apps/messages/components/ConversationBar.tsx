// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Badge,
	Button,
	Dropdown,
	EmptyState,
	mergeClasses,
	ProfileCard,
	SkeletonList,
	Tab,
	Tabs
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import debounce from 'debounce'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuCheck as IcCheck,
	LuChevronDown as IcChevronDown,
	LuChevronRight as IcChevronRight,
	LuX as IcClose,
	LuMessagesSquare as IcConvList,
	LuUser as IcDirect,
	LuUsers as IcGroup,
	LuPlus as IcNew,
	LuSquarePen as IcNewMsg
} from 'react-icons/lu'
import { Link } from 'react-router-dom'

import { HOME_CONTEXT, useUrlContextIdTag } from '../../../context/index.js'
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
	const urlContext = useUrlContextIdTag()
	const [search, setSearch] = React.useState(filter.q || '')
	const [showArchived, setShowArchived] = React.useState(false)

	const setFilterDebounced = React.useMemo(
		() =>
			debounce(function setFilterD({ q }: { q?: string }) {
				setFilter((filter) => ({ ...filter, q }))
			}, 300),
		[setFilter]
	)

	function onSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
		setSearch(e.target.value)
		setFilterDebounced({ q: e.target.value })
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
		<div className={mergeClasses('c-vbox h-100 g-1', className)}>
			{/* Header panel: Tabs + Search */}
			<div className="c-panel p-2">
				<div className="c-hbox align-items-center g-1 mb-2">
					<Tabs
						value={filter.tab}
						onTabChange={(value) => onTabChange(value as ConversationTab)}
						className="fill"
					>
						<Tab value="all" title={t('All')}>
							<IcConvList className="me-1" />
							{t('All')}
						</Tab>
						<Tab value="direct" title={t('Direct')}>
							<IcDirect className="me-1" />
							{t('Direct')}
						</Tab>
						<Tab value="groups" title={t('Groups')}>
							<IcGroup className="me-1" />
							{t('Groups')}
						</Tab>
					</Tabs>
					<Dropdown
						placement="bottom-end"
						triggerClassName="c-button primary icon flex-shrink-0"
						triggerProps={{ 'aria-label': t('New conversation') }}
						trigger={<IcNew />}
					>
						<ul className="c-nav vertical emph" style={{ minWidth: '12rem' }}>
							<li>
								<Button
									kind="nav-item"
									className="c-hbox g-2 align-items-center w-100"
									onClick={onNewMessage}
								>
									<IcNewMsg />
									<span className="flex-fill text-start">{t('New message')}</span>
								</Button>
							</li>
							<li>
								<Button
									kind="nav-item"
									className="c-hbox g-2 align-items-center w-100"
									onClick={onCreateGroup}
								>
									<IcGroup />
									<span className="flex-fill text-start">{t('New group')}</span>
								</Button>
							</li>
						</ul>
					</Dropdown>
				</div>
				<div className="c-input-group">
					<input
						type="text"
						className="c-input"
						placeholder={t('Search conversations...')}
						value={search}
						onChange={onSearchChange}
					/>
				</div>
			</div>

			{/* Pending Invitations */}
			{pendingInvites && pendingInvites.length > 0 && (
				<div className="c-panel">
					<div className="c-panel-header p-2">
						<span className="fw-medium">{t('Pending Invitations')}</span>
						<Badge className="ms-2">{pendingInvites.length}</Badge>
					</div>
					<div className="c-nav vertical low">
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
								<div
									key={invite.actionId}
									className="c-hbox align-items-center g-2 p-2"
								>
									<IcGroup className="text-muted flex-shrink-0" />
									<div className="c-vbox fill overflow-hidden">
										{invite.subjectProfile ? (
											<Link
												to={`/profile/${urlContext || HOME_CONTEXT}/${invite.subjectProfile.idTag}`}
											>
												<ProfileCard
													profile={invite.subjectProfile}
													className="small"
												/>
											</Link>
										) : (
											<span className="fw-medium text-truncate">
												{inviteGroupName || t('Group invitation')}
											</span>
										)}
										<span className="text-muted text-small text-truncate">
											{t('From')} {invite.issuer.name || invite.issuer.idTag}
										</span>
										{inviteMessage && (
											<span
												className="text-small text-truncate"
												title={inviteMessage}
											>
												{inviteMessage}
											</span>
										)}
									</div>
									<Button
										kind="link"
										variant="primary"
										title={t('Accept')}
										onClick={() => onAcceptInvite?.(invite)}
									>
										<IcCheck size={16} />
									</Button>
									<Button
										kind="link"
										title={t('Reject')}
										onClick={() => onRejectInvite?.(invite)}
									>
										<IcClose size={16} />
									</Button>
								</div>
							)
						})}
					</div>
				</div>
			)}

			{/* List panel */}
			<div className="c-panel c-nav vertical low fill overflow-y-auto">
				{filteredConversations === undefined || !active || !archived ? (
					<SkeletonList count={5} showAvatar />
				) : active.length === 0 && archived.length === 0 ? (
					<EmptyState
						icon={
							filter.tab === 'groups' ? (
								<IcGroup style={{ fontSize: '2rem' }} />
							) : filter.tab === 'direct' ? (
								<IcDirect style={{ fontSize: '2rem' }} />
							) : (
								<IcConvList style={{ fontSize: '2rem' }} />
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
						action={
							filter.tab === 'groups' ? (
								<Button variant="primary" onClick={onCreateGroup}>
									<IcNew className="me-1" />
									{t('Create Group')}
								</Button>
							) : undefined
						}
					/>
				) : (
					<>
						{active.map((con) => (
							<ConversationCard
								key={con.id}
								conversation={con}
								className={
									activeId === con.id ? 'bg bg-container-primary' : undefined
								}
							/>
						))}
						{archived.length > 0 && (
							<>
								<button
									type="button"
									className="c-nav-item c-hbox align-items-center g-2 text-muted fw-medium"
									onClick={() => setShowArchived((v) => !v)}
									aria-expanded={showArchived}
								>
									{showArchived ? <IcChevronDown /> : <IcChevronRight />}
									<span className="fill text-start">{t('Archived')}</span>
									<Badge>{archived.length}</Badge>
								</button>
								{showArchived &&
									archived.map((con) => (
										<ConversationCard
											key={con.id}
											conversation={con}
											className={
												activeId === con.id
													? 'bg bg-container-primary'
													: undefined
											}
										/>
									))}
							</>
						)}
					</>
				)}
			</div>
		</div>
	)
}

// vim: ts=4

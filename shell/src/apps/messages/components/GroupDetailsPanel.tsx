// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Badge,
	Button,
	EmptyState,
	Heading,
	HBox,
	Icon,
	List,
	ListItem,
	Panel,
	ProfileCard,
	SkeletonList,
	Text,
	useApi,
	useDialog,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuX as IcClose,
	LuUsers as IcGroup,
	LuUserPlus as IcInvite,
	LuLogOut as IcLeave
} from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'

import { useCtx } from '../../../context/index.js'
import { messagesPath } from '../../../routes.js'
import type { Conversation, ConversationMember, MemberRole } from '../types.js'

interface GroupDetailsPanelProps {
	conversation: Conversation
	members?: ConversationMember[]
	currentUserIdTag: string
	onClose: () => void
	onInvite?: () => void
	onLeave?: () => void
}

export function GroupDetailsPanel({
	conversation,
	members,
	currentUserIdTag,
	onClose,
	onInvite,
	onLeave
}: GroupDetailsPanelProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const dialog = useDialog()
	const navigate = useNavigate()
	const urlContext = useCtx().base

	const currentUserMember = members?.find((m) => m.profile.idTag === currentUserIdTag)
	const currentUserRole = currentUserMember?.role || 'member'
	const isAdmin = currentUserRole === 'admin'
	const isModerator = currentUserRole === 'moderator' || isAdmin

	// Abbreviated role badges (blank = no badge for regular members).
	const roleLabels: Record<MemberRole, string> = {
		observer: t('Obs'),
		member: '',
		moderator: t('Mod'),
		admin: t('A')
	}
	// Full role names for tooltips.
	const roleTitles: Record<MemberRole, string> = {
		observer: t('Observer'),
		member: t('Member'),
		moderator: t('Moderator'),
		admin: t('Admin')
	}

	async function handleLeaveGroup() {
		if (!api || !currentUserMember || !conversation.ownerTag) return

		const confirmed = await dialog.confirm(
			t('Leave Group'),
			t('Are you sure you want to leave "{{name}}"?', { name: conversation.name })
		)

		if (confirmed) {
			try {
				// subject = CONV actionId makes the DEL's key collide with the original
				// join SUBS (dedup retires it); audience = group node idTag is what makes
				// the action federate there (audience == issuer is skipped by delivery).
				await api.actions.create({
					type: 'SUBS',
					subType: 'DEL',
					subject: conversation.id,
					audienceTag: conversation.ownerTag
				})
				onLeave?.()
				navigate(messagesPath(urlContext))
			} catch (err) {
				console.error('Failed to leave group', err)
			}
		}
	}

	const invitedCount = members?.filter((m) => m.status === 'invited').length || 0

	return (
		<VBox gap={1} className="h-100">
			{/* Header panel */}
			<Panel padding={3}>
				<HBox align="center" gap={2}>
					<Icon as={IcGroup} size="lg" />
					<Heading level={3} className="flex-fill text-truncate">
						{conversation.name}
					</Heading>
					<Button
						variant="ghost"
						icon={<IcClose />}
						aria-label={t('Close')}
						className="lg-hide"
						onClick={onClose}
					/>
				</HBox>
				{conversation.description && (
					<Text as="p" emphasis="muted" className="mt-2">
						{conversation.description}
					</Text>
				)}
				<HBox align="center" gap={1} className="mt-3">
					<Text weight="medium">
						{t('Members')} ({members?.filter((m) => m.status === 'active').length || 0})
					</Text>
					{invitedCount > 0 && (
						<Text emphasis="muted" className="flex-fill">
							+{invitedCount} {t('invited')}
						</Text>
					)}
					{isModerator && (
						<Button
							variant="ghost"
							icon={<IcInvite />}
							aria-label={t('Invite member')}
							className="ms-auto"
							onClick={onInvite}
						/>
					)}
				</HBox>
			</Panel>

			{/* Members list panel */}
			<Panel className="flex-fill overflow-y-auto">
				{members === undefined ? (
					<SkeletonList count={3} showAvatar />
				) : members.length === 0 ? (
					<EmptyState title={t('No members')} />
				) : (
					<List>
						{members.map((member) => {
							const isCurrentUser = member.profile.idTag === currentUserIdTag
							const isInvited = member.status === 'invited'
							return (
								<ListItem
									key={member.profile.idTag}
									disabled={isInvited}
									title={
										<ProfileCard profile={member.profile} className="small" />
									}
									trailing={
										<>
											{isInvited ? (
												<Badge color="warning" aria-label={t('Invited')}>
													{t('Inv')}
												</Badge>
											) : (
												member.role !== 'member' && (
													<Badge
														color={
															member.role === 'admin'
																? 'primary'
																: 'secondary'
														}
														aria-label={roleTitles[member.role]}
													>
														{roleLabels[member.role]}
													</Badge>
												)
											)}
											{isCurrentUser && (
												<Badge variant="outline" aria-label={t('You')}>
													✓
												</Badge>
											)}
										</>
									}
								/>
							)
						})}
					</List>
				)}
			</Panel>

			{/* Actions panel */}
			<Panel padding={3}>
				<Button
					color="error"
					icon={<IcLeave />}
					className="w-100"
					onClick={handleLeaveGroup}
				>
					{t('Leave Group')}
				</Button>
			</Panel>
		</VBox>
	)
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Badge,
	Button,
	mergeClasses,
	ProfileCard,
	SkeletonList,
	useApi,
	useDialog
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

import { HOME_CONTEXT, useUrlContextIdTag } from '../../../context/index.js'
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
	const urlContext = useUrlContextIdTag()

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
				navigate(`/app/${urlContext || HOME_CONTEXT}/messages`)
			} catch (err) {
				console.error('Failed to leave group', err)
			}
		}
	}

	return (
		<div className="c-vbox h-100 g-1">
			{/* Header panel */}
			<div className="c-panel p-3">
				<div className="c-hbox align-items-center">
					<div className="c-hbox align-items-center g-2 fill">
						<IcGroup size={24} />
						<h3 className="m-0 text-truncate">{conversation.name}</h3>
					</div>
					<Button kind="link" className="lg-hide" onClick={onClose}>
						<IcClose />
					</Button>
				</div>
				{conversation.description && (
					<p className="text-muted mt-2 mb-0">{conversation.description}</p>
				)}
				<div className="c-hbox align-items-center mt-3">
					<span className="fw-medium fill">
						{t('Members')} ({members?.filter((m) => m.status === 'active').length || 0})
						{members?.some((m) => m.status === 'invited') && (
							<span className="text-muted ms-1">
								+{members.filter((m) => m.status === 'invited').length}{' '}
								{t('invited')}
							</span>
						)}
					</span>
					{isModerator && (
						<Button kind="link" title={t('Invite member')} onClick={onInvite}>
							<IcInvite size={18} />
						</Button>
					)}
				</div>
			</div>

			{/* Members list panel */}
			<div className="c-panel c-nav vertical low fill overflow-y-auto">
				{members === undefined ? (
					<SkeletonList count={3} showAvatar />
				) : members.length === 0 ? (
					<span className="text-muted p-2">{t('No members')}</span>
				) : (
					members.map((member) => {
						const isCurrentUser = member.profile.idTag === currentUserIdTag
						const isInvited = member.status === 'invited'
						return (
							<div
								key={member.profile.idTag}
								className={mergeClasses(
									'c-hbox align-items-center g-2 p-2',
									isInvited && 'opacity-70'
								)}
							>
								<div className="fill overflow-hidden">
									<ProfileCard profile={member.profile} className="small" />
								</div>
								{isInvited ? (
									<Badge className="warning" title={t('Invited')}>
										{t('Inv')}
									</Badge>
								) : (
									member.role !== 'member' && (
										<Badge
											className={mergeClasses(
												member.role === 'admin' && 'primary',
												member.role === 'moderator' && 'secondary'
											)}
											title={roleTitles[member.role]}
										>
											{roleLabels[member.role]}
										</Badge>
									)
								)}
								{isCurrentUser && (
									<Badge className="outline" title={t('You')}>
										✓
									</Badge>
								)}
							</div>
						)
					})
				)}
			</div>

			{/* Actions panel */}
			<div className="c-panel c-vbox g-2 p-3">
				<Button className="w-100 text-danger" onClick={handleLeaveGroup}>
					<IcLeave className="me-2" />
					{t('Leave Group')}
				</Button>
			</div>
		</div>
	)
}

// vim: ts=4

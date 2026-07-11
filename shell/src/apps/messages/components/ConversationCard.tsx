// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Avatar, Badge, mergeClasses, ProfileCard } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuUsers as IcGroup } from 'react-icons/lu'
import { Link } from 'react-router-dom'

import { HOME_CONTEXT, useUrlContextIdTag } from '../../../context/index.js'
import { unreadCountAtom } from '../../../read-position.js'
import type { Conversation } from '../types.js'
import { GroupAvatar } from './GroupAvatar.js'

function ConversationCardComponent({
	className,
	conversation
}: {
	className?: string
	conversation: Conversation
}) {
	const { t } = useTranslation()
	const urlContext = useUrlContextIdTag()
	const unreadCounts = useAtomValue(unreadCountAtom)
	const unread = unreadCounts[`msg:${conversation.id}`] || 0

	const isGroup = conversation.type === 'group'
	const profile = conversation.profiles[0] || {}

	return (
		<Link
			className={mergeClasses('c-nav-item c-hbox g-2 align-items-center', className)}
			to={`/app/${urlContext || HOME_CONTEXT}/messages/${conversation.id}`}
		>
			{isGroup ? (
				<>
					<div className="pos-relative">
						{conversation.profiles.length > 1 ? (
							<GroupAvatar profiles={conversation.profiles} max={3} />
						) : (
							<Avatar size="md">
								<span className="c-avatar-fallback">
									<IcGroup />
								</span>
							</Avatar>
						)}
						{unread > 0 && (
							<span
								className="c-badge dot accent positioned tr"
								role="status"
								aria-label={t('Unread messages')}
							/>
						)}
					</div>
					<div className="c-vbox fill overflow-hidden">
						<span className="c-hbox align-items-center g-1 overflow-hidden">
							<span className="fw-medium text-truncate">
								{conversation.name || t('Unnamed Group')}
							</span>
							{conversation.left && (
								<Badge className="flex-shrink-0">{t('Left')}</Badge>
							)}
						</span>
						<span className="text-muted text-small text-truncate">
							{conversation.lastMessage?.content ||
								(conversation.memberCount
									? t('{{count}} members', { count: conversation.memberCount })
									: t('Group'))}
						</span>
					</div>
					{/* Group unread is dot-only (0/1 from lastCommentAt vs commentsReadAt),
					    shown as the avatar dot above; no misleading numeric badge. */}
				</>
			) : (
				<>
					<div className="c-vbox fill overflow-hidden">
						<span className="c-hbox align-items-center g-1 overflow-hidden">
							<div className="fill overflow-hidden">
								<ProfileCard profile={profile} />
							</div>
							{conversation.connected !== true && (
								<Badge className="flex-shrink-0">{t('Not connected')}</Badge>
							)}
						</span>
						{conversation.lastMessage?.content && (
							<span className="text-muted text-small text-truncate">
								{conversation.lastMessage.content}
							</span>
						)}
					</div>
					{unread > 0 && (
						<span
							className="c-badge accent ms-auto"
							role="status"
							aria-label={t('Unread messages')}
						>
							{unread}
						</span>
					)}
				</>
			)}
		</Link>
	)
}

export const ConversationCard = React.memo(ConversationCardComponent)

// vim: ts=4

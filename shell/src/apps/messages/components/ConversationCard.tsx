// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Avatar, Badge, BadgeAnchor, HBox, Icon, ListItem, ProfileCard } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuUsers as IcGroup } from 'react-icons/lu'

import { useCtx } from '../../../context/index.js'
import { unreadCountAtom } from '../../../read-position.js'
import { messagesPath } from '../../../routes.js'
import type { Conversation } from '../types.js'
import { GroupAvatar } from './GroupAvatar.js'

function ConversationCardComponent({
	conversation,
	selected
}: {
	conversation: Conversation
	selected?: boolean
}) {
	const { t } = useTranslation()
	const urlContext = useCtx().base
	const unreadCounts = useAtomValue(unreadCountAtom)
	const unread = unreadCounts[`msg:${conversation.id}`] || 0
	const href = messagesPath(urlContext, conversation.id)

	if (conversation.type === 'group') {
		return (
			<ListItem
				href={href}
				selected={selected}
				leading={
					// Group unread is dot-only (0/1 from lastCommentAt vs commentsReadAt);
					// no misleading numeric badge.
					<BadgeAnchor
						badge={
							unread > 0 && (
								<Badge
									dot
									color="accent"
									role="status"
									aria-label={t('Unread messages')}
								/>
							)
						}
					>
						{conversation.profiles.length > 1 ? (
							<GroupAvatar profiles={conversation.profiles} max={3} />
						) : (
							<Avatar size="md" fallback={<Icon as={IcGroup} />} />
						)}
					</BadgeAnchor>
				}
				title={
					<HBox gap={1} align="center">
						{conversation.name || t('Unnamed Group')}
						{conversation.left && <Badge>{t('Left')}</Badge>}
					</HBox>
				}
				subtitle={
					conversation.lastMessage?.content ||
					(conversation.memberCount
						? t('{{count}} members', { count: conversation.memberCount })
						: t('Group'))
				}
			/>
		)
	}

	return (
		<ListItem
			href={href}
			selected={selected}
			title={
				<HBox gap={1} align="center">
					<ProfileCard profile={conversation.profiles[0] || {}} className="flex-fill" />
					{conversation.connected !== true && <Badge>{t('Not connected')}</Badge>}
				</HBox>
			}
			subtitle={conversation.lastMessage?.content}
			trailing={
				unread > 0 && (
					<Badge color="accent" role="status" aria-label={t('Unread messages')}>
						{unread}
					</Badge>
				)
			}
		/>
	)
}

export const ConversationCard = React.memo(ConversationCardComponent)

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, HBox, ListItem, ProfilePicture, Text, TimeFormat } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuCheck as IcAccept, LuX as IcDismiss } from 'react-icons/lu'

function getActionText(
	type: string,
	subType: string | undefined,
	status: string | undefined,
	t: (key: string) => string,
	subject?: string
): string {
	switch (type) {
		case 'CONN':
			if (subType === 'DEL') return t('Disconnected')
			if (status === 'C') return t('Wants to connect')
			return t('is now a connection')
		case 'FSHR':
			return t('Shared a file')
		case 'INVT':
			return subject?.startsWith('@') ? t('Community invitation') : t('Group invitation')
		case 'PRINVT':
			return t('Invited you to create a community')
		case 'FLLW':
			return t('Started following you')
		case 'MSG':
			return t('Sent you a message')
		case 'CMNT':
			return t('Commented on your post')
		case 'REACT':
			return t('Reacted to your post')
		case 'MNTN':
			return t('Mentioned you')
		case 'POST':
			return t('Published a new post')
		default:
			return t('New notification')
	}
}

function inviteMessage(action: ActionView): string | undefined {
	if (action.type !== 'INVT' && action.type !== 'PRINVT') return undefined
	const c = action.content
	return typeof c === 'string' ? c : (c as { message?: string } | undefined)?.message
}

export interface NotificationItemProps {
	action: ActionView
	onClick?: (action: ActionView) => void
	onAccept?: (action: ActionView) => void
	onReject?: (action: ActionView) => void
	onDismiss?: (action: ActionView) => void
}

/** Compact notification row for the header popover */
export function NotificationItem({
	action,
	onClick,
	onAccept,
	onReject,
	onDismiss
}: NotificationItemProps) {
	const { t } = useTranslation()
	const name = action.issuer?.name || action.issuer?.idTag || ''
	const subject =
		action.type === 'INVT' && action.subjectProfile
			? action.subjectProfile.name || action.subjectProfile.idTag
			: undefined
	const message = inviteMessage(action)

	return (
		<ListItem
			className={action.status === 'C' ? 'c-notification-item-actionable' : undefined}
			onClick={onClick ? () => onClick(action) : undefined}
			leading={
				<ProfilePicture profile={action.issuer} srcTag={action.issuer?.idTag} size="xs" />
			}
			title={
				<Text size="sm">
					<Text weight="semibold">{name}</Text>{' '}
					{subject ? (
						<>
							<Text emphasis="muted">{t('invited you to')}</Text>{' '}
							<Text weight="semibold">{subject}</Text>
						</>
					) : (
						<Text emphasis="muted">
							{getActionText(
								action.type,
								action.subType,
								action.status,
								t,
								action.subject
							)}
						</Text>
					)}
				</Text>
			}
			subtitle={message && <Text truncate>{message}</Text>}
			meta={<TimeFormat time={action.createdAt} />}
			actions={
				<HBox gap={1}>
					{onAccept && (
						<Button
							variant="ghost"
							color="success"
							icon={<IcAccept />}
							aria-label={t('Accept')}
							onClick={() => onAccept(action)}
						/>
					)}
					{onReject && (
						<Button
							variant="ghost"
							color="error"
							icon={<IcDismiss />}
							aria-label={t('Reject')}
							onClick={() => onReject(action)}
						/>
					)}
					{onDismiss && (
						<Button
							variant="ghost"
							icon={<IcDismiss />}
							aria-label={t('Dismiss')}
							onClick={() => onDismiss(action)}
						/>
					)}
				</HBox>
			}
		/>
	)
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	HatVia,
	HBox,
	ListItem,
	ProfilePicture,
	parseChannel,
	Text,
	TimeFormat
} from '@cloudillo/react'
import { type ActionView, tConnectAction } from '@cloudillo/types'
import * as T from '@symbion/runtype'
import type { TFunction } from 'i18next'
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

/** "wants to join ~x" / "invited you to ~x at T" for knocks and invitations into a room */
function roomText(action: ActionView, t: TFunction): string | undefined {
	const { tenant, name: room } = parseChannel(action.subject ?? '')
	if (!tenant || !room) return undefined
	if (action.type === 'SUBS' && action.subType !== 'DEL')
		return t('wants to join ~{{room}}', { room })
	if (action.type === 'INVT' && action.subType !== 'DEL') {
		return t('invited you to ~{{room}} at {{tenant}}', {
			room,
			tenant: action.subjectProfile?.name || tenant
		})
	}
	return undefined
}

/** The note sent along with a connection request or an invitation. */
export function inviteMessage(action: ActionView): string | undefined {
	const c = action.content
	if (typeof c === 'string') return c
	if (action.type === 'CONN') {
		// A bare message or `{ msg?, roles? }`
		const res = T.decode(tConnectAction.props.content, c, { unknownFields: 'drop' })
		return T.isOk(res) && typeof res.ok === 'object' ? res.ok.msg : undefined
	}
	if (action.type !== 'INVT' && action.type !== 'PRINVT') return undefined
	return (c as { message?: string } | undefined)?.message
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
	const room = roomText(action, t)
	const subject =
		!room && action.type === 'INVT' && action.subjectProfile
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
					<HatVia
						hat={action.hat}
						srcTag={action.issuer?.idTag}
						name={<Text weight="semibold">{name}</Text>}
					/>{' '}
					{room ? (
						<Text emphasis="muted">{room}</Text>
					) : subject ? (
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

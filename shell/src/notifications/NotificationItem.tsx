// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LuCheck as IcAccept, LuX as IcDismiss } from 'react-icons/lu'

import type { ActionView } from '@cloudillo/types'
import { Button, ProfilePicture, TimeFormat, mergeClasses } from '@cloudillo/react'

import { HOME_CONTEXT, useUrlContextIdTag } from '../context/index.js'

import './notifications.css'

function getActionText(
	type: string,
	subType: string | undefined,
	status: string | undefined,
	t: (key: string) => string
): string {
	switch (type) {
		case 'CONN':
			if (subType === 'DEL') return t('Disconnected')
			if (status === 'C') return t('Wants to connect')
			return t('is now a connection')
		case 'FSHR':
			return t('Shared a file')
		case 'INVT':
			return t('Group invitation')
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

export interface NotificationItemProps {
	action: ActionView
	compact?: boolean
	onClick?: (action: ActionView) => void
	onAccept?: (action: ActionView) => void
	onReject?: (action: ActionView) => void
	onDismiss?: (action: ActionView) => void
}

export function NotificationItem({
	action,
	compact,
	onClick,
	onAccept,
	onReject,
	onDismiss
}: NotificationItemProps) {
	const { t } = useTranslation()
	const urlContext = useUrlContextIdTag()
	const name = action.issuer?.name || action.issuer?.idTag || ''
	const text = getActionText(action.type, action.subType, action.status, t)
	const isActionable = compact && action.status === 'C'

	return (
		<div
			className={mergeClasses(
				'c-hbox g-2 align-items-center',
				compact ? 'p-2' : 'p-3',
				isActionable && 'c-notification-item-actionable'
			)}
			style={
				compact
					? {
							cursor: 'pointer',
							borderBottom: '1px solid var(--border-color, rgba(128,128,128,0.2))'
						}
					: undefined
			}
			onClick={onClick ? () => onClick(action) : undefined}
		>
			<ProfilePicture profile={action.issuer} srcTag={action.issuer?.idTag} tiny />
			<div className="c-vbox flex-fill" style={{ minWidth: 0 }}>
				<span className={compact ? 'text-sm' : ''}>
					<strong>{name}</strong>{' '}
					{action.type === 'INVT' && action.subjectProfile ? (
						<>
							<span className="text-muted">{t('invited you to')}</span>{' '}
							<Link
								to={`/profile/${urlContext || HOME_CONTEXT}/${action.subjectProfile.idTag}`}
								onClick={(e) => e.stopPropagation()}
							>
								<strong className="text-emph">
									{action.subjectProfile.name || action.subjectProfile.idTag}
								</strong>
							</Link>
						</>
					) : (
						<span className="text-muted">{text}</span>
					)}{' '}
					<small className="text-muted">
						<TimeFormat time={action.createdAt} />
					</small>
				</span>
				{(action.type === 'INVT' || action.type === 'PRINVT') &&
					(() => {
						const c = action.content
						const msg =
							typeof c === 'string'
								? c
								: (c as { message?: string } | undefined)?.message
						return msg ? (
							<span className="text-muted text-truncate" style={{ maxWidth: '100%' }}>
								{msg}
							</span>
						) : null
					})()}
			</div>
			{/* stopPropagation on wrapper div to prevent Popper close on button click */}
			<div className="c-hbox g-1" onClick={(e) => e.stopPropagation()}>
				{onAccept && (
					<Button
						kind="link"
						onClick={() => onAccept(action)}
						style={{ color: 'var(--col-success)' }}
					>
						<IcAccept />
					</Button>
				)}
				{onReject && (
					<Button
						kind="link"
						onClick={() => onReject(action)}
						style={{ color: 'var(--col-error)' }}
					>
						<IcDismiss />
					</Button>
				)}
				{onDismiss && (
					<Button kind="link" onClick={() => onDismiss(action)}>
						<IcDismiss />
					</Button>
				)}
			</div>
		</div>
	)
}

// vim: ts=4

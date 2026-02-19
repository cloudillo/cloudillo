// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuCheck as IcAccept, LuX as IcDismiss } from 'react-icons/lu'

import { ActionView } from '@cloudillo/types'
import { Button, ProfilePicture, TimeFormat, mergeClasses } from '@cloudillo/react'

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
			return t('Connected with you')
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
	const name = action.issuer?.name || action.issuer?.idTag || ''
	const text = getActionText(action.type, action.subType, action.status, t)

	return (
		<div
			className={mergeClasses('c-hbox g-2 align-items-center', compact ? 'p-2' : 'p-3')}
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
					<strong>{name}</strong> <span className="text-muted">{text}</span>
				</span>
				<TimeFormat time={action.createdAt} />
			</div>
			{/* stopPropagation on wrapper div to prevent Popper close on button click */}
			<div className="c-hbox g-1" onClick={(e) => e.stopPropagation()}>
				{onAccept && (
					<Button
						link
						onClick={() => onAccept(action)}
						style={{ color: 'var(--col-success)' }}
					>
						<IcAccept />
					</Button>
				)}
				{onReject && (
					<Button
						link
						onClick={() => onReject(action)}
						style={{ color: 'var(--col-error)' }}
					>
						<IcDismiss />
					</Button>
				)}
				{onDismiss && (
					<Button link onClick={() => onDismiss(action)}>
						<IcDismiss />
					</Button>
				)}
			</div>
		</div>
	)
}

// vim: ts=4

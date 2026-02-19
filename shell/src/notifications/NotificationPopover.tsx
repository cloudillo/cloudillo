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
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LuBell as IcNotifications } from 'react-icons/lu'

import { useAuth, Popper } from '@cloudillo/react'

import { useCurrentContextIdTag } from '../context/index.js'
import { useNotifications } from './state.js'
import { NotificationItem } from './NotificationItem.js'

const MAX_POPOVER_ITEMS = 6

export function NotificationPopover() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const { notifications, dismissNotification, acceptNotification, rejectNotification } =
		useNotifications()

	const handlePrinvtAccept = React.useCallback(
		(action: Parameters<typeof acceptNotification>[0]) => {
			acceptNotification(action)
			const content = action.content as { refId?: string } | undefined
			const idTag = contextIdTag || auth?.idTag
			if (content?.refId) {
				navigate(`/communities/create/${idTag}?invite=${content.refId}`)
			} else {
				navigate(`/communities/create/${idTag}`)
			}
		},
		[acceptNotification, contextIdTag, auth?.idTag, navigate]
	)

	const sortedNotifications = [...notifications.notifications]
		.sort((a, b) => {
			const ta =
				typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : a.createdAt
			const tb =
				typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : b.createdAt
			return tb - ta
		})
		.slice(0, MAX_POPOVER_ITEMS)

	const badgeCount = notifications.notifications.length

	return (
		<Popper
			className="c-nav-item pos-relative"
			icon={
				<>
					<IcNotifications />
					{!!badgeCount && <span className="c-badge br bg bg-error">{badgeCount}</span>}
				</>
			}
		>
			<div className="c-vbox" style={{ width: 360, maxHeight: 480 }}>
				<div className="c-hbox justify-content-between align-items-center p-2">
					<h4 className="m-0">{t('Notifications')}</h4>
					<Link to="/notifications" className="text-link">
						{t('See all')}
					</Link>
				</div>
				<div className="c-vbox" style={{ overflowY: 'auto', flex: 1 }}>
					{!sortedNotifications.length && (
						<div className="c-vbox align-items-center p-3 text-muted">
							<p>{t('No new notifications')}</p>
						</div>
					)}
					{sortedNotifications.map((action) => (
						<NotificationItem
							key={action.actionId}
							action={action}
							compact
							onClick={() => navigate('/notifications')}
							onAccept={
								action.status === 'C'
									? action.type === 'PRINVT'
										? handlePrinvtAccept
										: acceptNotification
									: undefined
							}
							onReject={
								action.status === 'C' && action.type !== 'PRINVT'
									? rejectNotification
									: undefined
							}
							onDismiss={
								action.status !== 'C'
									? dismissNotification
									: action.type === 'PRINVT'
										? acceptNotification
										: undefined
							}
						/>
					))}
				</div>
			</div>
		</Popper>
	)
}

// vim: ts=4

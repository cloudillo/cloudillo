// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Popper } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuBell as IcNotifications } from 'react-icons/lu'
import { Link, useNavigate } from 'react-router-dom'

import { HOME_CONTEXT, useContextSwitch, useUrlContextIdTag } from '../context/index.js'
import { NotificationItem } from './NotificationItem.js'
import { useNotifications } from './state.js'

const MAX_POPOVER_ITEMS = 6

export function NotificationPopover() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const urlContext = useUrlContextIdTag()
	const { switchTo } = useContextSwitch()
	const { notifications, dismissNotification, acceptNotification, rejectNotification } =
		useNotifications()

	const handleInvtAccept = React.useCallback(
		async (action: Parameters<typeof acceptNotification>[0]) => {
			const ok = await acceptNotification(action)
			if (ok && action.subject?.startsWith('@')) {
				// Community invite: switch into the community context (lands on feed)
				try {
					await switchTo(action.subject.slice(1), '/feed')
				} catch (err) {
					console.error('Failed to switch context:', err)
				}
			}
			// message-group invites: keep existing no-navigation popover behaviour
		},
		[acceptNotification, switchTo]
	)

	const handlePrinvtAccept = React.useCallback(
		(action: Parameters<typeof acceptNotification>[0]) => {
			acceptNotification(action)
			const content = action.content as { refId?: string } | undefined
			const idTag = urlContext || HOME_CONTEXT
			if (content?.refId) {
				navigate(`/communities/create/${idTag}?invite=${content.refId}`)
			} else {
				navigate(`/communities/create/${idTag}`)
			}
		},
		[acceptNotification, urlContext, navigate]
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
			aria-label={
				badgeCount
					? t('Notifications ({{count}} new)', { count: badgeCount })
					: t('Notifications')
			}
			icon={
				<>
					<IcNotifications />
					{!!badgeCount && <span className="c-badge br bg bg-primary">{badgeCount}</span>}
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
						<div className="c-vbox align-items-center p-3 text-muted g-1">
							<p>{t('No new notifications')}</p>
							<p className="small">
								{t('Follow people or join communities to see activity here.')}
							</p>
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
										: handleInvtAccept
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

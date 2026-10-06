// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Badge,
	BadgeAnchor,
	Button,
	HBox,
	Heading,
	List,
	Popover,
	Text,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuBell as IcNotifications } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'

import { useContextSwitch, useCtx } from '../context/index.js'
import { communityCreatePath, contextPath } from '../routes.js'
import { AppHeaderItem } from '../ui/AppHeader.js'
import { NotificationItem } from './NotificationItem.js'
import { useNotifications } from './state.js'

const MAX_POPOVER_ITEMS = 6

export function NotificationPopover() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const urlContext = useCtx().base
	const { switchTo } = useContextSwitch()
	const [open, setOpen] = React.useState(false)
	const { notifications, dismissNotification, acceptNotification, rejectNotification } =
		useNotifications()

	const handleInvtAccept = React.useCallback(
		async (action: Parameters<typeof acceptNotification>[0]) => {
			const ok = await acceptNotification(action)
			if (ok && action.subject?.startsWith('@')) {
				// Community invite: switch into the community context (lands on feed)
				try {
					await switchTo(action.subject.slice(1))
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
			setOpen(false)
			navigate(
				communityCreatePath(
					urlContext,
					undefined,
					content?.refId ? { invite: content.refId } : undefined
				)
			)
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
	const allPath = contextPath(urlContext, 'notifications')

	return (
		<AppHeaderItem tour="notifications">
			<Popover
				width="md"
				placement="bottom-end"
				open={open}
				onOpenChange={setOpen}
				trigger={
					<Button
						variant="ghost"
						aria-label={
							badgeCount
								? t('Notifications ({{count}} new)', { count: badgeCount })
								: t('Notifications')
						}
						icon={
							<BadgeAnchor
								badge={!!badgeCount && <Badge color="primary">{badgeCount}</Badge>}
							>
								<IcNotifications />
							</BadgeAnchor>
						}
					/>
				}
			>
				<VBox>
					{/* Same inline inset as the list rows and the empty state below. */}
					<HBox justify="between" align="center" className="px-3 py-2">
						<Heading level={4}>{t('Notifications')}</Heading>
						<Button variant="link" href={allPath} onClick={() => setOpen(false)}>
							{t('See all')}
						</Button>
					</HBox>
					{!sortedNotifications.length ? (
						<VBox align="center" gap={1} padding={3} className="text-center">
							<Text emphasis="muted">{t('No new notifications')}</Text>
							<Text size="sm" emphasis="muted">
								{t('Follow people or join communities to see activity here.')}
							</Text>
						</VBox>
					) : (
						<List scroll>
							{sortedNotifications.map((action) => (
								<NotificationItem
									key={action.actionId}
									action={action}
									onClick={() => {
										setOpen(false)
										navigate(allPath)
									}}
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
						</List>
					)}
				</VBox>
			</Popover>
		</AppHeaderItem>
	)
}

// vim: ts=4

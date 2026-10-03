// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	EmptyState,
	Fcd,
	HBox,
	Heading,
	Link,
	List,
	ListItem,
	mergeClasses,
	Nav,
	NavItem,
	PageHeader,
	ProfileAudienceCard,
	ProfileCard,
	RichText,
	Text,
	TimeFormat,
	useApi,
	useAuth,
	VBox
} from '@cloudillo/react'
import { type ActionView, tFileShareAction } from '@cloudillo/types'
import * as T from '@symbion/runtype'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuCheck as IcAccept,
	LuUsers as IcConnections,
	LuFile as IcFiles,
	LuMessageSquare as IcMessages,
	LuBell as IcNotifications,
	LuX as IcReject,
	LuHeart as IcSocial,
	LuMailOpen as IcUnread
} from 'react-icons/lu'
import { useLocation, useNavigate } from 'react-router-dom'

import { useContextSwitch, useCtx } from '../context/index.js'
import { FilterToggle } from '../ui/FilterToggle.js'
import { inviteMessage } from './NotificationItem.js'
import { communityCreatePath, messagesPath, profilePath } from '../routes.js'
import { useNotifications } from './state'

type NotificationFilter = 'all' | 'unread' | 'connections' | 'messages' | 'social' | 'files'

function FilterBar({
	filter,
	setFilter
}: {
	filter: NotificationFilter
	setFilter: (f: NotificationFilter) => void
}) {
	const { t } = useTranslation()

	const filters: { key: NotificationFilter; label: string; icon: React.ReactNode }[] = [
		{ key: 'unread', label: t('Unread'), icon: <IcUnread /> },
		{ key: 'connections', label: t('Connections'), icon: <IcConnections /> },
		{ key: 'messages', label: t('Messages'), icon: <IcMessages /> },
		{ key: 'social', label: t('Social'), icon: <IcSocial /> },
		{ key: 'files', label: t('Files'), icon: <IcFiles /> },
		{ key: 'all', label: t('All'), icon: <IcNotifications /> }
	]

	return (
		<Nav as="div" vertical className="low">
			{filters.map((f) => (
				<NavItem
					key={f.key}
					as="button"
					gap={2}
					active={filter === f.key}
					onClick={() => setFilter(f.key)}
				>
					{f.icon} {f.label}
				</NavItem>
			))}
		</Nav>
	)
}

const FILTER_TYPE_MAP: Record<NotificationFilter, string[] | undefined> = {
	all: undefined,
	unread: undefined,
	connections: ['CONN', 'PRINVT'],
	messages: ['MSG', 'INVT'],
	social: ['FLLW', 'CMNT', 'REACT', 'MNTN', 'POST'],
	files: ['FSHR']
}

const FILTER_LABEL_MAP: Record<NotificationFilter, (t: (k: string) => string) => string> = {
	all: (t) => t('All'),
	unread: (t) => t('Unread'),
	connections: (t) => t('Connections'),
	messages: (t) => t('Messages'),
	social: (t) => t('Social'),
	files: (t) => t('Files')
}

function getNotificationDescription(type: string, t: (key: string) => string): string {
	switch (type) {
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
		case 'PRINVT':
			return t('Invited you to create a community')
		default:
			return t('New notification')
	}
}

/** Shared card: issuer + time header, title, body, action row */
function NotificationCard({
	action,
	actionable,
	className,
	header,
	title,
	children,
	actions
}: {
	action: ActionView
	actionable?: boolean
	className?: string
	header?: React.ReactNode
	title: React.ReactNode
	children?: React.ReactNode
	actions?: React.ReactNode
}) {
	const urlContext = useCtx().base
	return (
		<ListItem>
			<VBox className={mergeClasses('c-notification', actionable && 'actionable', className)}>
				<HBox align="center" gap={3}>
					{header ?? (
						<Link href={profilePath(urlContext, action.issuer.idTag)}>
							<ProfileCard profile={action.issuer} hat={action.hat} />
						</Link>
					)}
					<Text size="sm" emphasis="muted" className="ms-auto text-nowrap">
						<TimeFormat time={action.createdAt} />
					</Text>
				</HBox>
				<VBox gap={1}>
					<Heading level={3} size="base">
						{title}
					</Heading>
					{children}
				</VBox>
				{actions && (
					<HBox gap={2} justify="end" wrap className="pt-1">
						{actions}
					</HBox>
				)}
			</VBox>
		</ListItem>
	)
}

function AcceptRejectActions({
	onAccept,
	onReject
}: {
	onAccept: () => void
	onReject: () => void
}) {
	const { t } = useTranslation()
	return (
		<>
			<Button color="primary" onClick={onAccept}>
				<IcAccept /> {t('Accept')}
			</Button>
			<Button onClick={onReject}>
				<IcReject /> {t('Reject')}
			</Button>
		</>
	)
}

function DismissAction({ onDismiss }: { onDismiss: () => void }) {
	const { t } = useTranslation()
	return (
		<Button onClick={onDismiss}>
			<IcReject /> {t('Dismiss')}
		</Button>
	)
}

function GenericNotification({
	className,
	action,
	onDismiss
}: {
	className?: string
	action: ActionView
	onDismiss?: (action: ActionView) => void
}) {
	const { t } = useTranslation()

	return (
		<NotificationCard
			action={action}
			className={className}
			title={getNotificationDescription(action.type, t)}
			actions={onDismiss && <DismissAction onDismiss={() => onDismiss(action)} />}
		/>
	)
}

function ConnectNotification({
	className,
	action,
	onActionHandled,
	onDismiss
}: {
	className?: string
	action: ActionView
	onActionHandled?: (action: ActionView) => void
	onDismiss?: (action: ActionView) => void
}) {
	const { t } = useTranslation()
	const { api } = useApi()
	const content = inviteMessage(action)

	const actionable = action.status === 'C' && action.subType !== 'DEL'

	async function onAccept() {
		if (!api || !action?.actionId) return
		await api.actions.accept(action.actionId)
		onActionHandled?.(action)
	}

	async function onReject() {
		if (!api || !action?.actionId) return
		await api.actions.reject(action.actionId)
		onActionHandled?.(action)
	}

	return (
		<NotificationCard
			action={action}
			actionable={actionable}
			className={className}
			title={
				action.subType === 'DEL'
					? t('User disconnected, or refused to connect')
					: action.status === 'C'
						? t('Wants to connect')
						: t('is now a connection')
			}
			actions={
				actionable ? (
					<AcceptRejectActions onAccept={onAccept} onReject={onReject} />
				) : (
					onDismiss && <DismissAction onDismiss={() => onDismiss(action)} />
				)
			}
		>
			{action.subType !== 'DEL' && !action.subType && content && (
				<RichText text={content} className="c-notification-message" />
			)}
		</NotificationCard>
	)
}

function FileShareNotification({
	className,
	action,
	onActionHandled
}: {
	className?: string
	action: ActionView
	onActionHandled?: (action: ActionView) => void
}) {
	const { t } = useTranslation()
	const { api } = useApi()
	const contentRes = T.decode(tFileShareAction.props.content, action.content)
	const content = T.isOk(contentRes) ? contentRes.ok : undefined
	if (!content) return null

	async function onAccept() {
		if (!api || !action?.actionId) return
		await api.actions.accept(action.actionId)
		onActionHandled?.(action)
	}

	async function onReject() {
		if (!api || !action?.actionId) return
		await api.actions.reject(action.actionId)
		onActionHandled?.(action)
	}

	const actionable = action.status === 'C'

	return (
		<NotificationCard
			action={action}
			actionable={actionable}
			className={className}
			title={t('Wants to share a file with you')}
			actions={actionable && <AcceptRejectActions onAccept={onAccept} onReject={onReject} />}
		>
			<Text as="div">
				{t('Filename')}: <Text weight="semibold">{content.fileName}</Text>
			</Text>
			<Text as="div">
				{t('Type')}: <Text weight="semibold">{content.contentType}</Text>
			</Text>
		</NotificationCard>
	)
}

function InviteNotification({
	className,
	action,
	onActionHandled
}: {
	className?: string
	action: ActionView
	onActionHandled?: (action: ActionView) => void
}) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api } = useApi()
	const urlContext = useCtx().base
	const { switchTo } = useContextSwitch()

	// Community invites use an '@'-prefixed tenant id tag as subject; message-group
	// invites use a bare action id. The '@' prefix is the discriminator.
	const isCommunityInvite = action.subject?.startsWith('@') ?? false
	const communityIdTag = isCommunityInvite ? action.subject!.slice(1) : undefined

	// Parse invitation content (may contain role, message, groupName)
	const rawContent = action.content
	const content =
		typeof rawContent === 'string'
			? { message: rawContent }
			: (rawContent as { role?: string; message?: string; groupName?: string } | undefined)

	async function onAccept() {
		if (!api || !action?.actionId) return

		// Accept the invitation
		await api.actions.accept(action.actionId)
		onActionHandled?.(action)

		if (communityIdTag) {
			// Community invite: switch into the community context (lands on feed).
			// A failure here is non-fatal — the invite is already accepted.
			try {
				await switchTo(communityIdTag)
			} catch (err) {
				console.error('Failed to switch context:', err)
			}
		} else if (action.subject) {
			// Message-group invite: open the group conversation
			navigate(messagesPath(urlContext, action.subject))
		}
	}

	async function onReject() {
		if (!api || !action?.actionId) return
		await api.actions.reject(action.actionId)
		onActionHandled?.(action)
	}

	const actionable = action.status === 'C'

	return (
		<NotificationCard
			action={action}
			actionable={actionable}
			className={className}
			header={
				action.subjectProfile && (
					<ProfileAudienceCard
						audience={action.subjectProfile}
						profile={action.issuer}
						hat={action.hat}
						profileBasePath={profilePath(urlContext)}
					/>
				)
			}
			title={
				isCommunityInvite
					? t('Invited you to join this community')
					: t('Invited you to join this group')
			}
			actions={actionable && <AcceptRejectActions onAccept={onAccept} onReject={onReject} />}
		>
			{!action.subjectProfile && content?.groupName && (
				<Text as="div" emphasis="muted">
					{isCommunityInvite ? t('Community') : t('Group')}:{' '}
					<Text weight="semibold">{content.groupName}</Text>
				</Text>
			)}
			{content?.message && (
				<Text as="p" className="c-notification-message">
					{content.message}
				</Text>
			)}
		</NotificationCard>
	)
}

function ProfileInviteNotification({
	className,
	action,
	onActionHandled
}: {
	className?: string
	action: ActionView
	onActionHandled?: (action: ActionView) => void
}) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api } = useApi()
	const urlContext = useCtx().base

	const rawContent = action.content
	const content =
		typeof rawContent === 'string'
			? { message: rawContent }
			: (rawContent as
					| { refId?: string; inviteUrl?: string; nodeName?: string; message?: string }
					| undefined)

	const actionable = action.status === 'C'

	async function onAccept() {
		if (!api || !action?.actionId) return
		await api.actions.accept(action.actionId)
		onActionHandled?.(action)

		// Navigate to community creation with invite pre-selected
		navigate(
			communityCreatePath(
				urlContext,
				undefined,
				content?.refId ? { invite: content.refId } : undefined
			)
		)
	}

	async function onReject() {
		if (!api || !action?.actionId) return
		await api.actions.reject(action.actionId)
		onActionHandled?.(action)
	}

	return (
		<NotificationCard
			action={action}
			actionable={actionable}
			className={className}
			title={t('Invited you to create a community')}
			actions={actionable && <AcceptRejectActions onAccept={onAccept} onReject={onReject} />}
		>
			{content?.nodeName && (
				<Text as="div" emphasis="muted">
					{t('Server')}: <Text weight="semibold">{content.nodeName}</Text>
				</Text>
			)}
			{content?.message && (
				<Text as="p" className="c-notification-message">
					{content.message}
				</Text>
			)}
		</NotificationCard>
	)
}

function Notification({
	action,
	onActionHandled,
	onDismiss
}: {
	action: ActionView
	onActionHandled?: (action: ActionView) => void
	onDismiss?: (action: ActionView) => void
}) {
	switch (action.type) {
		case 'CONN':
			return (
				<ConnectNotification
					action={action}
					onActionHandled={onActionHandled}
					onDismiss={onDismiss}
				/>
			)
		case 'FSHR':
			return <FileShareNotification action={action} onActionHandled={onActionHandled} />
		case 'INVT':
			return <InviteNotification action={action} onActionHandled={onActionHandled} />
		case 'PRINVT':
			return <ProfileInviteNotification action={action} onActionHandled={onActionHandled} />
		case 'MSG':
		case 'FLLW':
		case 'CMNT':
		case 'REACT':
		case 'MNTN':
		case 'POST':
			return <GenericNotification action={action} onDismiss={onDismiss} />
		default:
			return null
	}
}

function sortByCreatedAtDesc(a: ActionView, b: ActionView): number {
	const ta = typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : a.createdAt
	const tb = typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : b.createdAt
	return tb - ta
}

function dateGroup(ts: string | number, nowTs: number, t: (key: string) => string): string {
	const d = typeof ts === 'string' ? new Date(ts).getTime() : ts
	// Compare against calendar boundaries — a timestamp from 23:00 yesterday
	// viewed at 03:00 today belongs in "Yesterday", not "Today" (a naive
	// elapsed-hours / 24 boundary would mislabel it).
	const startOfToday = new Date(nowTs)
	startOfToday.setHours(0, 0, 0, 0)
	const today = startOfToday.getTime()
	if (d >= today) return t('Today')
	if (d >= today - 86_400_000) return t('Yesterday')
	if (d >= today - 7 * 86_400_000) return t('This week')
	if (d >= today - 30 * 86_400_000) return t('This month')
	return t('Earlier')
}

export function Notifications() {
	const { t } = useTranslation()
	const location = useLocation()
	const { api } = useApi()
	const [auth] = useAuth()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)
	const [filter, setFilter] = React.useState<NotificationFilter>('unread')
	// "All" refetches with 'A' (Active/historical) included; every other filter
	// (incl. Unread and the type filters) loads the actionable/unread set ['C','N'].
	const loadStatus = filter === 'all' ? ['A', 'C', 'N'] : ['C', 'N']
	const {
		notifications,
		setNotifications,
		loadNotifications,
		dismissNotification,
		dismissAllNotifications
	} = useNotifications(loadStatus)

	React.useEffect(
		function onLocationEffect() {
			setShowFilter(false)
		},
		[location]
	)

	React.useEffect(
		function onLoadNotifications() {
			if (!api || !auth?.idTag) return
			// `loadNotifications` identity tracks the status set (statusKey), so
			// switching to/from "All" refetches; type filters that share ['C','N']
			// reuse the already-loaded set without a refetch.
			loadNotifications()
		},
		[auth, api, loadNotifications]
	)

	// Called after accept/reject — backend already updated, just remove from local state
	function onActionHandled(action: ActionView) {
		setNotifications((n) => ({
			notifications: n.notifications.filter((a) => a.actionId !== action.actionId)
		}))
	}

	const allowedTypes = FILTER_TYPE_MAP[filter]
	const filteredNotifications = React.useMemo(
		() =>
			notifications.notifications
				.filter((a) => !allowedTypes || allowedTypes.includes(a.type))
				.sort(sortByCreatedAtDesc),
		[notifications.notifications, allowedTypes]
	)

	// Re-key the bucketing memo on calendar-day rollover so a panel held open
	// across midnight relabels "Today" → "Yesterday" without needing a new
	// notification to land. Schedules a one-shot timer to the next midnight.
	const [dayKey, setDayKey] = React.useState(() => new Date().toDateString())
	React.useEffect(() => {
		const now = new Date()
		const nextMidnight = new Date(now)
		nextMidnight.setHours(24, 0, 0, 0)
		const handle = setTimeout(() => {
			setDayKey(new Date().toDateString())
		}, nextMidnight.getTime() - now.getTime())
		return () => clearTimeout(handle)
	}, [dayKey])

	const groupedNotifications = React.useMemo(() => {
		const now = Date.now()
		const buckets: { group: string; items: ActionView[] }[] = []
		for (const action of filteredNotifications) {
			const group = dateGroup(action.createdAt, now, t)
			const last = buckets[buckets.length - 1]
			if (last && last.group === group) {
				last.items.push(action)
			} else {
				buckets.push({ group, items: [action] })
			}
		}
		return buckets
	}, [filteredNotifications, t, dayKey])

	const filterLabel = FILTER_LABEL_MAP[filter](t)

	return (
		<Fcd.Container className="g-1">
			{!!auth && (
				<>
					<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
						<VBox gap={2} padding={2}>
							<FilterBar filter={filter} setFilter={setFilter} />
						</VBox>
					</Fcd.Filter>
					<Fcd.Content
						width="reading"
						header={
							<PageHeader
								title={t('Notifications')}
								subtitle={filter === 'all' ? undefined : filterLabel}
								actions={
									<>
										<FilterToggle onClick={() => setShowFilter(true)} />
										{notifications.notifications.some(
											(a) => a.status === 'N'
										) && (
											<Button
												variant="ghost"
												onClick={dismissAllNotifications}
											>
												{t('Mark all as read')}
											</Button>
										)}
									</>
								}
							/>
						}
					>
						{!filteredNotifications.length && (
							<EmptyState
								fill
								icon={<IcNotifications size={48} />}
								title={
									filter === 'all'
										? t('All caught up!')
										: t('No {{category}} notifications', {
												category: filterLabel.toLowerCase()
											})
								}
								description={
									filter === 'all'
										? t('You have no new notifications.')
										: undefined
								}
								actions={
									filter !== 'all' && (
										<Button onClick={() => setFilter('all')}>
											{t('Show all')}
										</Button>
									)
								}
							/>
						)}
						{groupedNotifications.map((bucket) => (
							<React.Fragment key={bucket.group}>
								<Heading
									level={4}
									overline
									className="c-notification-group-heading"
								>
									{bucket.group}
								</Heading>
								<List variant="divided" aria-label={bucket.group}>
									{bucket.items.map((action) => (
										<Notification
											key={action.actionId}
											action={action}
											onActionHandled={onActionHandled}
											onDismiss={dismissNotification}
										/>
									))}
								</List>
							</React.Fragment>
						))}
					</Fcd.Content>
				</>
			)}
		</Fcd.Container>
	)
}

// vim: ts=4

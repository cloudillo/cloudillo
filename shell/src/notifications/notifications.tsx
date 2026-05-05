// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
	LuCheck as IcAccept,
	LuX as IcReject,
	LuBell as IcNotifications,
	LuUsers as IcConnections,
	LuMessageSquare as IcMessages,
	LuHeart as IcSocial,
	LuFile as IcFiles,
	LuMenu as IcMenu
} from 'react-icons/lu'

import * as T from '@symbion/runtype'

import { type ActionView, tConnectAction, tFileShareAction } from '@cloudillo/types'
import {
	useAuth,
	useApi,
	Button,
	ProfileCard,
	ProfileAudienceCard,
	Fcd,
	mergeClasses,
	generateFragments,
	TimeFormat
} from '@cloudillo/react'

import { useNotifications } from './state'
import { HOME_CONTEXT, useUrlContextIdTag } from '../context/index.js'
import './notifications.css'

type NotificationFilter = 'all' | 'connections' | 'messages' | 'social' | 'files'

function FilterBar({
	filter,
	setFilter
}: {
	filter: NotificationFilter
	setFilter: (f: NotificationFilter) => void
}) {
	const { t } = useTranslation()

	const filters: { key: NotificationFilter; label: string; icon: React.ReactNode }[] = [
		{ key: 'all', label: t('All'), icon: <IcNotifications /> },
		{ key: 'connections', label: t('Connections'), icon: <IcConnections /> },
		{ key: 'messages', label: t('Messages'), icon: <IcMessages /> },
		{ key: 'social', label: t('Social'), icon: <IcSocial /> },
		{ key: 'files', label: t('Files'), icon: <IcFiles /> }
	]

	return (
		<ul className="c-nav vertical low">
			{filters.map((f) => (
				<li key={f.key}>
					<button
						className={mergeClasses('c-nav-item', filter === f.key && 'active')}
						onClick={() => setFilter(f.key)}
					>
						{f.icon} {f.label}
					</button>
				</li>
			))}
		</ul>
	)
}

const FILTER_TYPE_MAP: Record<NotificationFilter, string[] | undefined> = {
	all: undefined,
	connections: ['CONN', 'PRINVT'],
	messages: ['MSG', 'INVT'],
	social: ['FLLW', 'CMNT', 'REACT', 'MNTN', 'POST'],
	files: ['FSHR']
}

const FILTER_LABEL_MAP: Record<NotificationFilter, (t: (k: string) => string) => string> = {
	all: (t) => t('All'),
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
	const urlContext = useUrlContextIdTag()

	return (
		<div className={mergeClasses('c-panel c-notification', className)}>
			<div className="c-hbox align-items-center g-3">
				<Link to={`/profile/${urlContext || HOME_CONTEXT}/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer} />
				</Link>
				<small className="ms-auto text-nowrap text-muted">
					<TimeFormat time={action.createdAt} />
				</small>
			</div>
			<div className="c-vbox g-1">
				<h3 className="c-notification-title">
					{getNotificationDescription(action.type, t)}
				</h3>
			</div>
			{onDismiss && (
				<div className="c-hbox g-2 justify-content-end flex-wrap pt-1">
					<Button onClick={() => onDismiss(action)}>
						<IcReject /> {t('Dismiss')}
					</Button>
				</div>
			)}
		</div>
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
	const urlContext = useUrlContextIdTag()
	const contentRes = T.decode(tConnectAction.props.content, action.content)
	const content = T.isOk(contentRes) ? contentRes.ok : undefined

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
		<div
			className={mergeClasses(
				'c-panel c-notification',
				actionable && 'actionable',
				className
			)}
		>
			<div className="c-hbox align-items-center g-3">
				<Link to={`/profile/${urlContext || HOME_CONTEXT}/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer} />
				</Link>
				<small className="ms-auto text-nowrap text-muted">
					<TimeFormat time={action.createdAt} />
				</small>
			</div>
			<div className="c-vbox g-1">
				{action.subType === 'DEL' ? (
					<h3 className="c-notification-title">
						{t('User disconnected, or refused to connect')}
					</h3>
				) : (
					<>
						<h3 className="c-notification-title">
							{action.status === 'C'
								? t('Wants to connect')
								: t('is now a connection')}
						</h3>
						{!action.subType &&
							content?.split('\n\n').map((paragraph, i) => (
								<p key={i} className="c-notification-message">
									{paragraph.split('\n').map((line, i) => (
										<React.Fragment key={i}>
											{generateFragments(line).map((n, i) => (
												<React.Fragment key={i}>{n}</React.Fragment>
											))}
											<br />
										</React.Fragment>
									))}
								</p>
							))}
					</>
				)}
			</div>
			{actionable ? (
				<div className="c-hbox g-2 justify-content-end flex-wrap pt-1">
					<Button variant="primary" onClick={onAccept}>
						<IcAccept /> {t('Accept')}
					</Button>
					<Button onClick={onReject}>
						<IcReject /> {t('Reject')}
					</Button>
				</div>
			) : (
				onDismiss && (
					<div className="c-hbox g-2 justify-content-end flex-wrap pt-1">
						<Button onClick={() => onDismiss(action)}>
							<IcReject /> {t('Dismiss')}
						</Button>
					</div>
				)
			)}
		</div>
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
	const urlContext = useUrlContextIdTag()
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
		<div
			className={mergeClasses(
				'c-panel c-notification',
				actionable && 'actionable',
				className
			)}
		>
			<div className="c-hbox align-items-center g-3">
				<Link to={`/profile/${urlContext || HOME_CONTEXT}/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer} />
				</Link>
				<small className="ms-auto text-nowrap text-muted">
					<TimeFormat time={action.createdAt} />
				</small>
			</div>
			<div className="c-vbox g-1">
				<h3 className="c-notification-title">{t('Wants to share a file with you')}</h3>
				<div>
					{t('Filename')}: <span className="text-emph">{content.fileName}</span>
				</div>
				<div>
					{t('Type')}: <span className="text-emph">{content.contentType}</span>
				</div>
			</div>
			{actionable && (
				<div className="c-hbox g-2 justify-content-end flex-wrap pt-1">
					<Button variant="primary" onClick={onAccept}>
						<IcAccept /> {t('Accept')}
					</Button>
					<Button onClick={onReject}>
						<IcReject /> {t('Reject')}
					</Button>
				</div>
			)}
		</div>
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
	const urlContext = useUrlContextIdTag()

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

		// Navigate to the group conversation
		if (action.subject) {
			navigate(`/app/${urlContext || HOME_CONTEXT}/messages/${action.subject}`)
		}
	}

	async function onReject() {
		if (!api || !action?.actionId) return
		await api.actions.reject(action.actionId)
		onActionHandled?.(action)
	}

	const actionable = action.status === 'C'

	return (
		<div
			className={mergeClasses(
				'c-panel c-notification',
				actionable && 'actionable',
				className
			)}
		>
			<div className="c-hbox align-items-center g-3">
				{action.subjectProfile ? (
					<Link
						to={`/profile/${urlContext || HOME_CONTEXT}/${action.subjectProfile.idTag}`}
					>
						<ProfileAudienceCard
							audience={action.subjectProfile}
							profile={action.issuer}
						/>
					</Link>
				) : (
					<Link to={`/profile/${urlContext || HOME_CONTEXT}/${action.issuer.idTag}`}>
						<ProfileCard profile={action.issuer} />
					</Link>
				)}
				<small className="ms-auto text-nowrap text-muted">
					<TimeFormat time={action.createdAt} />
				</small>
			</div>
			<div className="c-vbox g-1">
				<h3 className="c-notification-title">{t('Invited you to join this group')}</h3>
				{!action.subjectProfile && content?.groupName && (
					<div className="text-muted">
						{t('Group')}: <span className="text-emph">{content.groupName}</span>
					</div>
				)}
				{content?.message && <p className="c-notification-message">{content.message}</p>}
			</div>
			{actionable && (
				<div className="c-hbox g-2 justify-content-end flex-wrap pt-1">
					<Button variant="primary" onClick={onAccept}>
						<IcAccept /> {t('Accept')}
					</Button>
					<Button onClick={onReject}>
						<IcReject /> {t('Reject')}
					</Button>
				</div>
			)}
		</div>
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
	const urlContext = useUrlContextIdTag()

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
		const idTag = urlContext || HOME_CONTEXT
		if (content?.refId) {
			navigate(`/communities/create/${idTag}?invite=${content.refId}`)
		} else {
			navigate(`/communities/create/${idTag}`)
		}
	}

	async function onReject() {
		if (!api || !action?.actionId) return
		await api.actions.reject(action.actionId)
		onActionHandled?.(action)
	}

	return (
		<div
			className={mergeClasses(
				'c-panel c-notification',
				actionable && 'actionable',
				className
			)}
		>
			<div className="c-hbox align-items-center g-3">
				<Link to={`/profile/${urlContext || HOME_CONTEXT}/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer} />
				</Link>
				<small className="ms-auto text-nowrap text-muted">
					<TimeFormat time={action.createdAt} />
				</small>
			</div>
			<div className="c-vbox g-1">
				<h3 className="c-notification-title">{t('Invited you to create a community')}</h3>
				{content?.nodeName && (
					<div className="text-muted">
						{t('Server')}: <span className="text-emph">{content.nodeName}</span>
					</div>
				)}
				{content?.message && <p className="c-notification-message">{content.message}</p>}
			</div>
			{actionable && (
				<div className="c-hbox g-2 justify-content-end flex-wrap pt-1">
					<Button variant="primary" onClick={onAccept}>
						<IcAccept /> {t('Accept')}
					</Button>
					<Button onClick={onReject}>
						<IcReject /> {t('Reject')}
					</Button>
				</div>
			)}
		</div>
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
	const [filter, setFilter] = React.useState<NotificationFilter>('all')
	const {
		notifications,
		setNotifications,
		loadNotifications,
		dismissNotification,
		dismissAllNotifications
	} = useNotifications()

	React.useEffect(
		function onLocationEffect() {
			setShowFilter(false)
		},
		[location]
	)

	React.useEffect(
		function onLoadNotifications() {
			if (!api || !auth?.idTag) return
			loadNotifications()
		},
		[auth, api]
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
						<FilterBar filter={filter} setFilter={setFilter} />
					</Fcd.Filter>
					<Fcd.Content>
						<div
							className={mergeClasses(
								'c-nav c-hbox justify-content-between align-items-center',
								!notifications.notifications.length && 'md-hide lg-hide'
							)}
						>
							<div className="c-hbox align-items-center g-2 md-hide lg-hide">
								<IcMenu onClick={() => setShowFilter(true)} />
								<h3>{t('Notifications')}</h3>
							</div>
							{!!notifications.notifications.length && (
								<Button
									kind="link"
									className="ms-auto"
									onClick={dismissAllNotifications}
								>
									{t('Clear all')}
								</Button>
							)}
						</div>
						{!filteredNotifications.length && (
							<div className="c-vbox align-items-center justify-content-center p-4 text-muted">
								<IcNotifications size={48} />
								<h3 className="mt-2">
									{filter === 'all'
										? t('All caught up!')
										: t('No {{category}} notifications', {
												category: filterLabel
											})}
								</h3>
								{filter === 'all' ? (
									<p>{t('You have no new notifications.')}</p>
								) : (
									<Button kind="link" onClick={() => setFilter('all')}>
										{t('Show all')}
									</Button>
								)}
							</div>
						)}
						{groupedNotifications.map((bucket) => (
							<React.Fragment key={bucket.group}>
								<h4 className="c-notification-group-heading">{bucket.group}</h4>
								{bucket.items.map((action) => (
									<Notification
										key={action.actionId}
										action={action}
										onActionHandled={onActionHandled}
										onDismiss={dismissNotification}
									/>
								))}
							</React.Fragment>
						))}
					</Fcd.Content>
					<Fcd.Details></Fcd.Details>
				</>
			)}
		</Fcd.Container>
	)
}

// vim: ts=4

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

import {
	NewAction,
	ActionView,
	tActionView,
	tConnectAction,
	tFileShareAction
} from '@cloudillo/types'
import {
	useAuth,
	useApi,
	Button,
	ProfilePicture,
	ProfileCard,
	ProfileAudienceCard,
	Fcd,
	mergeClasses,
	generateFragments,
	TimeFormat
} from '@cloudillo/react'

import { useNotifications } from './state'
import { useCurrentContextIdTag } from '../context/index.js'

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
	connections: ['CONN'],
	messages: ['MSG', 'INVT'],
	social: ['FLLW', 'CMNT', 'REACT', 'MNTN', 'POST'],
	files: ['FSHR']
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

	return (
		<div className={mergeClasses('c-panel g-2', className)}>
			<div className="c-panel-header c-hbox">
				<Link to={`/profile/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer} />
				</Link>
				<div className="c-hbox ms-auto g-3 align-items-center">
					<TimeFormat time={action.createdAt} />
					{onDismiss && (
						<Button link onClick={() => onDismiss(action)}>
							<IcReject />
						</Button>
					)}
				</div>
			</div>
			<div className="d-flex flex-column">
				<h3>{getNotificationDescription(action.type, t)}</h3>
			</div>
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
	const { api, setIdTag } = useApi()
	const contentRes = T.decode(tConnectAction.props.content, action.content)
	const content = T.isOk(contentRes) ? contentRes.ok : undefined

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
		<div className={mergeClasses('c-panel g-2', className)}>
			<div className="c-panel-header c-hbox">
				<Link to={`/profile/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer} />
				</Link>
				<div className="c-hbox ms-auto g-3 align-items-center">
					<TimeFormat time={action.createdAt} />
					{action.status == 'C' && (
						<Button link onClick={onAccept}>
							<IcAccept />
						</Button>
					)}
					{action.status == 'C' && (
						<Button link onClick={onReject}>
							<IcReject />
						</Button>
					)}
					{action.status != 'C' && onDismiss && (
						<Button link onClick={() => onDismiss(action)}>
							<IcReject />
						</Button>
					)}
				</div>
			</div>
			<div className="d-flex flex-column">
				{!action.subType && (
					<>
						<h3>
							{action.status == 'C' ? t('Wants to connect') : t('Connected with you')}
						</h3>
						{content &&
							content.split('\n\n').map((paragraph, i) => (
								<p key={i}>
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
				{action.subType == 'DEL' && (
					<>
						<h3>{t('User disconnected, or refused to connect')}</h3>
					</>
				)}
			</div>
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
	const { api, setIdTag } = useApi()
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

	return (
		<div className={mergeClasses('c-panel g-2', className)}>
			<div className="c-panel-header c-hbox">
				<Link to={`/profile/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer} />
				</Link>
				<div className="c-hbox ms-auto g-3 align-items-center">
					<TimeFormat time={action.createdAt} />
					<Button link onClick={onAccept}>
						<IcAccept />
					</Button>
					<Button link onClick={onReject}>
						<IcReject />
					</Button>
				</div>
			</div>
			<div className="d-flex flex-column">
				<h3>{t('Wants to share a file with you')}</h3>
				<div>
					Filename: <span className="text-emph">{content.fileName}</span>
				</div>
				<div>
					Type: <span className="text-emph">{content.contentType}</span>
				</div>
			</div>
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
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()

	// Parse invitation content (may contain role, message, groupName)
	const content = action.content as
		| { role?: string; message?: string; groupName?: string }
		| undefined

	async function onAccept() {
		if (!api || !action?.actionId) return

		// Accept the invitation
		await api.actions.accept(action.actionId)
		onActionHandled?.(action)

		// Navigate to the group conversation
		if (action.subject) {
			navigate(`/app/${contextIdTag || auth?.idTag}/messages/${action.subject}`)
		}
	}

	async function onReject() {
		if (!api || !action?.actionId) return
		await api.actions.reject(action.actionId)
		onActionHandled?.(action)
	}

	return (
		<div className={mergeClasses('c-panel g-2', className)}>
			<div className="c-panel-header c-hbox">
				<Link to={`/profile/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer} />
				</Link>
				<div className="c-hbox ms-auto g-3 align-items-center">
					<TimeFormat time={action.createdAt} />
					<Button link onClick={onAccept} title={t('Accept')}>
						<IcAccept />
					</Button>
					<Button link onClick={onReject} title={t('Reject')}>
						<IcReject />
					</Button>
				</div>
			</div>
			<div className="d-flex flex-column">
				<h3>{t('Invited you to join a group')}</h3>
				{content?.groupName && (
					<div className="text-muted">
						{t('Group')}: <span className="text-emph">{content.groupName}</span>
					</div>
				)}
				{content?.message && <p className="mt-2">{content.message}</p>}
			</div>
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

export function Notifications() {
	const { t } = useTranslation()
	const location = useLocation()
	const { api, setIdTag } = useApi()
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
			notifications: n.notifications.filter((a) => a.actionId != action.actionId)
		}))
	}

	const allowedTypes = FILTER_TYPE_MAP[filter]
	const filteredNotifications = notifications.notifications
		.filter((a) => !allowedTypes || allowedTypes.includes(a.type))
		.sort(sortByCreatedAtDesc)

	return (
		<Fcd.Container className="g-1">
			{!!auth && (
				<>
					<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
						<FilterBar filter={filter} setFilter={setFilter} />
					</Fcd.Filter>
					<Fcd.Content>
						<div className="c-nav c-hbox justify-content-between align-items-center">
							<div className="c-hbox align-items-center g-2 md-hide lg-hide">
								<IcMenu onClick={() => setShowFilter(true)} />
								<h3>{t('Notifications')}</h3>
							</div>
							{!!notifications.notifications.length && (
								<Button link className="ms-auto" onClick={dismissAllNotifications}>
									{t('Clear all')}
								</Button>
							)}
						</div>
						{!filteredNotifications.length && (
							<div className="c-vbox align-items-center justify-content-center p-4 text-muted">
								<IcNotifications size={48} />
								<h3 className="mt-2">{t('All caught up!')}</h3>
								<p>{t('You have no new notifications.')}</p>
							</div>
						)}
						{filteredNotifications.map((action) => (
							<Notification
								key={action.actionId}
								action={action}
								onActionHandled={onActionHandled}
								onDismiss={dismissNotification}
							/>
						))}
					</Fcd.Content>
					<Fcd.Details></Fcd.Details>
				</>
			)}
		</Fcd.Container>
	)
}

// vim: ts=4

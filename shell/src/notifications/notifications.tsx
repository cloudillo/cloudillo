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
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LuCheck as IcAccept, LuX as IcReject, LuFilter as IcFilter } from 'react-icons/lu'

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
	generateFragments
} from '@cloudillo/react'

import { useNotifications } from './state'
import { useCurrentContextIdTag } from '../context/index.js'

function FilterBar() {
	return null
}

function ConnectNotification({
	className,
	action,
	onClick
}: {
	className?: string
	action: ActionView
	onClick?: (action: ActionView) => void
}) {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const contentRes = T.decode(tConnectAction.props.content, action.content)
	const content = T.isOk(contentRes) ? contentRes.ok : undefined

	async function onAccept() {
		if (!api || !action?.actionId) return
		console.log('accept')
		await api.actions.accept(action.actionId)
		onClick?.(action)
	}

	async function onReject() {
		if (!api || !action?.actionId) return
		console.log('reject')
		await api.actions.reject(action.actionId)
		onClick?.(action)
	}

	return (
		<div className={mergeClasses('c-panel g-2', className)}>
			<div className="c-panel-header c-hbox">
				<Link to={`/profile/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer} />
				</Link>
				<div className="c-hbox ms-auto g-3">
					<Button link onClick={onAccept}>
						<IcAccept />
					</Button>
					{action.status == 'C' && (
						<Button link onClick={onReject}>
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
	onClick
}: {
	className?: string
	action: ActionView
	onClick?: (action: ActionView) => void
}) {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const contentRes = T.decode(tFileShareAction.props.content, action.content)
	const content = T.isOk(contentRes) ? contentRes.ok : undefined
	if (!content) return null

	async function onAccept() {
		if (!api || !action?.actionId) return
		console.log('accept')
		await api.actions.accept(action.actionId)
		onClick?.(action)
	}

	async function onReject() {
		if (!api || !action?.actionId) return
		console.log('reject')
		await api.actions.reject(action.actionId)
		onClick?.(action)
	}

	return (
		<div className={mergeClasses('c-panel g-2', className)}>
			<div className="c-panel-header c-hbox">
				<Link to={`/profile/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer} />
				</Link>
				<div className="c-hbox ms-auto g-3">
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
	onClick
}: {
	className?: string
	action: ActionView
	onClick?: (action: ActionView) => void
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
		onClick?.(action)

		// Navigate to the group conversation
		if (action.subject) {
			navigate(`/app/${contextIdTag || auth?.idTag}/messages/${action.subject}`)
		}
	}

	async function onReject() {
		if (!api || !action?.actionId) return
		await api.actions.reject(action.actionId)
		onClick?.(action)
	}

	return (
		<div className={mergeClasses('c-panel g-2', className)}>
			<div className="c-panel-header c-hbox">
				<Link to={`/profile/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer} />
				</Link>
				<div className="c-hbox ms-auto g-3">
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
	onClick
}: {
	action: ActionView
	onClick?: (action: ActionView) => void
}) {
	switch (action.type) {
		case 'CONN':
			return <ConnectNotification action={action} onClick={onClick} />
		case 'FSHR':
			return <FileShareNotification action={action} onClick={onClick} />
		case 'INVT':
			return <InviteNotification action={action} onClick={onClick} />
		default:
			return null
	}
}

export function Notifications() {
	const { t } = useTranslation()
	const location = useLocation()
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)
	//const [notifications, setNotifications] = React.useState<ActionView[] | undefined>()
	const { notifications, setNotifications, loadNotifications } = useNotifications()

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
			/*
		;(async function () {
			//const res = await api.get<{ actions: ActionEvt[] }>('', `/action?audience=${idTag}&types=POST`)
			const res = await api.get<{ actions: ActionView[] }>('', `/action?status=N`)
			console.log('RES', res)
			setNotifications(res.actions)
		})()
		*/
		},
		[auth, api]
	)

	function onClick(action: ActionView) {
		console.log('onClick', action)
		setNotifications((n) => ({
			notifications: n.notifications.filter((a) => a.actionId != action.actionId)
		}))
	}

	return (
		<Fcd.Container className="g-1">
			{!!auth && (
				<>
					<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
						<FilterBar />
					</Fcd.Filter>
					<Fcd.Content>
						<div className="c-nav c-hbox md-hide lg-hide">
							<IcFilter onClick={() => setShowFilter(true)} />
						</div>
						{notifications && !notifications.notifications.length && (
							<h3>{t('You have no notifications')}</h3>
						)}
						{!!notifications &&
							notifications.notifications.map((action) => (
								<Notification
									key={action.actionId}
									action={action}
									onClick={onClick}
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

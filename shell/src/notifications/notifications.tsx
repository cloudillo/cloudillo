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

import {
	LuCheck as IcAccept,
	LuX as IcReject
} from 'react-icons/lu'

import * as T from '@symbion/runtype'

import { NewAction, ActionView, tActionView, tConnectAction, tFileShareAction } from '@cloudillo/types'
import { useAuth, useApi, Button, ProfilePicture, ProfileCard, ProfileAudienceCard, Fcb, mergeClasses, generateFragments } from '@cloudillo/react'

function FilterBar() {
	return null
}

function ConnectNotification({ className, action, onClick }: { className?: string, action: ActionView, onClick?: (action: ActionView) => void }) {
	const { t } = useTranslation()
	const api = useApi()
	const contentRes = T.decode(tConnectAction.props.content, action.content)
	const content = T.isOk(contentRes) ? contentRes.ok : undefined

	async function onAccept() {
		console.log('accept')
		await api.post('', `/action/${action?.actionId}/accept`)
		onClick?.(action)
	}

	async function onReject() {
		console.log('reject')
		await api.post('', `/action/${action?.actionId}/reject`)
		onClick?.(action)
	}

	return <div className={mergeClasses('c-panel g-2', className)}>
		<div className="c-panel-header c-hbox">
			<Link to={`/profile/${action.issuer.idTag}`}>
				<ProfileCard profile={action.issuer}/>
			</Link>
			<div className="c-hbox ms-auto g-3">
				<button className="c-link" onClick={onAccept}><IcAccept/></button>
				<button className="c-link" onClick={onReject}><IcReject/></button>
			</div>
		</div><div className="d-flex flex-column">
			{ !action.subType && <>
				<h3>{ t('Connection request') }</h3>
				{ content && content.split('\n\n').map((paragraph, i) => <p key={i}>
					{ paragraph.split('\n').map((line, i) => <React.Fragment key={i}>
						{ generateFragments(line).map((n, i) => <React.Fragment key={i}>{n}</React.Fragment>) }
					<br/></React.Fragment>) }
				</p>) }
			</> }
			{ action.subType == 'DEL' && <>
				<h3>{ t('Refused to connect') }</h3>
			</> }
		</div>
	</div>
}

function FileShareNotification({ className, action, onClick }: { className?: string, action: ActionView, onClick?: (action: ActionView) => void }) {
	const { t } = useTranslation()
	const api = useApi()
	const contentRes = T.decode(tFileShareAction.props.content, action.content)
	const content = T.isOk(contentRes) ? contentRes.ok : undefined
	if (!content) return null

	async function onAccept() {
		console.log('accept')
		await api.post('', `/action/${action?.actionId}/accept`)
		onClick?.(action)
	}

	async function onReject() {
		console.log('reject')
		await api.post('', `/action/${action?.actionId}/reject`)
		onClick?.(action)
	}

	return <div className={mergeClasses('c-panel g-2', className)}>
		<div className="c-panel-header c-hbox">
			<Link to={`/profile/${action.issuer.idTag}`}>
				<ProfileCard profile={action.issuer}/>
			</Link>
			<div className="c-hbox ms-auto g-3">
				<button className="c-link" onClick={onAccept}><IcAccept/></button>
				<button className="c-link" onClick={onReject}><IcReject/></button>
			</div>
		</div><div className="d-flex flex-column">
			<div>{ content.fileName }</div>
			<div>{ content.contentType }</div>
		</div>
	</div>
}

function Notification({ action, onClick }: { action: ActionView, onClick?: (action: ActionView) => void }) {
	switch (action.type) {
		case 'CONN': return <ConnectNotification action={action} onClick={onClick}/>
		case 'FSHR': return <FileShareNotification action={action} onClick={onClick}/>
		default: return null
	}
}

export function Notifications() {
	const { t } = useTranslation()
	const api = useApi()
	const [auth] = useAuth()
	const [notifications, setNotifications] = React.useState<ActionView[] | undefined>()

	React.useEffect(function onLoadNotifications() {
		if (!api || !auth) return
		const idTag = auth?.idTag

		;(async function () {
			//const res = await api.get<{ actions: ActionEvt[] }>('', `/action?audience=${idTag}&types=POST`)
			const res = await api.get<{ actions: ActionView[] }>('', `/action?statuses=N`)
			console.log('RES', res)
			setNotifications(res.actions)
		})()
	}, [auth, api])

	function onClick(action: ActionView) {
		console.log('onClick', action)
		setNotifications(n => n?.filter(a => a.actionId != action.actionId))
	}

	return <Fcb.Container className="g-1">
		{ !!auth && <>
			<Fcb.Filter>
				<FilterBar/>
			</Fcb.Filter>
			<Fcb.Content>
				{ notifications && !notifications.length && <h3>{ t('You have no notifications') }</h3> }
				{ !!notifications && notifications.map(action =>  <Notification key={action.actionId} action={action} onClick={onClick}/>) }
			</Fcb.Content>
			<Fcb.Details>
			</Fcb.Details>
		</> }
	</Fcb.Container>
}

// vim: ts=4

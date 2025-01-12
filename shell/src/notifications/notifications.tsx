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

import { NewAction, ActionView, tActionView, tCommentAction } from '@cloudillo/types'
import { useAuth, useApi, Button, ProfilePicture, ProfileCard, ProfileAudienceCard, Fcb, mergeClasses, generateFragments } from '@cloudillo/react'

function FilterBar() {
	return null
}

function Notification({ className, action }: { className?: string, action: ActionView }) {
	const { t } = useTranslation()
	const api = useApi()

	async function onAccept() {
		console.log('accept')
		await api.post('', `/action/${action.actionId}/accept`)
	}

	async function onReject() {
		console.log('reject')
		await api.post('', `/action/${action.actionId}/reject`)
	}

	return <div className={mergeClasses('c-panel g-2', className)}>
		<div className="c-panel-header c-hbox">
			<Link to={`/profile/${action.issuer.idTag}`}>
				<ProfileCard profile={action.issuer}/>
			</Link>
			<div className="c-hbox ms-auto g-3">
				<button className="c-link" onClick={onAccept}><IcAccept/></button>
				<button className="c-link" onClick={onReject}><IcReject/></button>
				{/*
				<button className="c-link" onClick={() => console.log('share')}><IcRepost/></button>
				<button className="c-link" onClick={() => console.log('more')}><IcMore/></button>
				*/}
			</div>
		</div><div className="d-flex flex-column">
			{ typeof action.content == 'string' && action.content.split('\n\n').map((paragraph, i) => <p key={i}>
				{ paragraph.split('\n').map((line, i) => <React.Fragment key={i}>
					{ generateFragments(line).map((n, i) => <React.Fragment key={i}>{n}</React.Fragment>) }
				<br/></React.Fragment>) }
			</p>) }
		</div>
	</div>
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
			const res = await api.get<{ actions: ActionView[] }>('', `/action?types=CONN,FLLW,FSHR`)
			console.log('RES', res)
			setNotifications(res.actions)
		})()
	}, [auth, api])


	return <Fcb.Container className="g-1">
		{ !!auth && <>
			<Fcb.Filter>
				<FilterBar/>
			</Fcb.Filter>
			<Fcb.Content>
				{ !!notifications && notifications.map(action =>  <Notification key={action.actionId} action={action}/>) }
			</Fcb.Content>
			<Fcb.Details>
			</Fcb.Details>
		</> }
	</Fcb.Container>
}

// vim: ts=4

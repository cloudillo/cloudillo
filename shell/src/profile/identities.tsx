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
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import {
	LuSearch as IcSearch,
	LuFilter as IcFilter,
	LuUser as IcUser,
	LuUserPlus as IcUserFollowing,
	LuUserPlus as IcUserFollowed,
	LuHandshake as IcUserConnected,
	LuCircleOff as IcUserBlocked,
	LuUsers as IcUserAll
} from 'react-icons/lu'

import { useApi, useAuth, Fcd, Button, ProfileCard, mergeClasses } from '@cloudillo/react'
import { useAppConfig, parseQS, qs } from '../utils.js'

export interface Profile {
	idTag: string
	name: string
	profilePic?: string
	following?: boolean
	connected?: true | 'R'
	status: 'A' | 'B' | 'T'
}

function ProfileStatusIcon({
	profile
}: {
	profile: { connected?: true | 'R'; following?: boolean; status: 'A' | 'B' | 'T' }
}) {
	if (profile.connected) return <IcUserConnected className="text-success" />
	if (profile.connected == 'R') return <IcUserConnected className="text-warning" />
	if (profile.following) return <IcUserFollowing className="text-success" />
	if (profile.status == 'B') return <IcUserBlocked className="text-error" />
	return <IcUser />
}

function FilterBar({ className }: { className?: string }) {
	const { t } = useTranslation()
	const { api } = useApi()
	const location = useLocation()
	const navigate = useNavigate()
	const userStat = { all: 0, connected: 0, followed: 0, following: 0, trusted: 0 }

	const qs = parseQS(location.search)
	console.log('qs', qs)

	return (
		<ul className={'c-nav vertical low' + (className || '')}>
			<li className="c-nav-item">
				<Link
					className={'c-nav-link ' + (qs.filter === 'connected' ? 'active' : '')}
					to="?connected=1"
				>
					<IcUserConnected /> {t('Connected')}
					{!!userStat.connected && (
						<span className="c-badge bg error">{userStat.connected}</span>
					)}
				</Link>
			</li>
			<li className="c-nav-item">
				<Link
					className={'c-nav-link ' + (qs.filter === 'followed' ? 'active' : '')}
					to="?filter=followed"
				>
					<IcUserFollowed /> {t('Followed')}
					{!!userStat.followed && (
						<span className="c-badge bg error">{userStat.followed}</span>
					)}
				</Link>
			</li>
			<li className="c-nav-item">
				<Link className={'c-nav-link ' + (!qs.filter ? 'active' : '')} to="">
					<IcUserAll /> {t('All')}
					{!!userStat.all && <span className="c-badge bg error">{userStat.all}</span>}
				</Link>
			</li>
			<hr className="w-100" />

			<div className="c-input-group">
				<input type="text" className="c-input" placeholder="Search" />
				<button className="c-button secondary" type="button">
					<IcSearch />
				</button>
			</div>
		</ul>
	)
}

function ProfileDetails({ className }: { className?: string }) {
	const { t } = useTranslation()

	return <div className={'c-panel p-1 ' + (className || '')}></div>
}

export function ProfileListCard({ profile, srcTag }: { profile: Profile; srcTag?: string }) {
	const { t } = useTranslation()
	const params = useParams()
	const contextIdTag = params.contextIdTag!

	return (
		<Link
			className="c-panel p-1 mb-1 flex-row"
			to={`/profile/${contextIdTag}/${profile.idTag}`}
		>
			<ProfileCard className="flex-fill" profile={profile} srcTag={srcTag} />
			<ProfileStatusIcon profile={profile} />
		</Link>
	)
}

export function PersonListPage({ idTag }: { idTag?: string }) {
	const { t } = useTranslation()
	const location = useLocation()
	const params = useParams()
	const { api } = useApi()
	const [auth] = useAuth()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)
	const [profiles, setProfiles] = React.useState<Profile[]>([])
	// Extract contextIdTag from params if available (context-aware route)
	const contextIdTag = params.contextIdTag || idTag

	React.useEffect(
		function onLocationEffect() {
			setShowFilter(false)
		},
		[location]
	)

	React.useEffect(
		function loadPersonList() {
			if (!auth) return
			console.log('loadProfiles', auth, 'contextIdTag', contextIdTag)
			;(async function () {
				const qs: Record<string, string> = parseQS(location.search)
				console.log('QS', location.search, qs)

				const profiles = await api!.profiles.list({ type: 'person' })
				setProfiles(profiles as any)
			})()
		},
		[auth, location.search, contextIdTag]
	)

	return (
		<Fcd.Container className="g-1">
			<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
				<FilterBar />
			</Fcd.Filter>
			<Fcd.Content>
				<div className="c-nav c-hbox md-hide lg-hide">
					<IcFilter onClick={() => setShowFilter(true)} />
				</div>
				{!!profiles &&
					profiles.map((profile) => (
						<ProfileListCard key={profile.idTag} profile={profile} />
					))}
			</Fcd.Content>
			{/*
		<Fcd.Details isVisible={!!selectedFile} hide={() => setSelectedFile(undefined)}>
			{ selected && <div className="c-panel h-min-100">
				<h3 className="c-panel-title">
					{selected.name}
				</h3>
			</div> }
		</Fcd.Details>
		*/}
		</Fcd.Container>
	)
}

export function CommunityListPage() {
	const { t } = useTranslation()
	const location = useLocation()
	const params = useParams()
	const { api } = useApi()
	const [auth] = useAuth()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)
	const [profiles, setProfiles] = React.useState<Profile[]>([])
	// Extract contextIdTag from params if available (context-aware route)
	const contextIdTag = params.contextIdTag

	React.useEffect(
		function onLocationEffect() {
			setShowFilter(false)
		},
		[location]
	)

	React.useEffect(
		function loadCommunities() {
			if (!auth) return
			console.log('loadCommunities', auth, 'contextIdTag', contextIdTag)
			;(async function () {
				const qs: Record<string, string> = parseQS(location.search)
				console.log('QS', location.search, qs)

				const profiles = await api!.profiles.list({ type: 'community' })
				console.log('profiles', profiles)
				setProfiles(profiles as any)
			})()
		},
		[auth, location.search, contextIdTag]
	)

	return (
		<Fcd.Container className="g-1">
			<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
				<FilterBar />
			</Fcd.Filter>
			<Fcd.Content>
				<div className="c-nav c-hbox md-hide lg-hide">
					<IcFilter onClick={() => setShowFilter(true)} />
				</div>
				{!!profiles &&
					profiles.map((profile) => (
						<ProfileListCard key={profile.idTag} profile={profile} />
					))}
			</Fcd.Content>
			{/*
		<Fcd.Details isVisible={!!selectedFile} hide={() => setSelectedFile(undefined)}>
			{ selected && <div className="c-panel h-min-100">
				<h3 className="c-panel-title">
					{selected.name}
				</h3>
			</div> }
		</Fcd.Details>
		*/}
		</Fcd.Container>
	)
}

// vim: ts=4

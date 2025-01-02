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
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import {
	LuSearch as IcSearch,
	LuFilter as IcFilter,
	LuUserX as IcUserBlocked,
	LuUser as IcUser,
	LuUserPlus as IcUserFollowed,
	LuUserCheck as IcUserMutual,
	LuUsers as IcUserAll
} from 'react-icons/lu'

import { useApi, Fcb, Button, ProfileCard, mergeClasses } from '@cloudillo/react'
import { useAppConfig, parseQS, qs } from '../utils.js'

interface Profile {
	id: number
	idTag: string
	name: string
	profilePic?: string
	status: 'B' | 'F' | 'M' | 'T'
}

function FilterBar({ className }: { className?: string }) {
	const { t } = useTranslation()
	const api = useApi()
	const location = useLocation()
	const navigate = useNavigate()
	const userStat = { all: 0, followed: 0, mutual: 0, trusted: 0 }

	const qs = parseQS(location.search)

	return <ul className={'c-nav flex-column align-items-stretch ' + (className || '')}>
		<li className="c-nav-item">
			<Link className={'c-nav-link ' + (qs.filter === 'followed' ? 'active' : '')} to="?filter=followed"><IcUserFollowed/> {t('Followed')}
				{!!userStat.followed && <span className="badge rounded-pill bg-danger">{userStat.followed}</span>}
			</Link>
		</li>
		<li className="c-nav-item">
			<Link className={'c-nav-link ' + (!qs.filter ? 'active' : '')} to=""><IcUserAll/> {t('All')}
				{!!userStat.all && <span className="badge rounded-pill bg-danger">{userStat.all}</span>}
			</Link>
		</li>
		<hr className="w-100"/>

		<div className="c-input-group">
			<input type="text" className="c-input" placeholder="Search" />
			<button className="c-button secondary" type="button"><IcSearch/></button>
		</div>
	</ul>
}

function ProfileDetails({ className }: { className?: string }) {
	const { t } = useTranslation()
	
	return <div className={'c-panel p-1 ' + (className || '')}>
	</div>
}

function ProfileListCard({ profile }: { profile: Profile }) {
	const { t } = useTranslation()

	return <Link className="c-panel p-1 mb-1" to={`/profile/${profile.idTag}`}>
		<ProfileCard profile={profile}/>
	</Link>
}

export function UserListPage() {
	const { t } = useTranslation()
	const location = useLocation()
	const api = useApi()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)
	const [profiles, setProfiles] = React.useState<Profile[]>([])

	React.useEffect(function onLocationEffect() {
		setShowFilter(false)
	}, [location])

	React.useEffect(function loadUsers() {
		(async function () {
			const qs: Record<string, string> = parseQS(location.search)
			console.log('QS', location.search, qs)

			const res = await api.get<{ profiles: Profile[] }>('', '/profile', {
				query: { ...qs, type: 'U' }
			})
			setProfiles(res.profiles)
		})()
	}, [])

	return <Fcb.Container className="g-1">
		<Fcb.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
			<FilterBar/>
		</Fcb.Filter>
		<Fcb.Content>
			<div className="c-nav c-hbox md-hide lg-hide">
				<IcFilter onClick={() => setShowFilter(true)}/>
			</div>
			{ !!profiles && profiles.map(profile => <ProfileListCard key={profile.idTag} profile={profile}/>) }
		</Fcb.Content>
		{/*
		<Fcb.Details isVisible={!!selectedFile} hide={() => setSelectedFile(undefined)}>
			{ selected && <div className="c-panel h-min-100">
				<h3 className="c-panel-title">
					{selected.name}
				</h3>
			</div> }
		</Fcb.Details>
		*/}
	</Fcb.Container>
}

export function CommunityListPage() {
	const { t } = useTranslation()
	const location = useLocation()
	const api = useApi()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)
	const [profiles, setProfiles] = React.useState<Profile[]>([])

	React.useEffect(function onLocationEffect() {
		setShowFilter(false)
	}, [location])

	React.useEffect(function loadCommunities() {
		(async function () {
			const qs: Record<string, string> = parseQS(location.search)
			console.log('QS', location.search, qs)

			const res = await api.get<{ profiles: Profile[] }>('', '/profile', {
				query: { ...qs, type: 'C' }
			})
			console.log(res)
			setProfiles(res.profiles)
		})()
	}, [])

	return <Fcb.Container className="g-1">
		<Fcb.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
			<FilterBar/>
		</Fcb.Filter>
		<Fcb.Content>
			<div className="c-nav c-hbox md-hide lg-hide">
				<IcFilter onClick={() => setShowFilter(true)}/>
			</div>
			{ !!profiles && profiles.map(profile => <ProfileListCard key={profile.idTag} profile={profile}/>) }
		</Fcb.Content>
		{/*
		<Fcb.Details isVisible={!!selectedFile} hide={() => setSelectedFile(undefined)}>
			{ selected && <div className="c-panel h-min-100">
				<h3 className="c-panel-title">
					{selected.name}
				</h3>
			</div> }
		</Fcb.Details>
		*/}
	</Fcb.Container>
}

// vim: ts=4

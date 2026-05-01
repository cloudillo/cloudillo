// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
	LuSearch as IcSearch,
	LuFilter as IcFilter,
	LuUser as IcUser,
	LuUserPlus as IcUserFollowing,
	LuUserPlus as IcUserFollowed,
	LuHandshake as IcUserConnected,
	LuCircleOff as IcUserBlocked,
	LuUsers as IcUserAll,
	LuExternalLink as IcExternalLink,
	LuPlus as IcPlus,
	LuScanLine as IcScan
} from 'react-icons/lu'

import type { Profile } from '@cloudillo/types'
import { useApi, useAuth, Fcd, ProfileCard } from '@cloudillo/react'
import { parseQS } from '../utils.js'
import { useContextSwitch } from '../context/index.js'
import { useQrScanner } from '../components/QrScanner/index.js'

function ProfileStatusIcon({ profile }: { profile: Profile }) {
	// Check for exactly true (connected) vs 'R' (pending request)
	if (profile.connected === true) return <IcUserConnected className="text-success" />
	if (profile.connected === 'R') return <IcUserConnected className="text-warning" />
	if (profile.following) return <IcUserFollowing className="text-success" />
	if (profile.status === 'B') return <IcUserBlocked className="text-error" />
	return <IcUser />
}

function FilterBar({ className }: { className?: string }) {
	const { t } = useTranslation()
	const location = useLocation()
	const _navigate = useNavigate()
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
						<span className="c-badge bg bg-error">{userStat.connected}</span>
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
						<span className="c-badge bg bg-error">{userStat.followed}</span>
					)}
				</Link>
			</li>
			<li className="c-nav-item">
				<Link className={'c-nav-link ' + (!qs.filter ? 'active' : '')} to="">
					<IcUserAll /> {t('All')}
					{!!userStat.all && <span className="c-badge bg bg-error">{userStat.all}</span>}
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

function _ProfileDetails({ className }: { className?: string }) {
	return <div className={'c-panel p-1 ' + (className || '')}></div>
}

interface ProfileListCardProps {
	profile: Profile
	srcTag?: string
}

export function ProfileListCard({ profile, srcTag }: ProfileListCardProps) {
	const params = useParams()
	const contextIdTag = params.contextIdTag!

	return (
		<Link
			className="c-panel p-1 mb-1 flex-row ai-center"
			to={`/profile/${contextIdTag}/${profile.idTag}`}
		>
			<ProfileCard className="flex-fill" profile={profile} srcTag={srcTag} />
			<ProfileStatusIcon profile={profile} />
		</Link>
	)
}

interface CommunityListCardProps {
	profile: Profile
	srcTag?: string
}

export function CommunityListCard({ profile, srcTag }: CommunityListCardProps) {
	const { t } = useTranslation()
	const params = useParams()
	const navigate = useNavigate()
	const contextIdTag = params.contextIdTag!
	const { switchTo } = useContextSwitch()

	const isMember = profile.connected === true
	const profilePath = `/profile/${contextIdTag}/${profile.idTag}`

	const handleRowClick = () => {
		if (isMember) {
			switchTo(profile.idTag, '/feed').catch((err) => {
				console.error('Failed to switch context:', err)
			})
		} else {
			navigate(profilePath)
		}
	}

	const handleViewProfile = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		navigate(profilePath)
	}

	return (
		<div
			className="c-panel p-1 mb-1 flex-row ai-center"
			role="button"
			tabIndex={0}
			onClick={handleRowClick}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault()
					handleRowClick()
				}
			}}
			style={{ cursor: 'pointer' }}
		>
			<ProfileCard className="flex-fill" profile={profile} srcTag={srcTag} />
			<button
				type="button"
				className="c-button icon ghost"
				onClick={handleViewProfile}
				title={t('View profile')}
				aria-label={t('View profile')}
			>
				<IcExternalLink />
			</button>
			<ProfileStatusIcon profile={profile} />
		</div>
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
	const [, setQrScannerOpen] = useQrScanner()
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
				setProfiles(profiles)
			})()
		},
		[auth, location.search, contextIdTag]
	)

	return (
		<>
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
			</Fcd.Container>

			{auth && (
				<button
					className="c-fab"
					onClick={() => setQrScannerOpen(true)}
					title={t('Scan QR code')}
				>
					<IcScan />
				</button>
			)}
		</>
	)
}

export function CommunityListPage() {
	const { t } = useTranslation()
	const location = useLocation()
	const navigate = useNavigate()
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
				setProfiles(profiles)
			})()
		},
		[auth, location.search, contextIdTag]
	)

	return (
		<>
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
							<CommunityListCard key={profile.idTag} profile={profile} />
						))}
				</Fcd.Content>
			</Fcd.Container>

			{/* FAB for creating new community */}
			<button
				className="c-fab"
				onClick={() => navigate(`/communities/create/${contextIdTag || auth?.idTag}`)}
				title={t('Create new community')}
			>
				<IcPlus />
			</button>
		</>
	)
}

// vim: ts=4

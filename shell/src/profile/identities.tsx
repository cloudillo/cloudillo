// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import {
	LuSearch as IcSearch,
	LuFilter as IcFilter,
	LuUser as IcUser,
	LuUserPlus as IcUserFollowing,
	LuUserPlus as IcUserFollowed,
	LuHandshake as IcUserConnected,
	LuCircleOff as IcUserBlocked,
	LuBellOff as IcUserMuted,
	LuOctagonPause as IcUserSuspended,
	LuUsers as IcUserAll,
	LuExternalLink as IcExternalLink,
	LuPlus as IcPlus,
	LuScanLine as IcScan
} from 'react-icons/lu'

import type { Profile } from '@cloudillo/types'
import { useApi, useAuth, Fcd, ProfileCard, ProfilePicture, Badge } from '@cloudillo/react'
import { parseQS } from '../utils.js'
import { useContextSwitch } from '../context/index.js'
import { ProfileContextMenu, useProfileContextMenu } from '../context/profile-context-menu.js'
import { useQrScanner } from '../components/QrScanner/index.js'

type ProfileStatusCode = 'A' | 'B' | 'M' | 'S'
const VALID_STATUS_CODES = new Set<ProfileStatusCode>(['A', 'B', 'M', 'S'])

// Defensive parser for the `?status=` query param. Drops malformed/unknown
// values (e.g. stale `?status=all` URLs from the previous Tabs UI) so the
// backend never receives a 400. An empty result means "send no status param"
// — the backend then applies its safe-set default.
function parseStatusList(raw: unknown): ProfileStatusCode[] {
	if (typeof raw !== 'string') return []
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter((s): s is ProfileStatusCode => VALID_STATUS_CODES.has(s as ProfileStatusCode))
}

function ProfileConnectionIcon({ profile }: { profile: Profile }) {
	// Check for exactly true (connected) vs 'R' (pending request)
	if (profile.connected === true) return <IcUserConnected className="text-success" />
	if (profile.connected === 'R') return <IcUserConnected className="text-warning" />
	if (profile.following) return <IcUserFollowing className="text-success" />
	return <IcUser />
}

export function ProfileStatusBadge({ profile }: { profile: Profile }) {
	const { t } = useTranslation()
	if (profile.status === 'B')
		return (
			<Badge className="xs align-self-center" variant="error">
				{t('Blocked')}
			</Badge>
		)
	if (profile.status === 'S')
		return (
			<Badge className="xs align-self-center" variant="warning">
				{t('Suspended')}
			</Badge>
		)
	if (profile.status === 'M')
		return (
			<Badge className="xs align-self-center" variant="secondary">
				{t('Muted')}
			</Badge>
		)
	return null
}

const getStatusFilters = (t: TFunction) =>
	[
		{ value: 'A', label: t('Active'), icon: IcUser },
		{ value: 'M', label: t('Muted'), icon: IcUserMuted },
		{ value: 'S', label: t('Suspended'), icon: IcUserSuspended },
		{ value: 'B', label: t('Blocked'), icon: IcUserBlocked },
		{ value: 'all', label: t('All statuses'), icon: IcUserAll }
	] as const

function FilterBar({ className }: { className?: string }) {
	const { t } = useTranslation()
	const statusFilters = getStatusFilters(t)
	const location = useLocation()
	const qs = parseQS(location.search)
	const userStat = { all: 0, connected: 0, followed: 0, following: 0, trusted: 0 }

	const relFilter: 'connected' | 'followed' | 'all' =
		qs.connected === '1' ? 'connected' : qs.filter === 'followed' ? 'followed' : 'all'
	const statusList = parseStatusList(qs.status)
	const statusFilter: string =
		statusList.length === 0
			? 'A'
			: statusList.length === 4 &&
					(['A', 'B', 'M', 'S'] as const).every((s) => statusList.includes(s))
				? 'all'
				: statusList.length === 1
					? statusList[0]
					: ''

	function relHref(v: 'connected' | 'followed' | 'all'): string {
		const sp = new URLSearchParams(location.search)
		sp.delete('connected')
		sp.delete('filter')
		if (v === 'connected') sp.set('connected', '1')
		else if (v === 'followed') sp.set('filter', 'followed')
		const s = sp.toString()
		return s ? `?${s}` : location.pathname
	}
	function statusHref(v: string): string {
		const sp = new URLSearchParams(location.search)
		if (v === 'A') sp.delete('status')
		else if (v === 'all') sp.set('status', 'A,B,M,S')
		else sp.set('status', v)
		const s = sp.toString()
		return s ? `?${s}` : location.pathname
	}

	return (
		<div className={'c-vbox g-2 ' + (className || '')}>
			<div className="c-input-group">
				<input type="text" className="c-input" placeholder={t('Search')} />
				<button className="c-button secondary" type="button">
					<IcSearch />
				</button>
			</div>

			<h6 className="m-0">{t('Relationship')}</h6>
			<ul className="c-nav vertical low">
				<li className="c-nav-item">
					<Link
						className={'c-nav-link ' + (relFilter === 'connected' ? 'active' : '')}
						to={relHref('connected')}
					>
						<IcUserConnected /> {t('Connected')}
						{!!userStat.connected && (
							<span className="c-badge bg bg-error">{userStat.connected}</span>
						)}
					</Link>
				</li>
				<li className="c-nav-item">
					<Link
						className={'c-nav-link ' + (relFilter === 'followed' ? 'active' : '')}
						to={relHref('followed')}
					>
						<IcUserFollowed /> {t('Followed')}
						{!!userStat.followed && (
							<span className="c-badge bg bg-error">{userStat.followed}</span>
						)}
					</Link>
				</li>
				<li className="c-nav-item">
					<Link
						className={'c-nav-link ' + (relFilter === 'all' ? 'active' : '')}
						to={relHref('all')}
					>
						<IcUserAll /> {t('All')}
						{!!userStat.all && (
							<span className="c-badge bg bg-error">{userStat.all}</span>
						)}
					</Link>
				</li>
			</ul>

			<h6 className="m-0">{t('Status')}</h6>
			<ul className="c-nav vertical low">
				{statusFilters.map(({ value, label, icon: Icon }) => (
					<li key={value} className="c-nav-item">
						<Link
							className={'c-nav-link ' + (statusFilter === value ? 'active' : '')}
							to={statusHref(value)}
						>
							<Icon /> {label}
						</Link>
					</li>
				))}
			</ul>
		</div>
	)
}

function _ProfileDetails({ className }: { className?: string }) {
	return <div className={'c-panel p-1 ' + (className || '')}></div>
}

interface ProfileListCardProps {
	profile: Profile
	srcTag?: string
	wrapClick?: (handler: (e: React.MouseEvent) => void) => (e: React.MouseEvent) => void
	triggerProps?: {
		onContextMenu: (e: React.MouseEvent) => void
		onTouchStart: (e: React.TouchEvent) => void
		onTouchEnd: () => void
		onTouchMove: () => void
	}
}

export function ProfileListCard({
	profile,
	srcTag,
	wrapClick,
	triggerProps
}: ProfileListCardProps) {
	const params = useParams()
	const contextIdTag = params.contextIdTag!

	return (
		<Link
			className="c-panel p-1 mb-1 flex-row ai-center"
			to={`/profile/${contextIdTag}/${profile.idTag}`}
			onClick={wrapClick?.(() => {})}
			{...triggerProps}
		>
			<ProfileCard className="flex-fill" profile={profile} srcTag={srcTag} />
			<ProfileStatusBadge profile={profile} />
			<ProfileConnectionIcon profile={profile} />
		</Link>
	)
}

interface CommunityListCardProps {
	profile: Profile
	srcTag?: string
	wrapClick?: (handler: (e: React.MouseEvent) => void) => (e: React.MouseEvent) => void
	triggerProps?: {
		onContextMenu: (e: React.MouseEvent) => void
		onTouchStart: (e: React.TouchEvent) => void
		onTouchEnd: () => void
		onTouchMove: () => void
	}
}

export function CommunityListCard({
	profile,
	srcTag,
	wrapClick,
	triggerProps
}: CommunityListCardProps) {
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
			onClick={wrapClick ? wrapClick(handleRowClick) : handleRowClick}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault()
					handleRowClick()
				}
			}}
			style={{ cursor: 'pointer' }}
			{...triggerProps}
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
			<ProfileStatusBadge profile={profile} />
			<ProfileConnectionIcon profile={profile} />
		</div>
	)
}

interface PeopleHeaderProps {
	variant: 'person' | 'community'
	title: string
	subtitle: string
	profilePic?: string
	srcTag?: string
}

export function PeopleHeader({ variant, title, subtitle, profilePic, srcTag }: PeopleHeaderProps) {
	return (
		<div className="c-hbox g-2 align-items-center p-2 mb-2">
			{variant === 'community' ? (
				<ProfilePicture profile={{ profilePic }} srcTag={srcTag} small />
			) : (
				<div className="c-profile-card">
					<div className="picture small c-hbox align-items-center justify-content-center">
						<IcUserAll />
					</div>
				</div>
			)}
			<div className="c-vbox">
				<h2 className="m-0">{title}</h2>
				<div className="text-secondary small">{subtitle}</div>
			</div>
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
	const [refreshTick, setRefreshTick] = React.useState(0)
	const [, setQrScannerOpen] = useQrScanner()
	const { menuState, closeMenu, getTriggerProps, wrapClick } = useProfileContextMenu()
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
			;(async function () {
				const qs = parseQS(location.search)
				const statusList = parseStatusList(qs.status)
				const connected = qs.connected === '1' ? true : undefined
				const following = qs.filter === 'followed' ? true : undefined
				const profiles = await api!.profiles.list({
					type: 'person',
					...(statusList.length ? { status: statusList } : {}),
					...(connected !== undefined ? { connected } : {}),
					...(following !== undefined ? { following } : {})
				})
				setProfiles(profiles)
			})()
		},
		[auth, location.search, contextIdTag, refreshTick]
	)

	return (
		<>
			<Fcd.Container className="g-1">
				<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
					<FilterBar />
				</Fcd.Filter>
				<Fcd.Content>
					<PeopleHeader
						variant="person"
						title={t('People')}
						subtitle={`${t('Your connections')} · ${profiles.length}`}
					/>
					<div className="c-nav c-hbox md-hide lg-hide">
						<IcFilter onClick={() => setShowFilter(true)} />
					</div>
					{!!profiles &&
						profiles.map((profile) => (
							<ProfileListCard
								key={profile.idTag}
								profile={profile}
								wrapClick={wrapClick}
								triggerProps={getTriggerProps({
									idTag: profile.idTag,
									name: profile.name || profile.idTag,
									type: 'person',
									status: profile.status
								})}
							/>
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

			{menuState && (
				<ProfileContextMenu
					target={menuState.target}
					position={menuState.position}
					onClose={closeMenu}
					onRestored={() => {
						closeMenu()
						setRefreshTick((n) => n + 1)
					}}
				/>
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
	const [refreshTick, setRefreshTick] = React.useState(0)
	const { menuState, closeMenu, getTriggerProps, wrapClick } = useProfileContextMenu()
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
			;(async function () {
				const qs = parseQS(location.search)
				const statusList = parseStatusList(qs.status)
				const connected = qs.connected === '1' ? true : undefined
				const following = qs.filter === 'followed' ? true : undefined
				const profiles = await api!.profiles.list({
					type: 'community',
					...(statusList.length ? { status: statusList } : {}),
					...(connected !== undefined ? { connected } : {}),
					...(following !== undefined ? { following } : {})
				})
				setProfiles(profiles)
			})()
		},
		[auth, location.search, contextIdTag, refreshTick]
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
							<CommunityListCard
								key={profile.idTag}
								profile={profile}
								wrapClick={wrapClick}
								triggerProps={getTriggerProps({
									idTag: profile.idTag,
									name: profile.name || profile.idTag,
									type: 'community',
									status: profile.status
								})}
							/>
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

			{menuState && (
				<ProfileContextMenu
					target={menuState.target}
					position={menuState.position}
					onClose={closeMenu}
					onRestored={() => {
						closeMenu()
						setRefreshTick((n) => n + 1)
					}}
				/>
			)}
		</>
	)
}

// vim: ts=4

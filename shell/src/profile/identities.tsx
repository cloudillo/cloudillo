// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { parseQS } from '@cloudillo/core'
import {
	Avatar,
	Badge,
	Button,
	Card,
	FAB,
	Fcd,
	HBox,
	Icon,
	Nav,
	PageHeader,
	ProfileCard,
	ProfilePicture,
	useApi,
	useAuth
} from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuExternalLink as IcExternalLink,
	LuUserCheck as IcFollowsYou,
	LuUsers as IcMutual,
	LuPlus as IcPlus,
	LuScanLine as IcScan,
	LuUser as IcUser,
	LuUsers as IcUserAll,
	LuCircleOff as IcUserBlocked,
	LuHandshake as IcUserConnected,
	LuUserPlus as IcUserFollowed,
	LuUserPlus as IcUserFollowing,
	LuBellOff as IcUserMuted,
	LuOctagonPause as IcUserSuspended
} from 'react-icons/lu'
import { useLocation, useNavigate } from 'react-router-dom'

import { useQrScanner } from '../components/QrScanner/index.js'
import { useContextSwitch, useCtx } from '../context/index.js'
import { ProfileContextMenu, useProfileContextMenu } from '../context/profile-context-menu.js'
import { communityCreatePath, profilePath } from '../routes.js'
import { describeRelationship } from './relationship.js'

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
	const { t } = useTranslation()
	const rel = describeRelationship(profile)
	// Check for exactly true (connected) vs 'R' (pending request)
	if (profile.connected === true)
		return <Icon as={IcUserConnected} color="success" label={t('Connected')} />
	if (profile.connected === 'R')
		return <Icon as={IcUserConnected} color="warning" label={t('Connection requested')} />
	if (rel.mutual) return <Icon as={IcMutual} color="success" label={t('Mutual')} />
	if (rel.following) return <Icon as={IcUserFollowing} color="success" label={t('Following')} />
	if (rel.followsYou) return <Icon as={IcFollowsYou} color="secondary" label={t('Follows you')} />
	return <Icon as={IcUser} />
}

export function ProfileStatusBadge({ profile }: { profile: Profile }) {
	const { t } = useTranslation()
	if (profile.status === 'B')
		return (
			<Badge size="xs" className="align-self-center" color="error">
				{t('Blocked')}
			</Badge>
		)
	if (profile.status === 'S')
		return (
			<Badge size="xs" className="align-self-center" color="warning">
				{t('Suspended')}
			</Badge>
		)
	if (profile.status === 'M')
		return (
			<Badge size="xs" className="align-self-center" color="secondary">
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

function FilterBar() {
	const { t } = useTranslation()
	const statusFilters = getStatusFilters(t)
	const location = useLocation()
	const qs = parseQS(location.search)

	const relFilter: 'connected' | 'followed' | 'followers' | 'all' =
		qs.connected === '1'
			? 'connected'
			: qs.filter === 'followed'
				? 'followed'
				: qs.filter === 'followers'
					? 'followers'
					: 'all'
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

	function withSearch(sp: URLSearchParams): string {
		const s = sp.toString()
		return s ? `${location.pathname}?${s}` : location.pathname
	}
	function relHref(v: 'connected' | 'followed' | 'followers' | 'all'): string {
		const sp = new URLSearchParams(location.search)
		sp.delete('connected')
		sp.delete('filter')
		if (v === 'connected') sp.set('connected', '1')
		else if (v === 'followed') sp.set('filter', 'followed')
		else if (v === 'followers') sp.set('filter', 'followers')
		return withSearch(sp)
	}
	function statusHref(v: string): string {
		const sp = new URLSearchParams(location.search)
		if (v === 'A') sp.delete('status')
		else if (v === 'all') sp.set('status', 'A,B,M,S')
		else sp.set('status', v)
		return withSearch(sp)
	}

	// Filters differ only by query string, so `active` is passed explicitly
	// (router-derived active state matches the pathname only)
	return (
		<Nav orientation="vertical" aria-label={t('Filter')}>
			<Nav.Section label={t('Relationship')}>
				<Nav.Item
					icon={<IcUserConnected />}
					label={t('Connected')}
					href={relHref('connected')}
					active={relFilter === 'connected'}
				/>
				<Nav.Item
					icon={<IcUserFollowed />}
					label={t('Following')}
					href={relHref('followed')}
					active={relFilter === 'followed'}
				/>
				<Nav.Item
					icon={<IcFollowsYou />}
					label={t('Followers')}
					href={relHref('followers')}
					active={relFilter === 'followers'}
				/>
				<Nav.Item
					icon={<IcUserAll />}
					label={t('All')}
					href={relHref('all')}
					active={relFilter === 'all'}
				/>
			</Nav.Section>
			<Nav.Section label={t('Status')}>
				{statusFilters.map(({ value, label, icon: StatusIcon }) => (
					<Nav.Item
						key={value}
						icon={<StatusIcon />}
						label={label}
						href={statusHref(value)}
						active={statusFilter === value}
					/>
				))}
			</Nav.Section>
		</Nav>
	)
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
	const { t } = useTranslation()
	const ctx = useCtx()
	const rel = describeRelationship(profile)

	return (
		<Card
			padding={1}
			className="mb-1"
			href={profilePath(ctx.base, profile.idTag)}
			onClick={wrapClick?.(() => {})}
			{...triggerProps}
		>
			<HBox gap={2} align="center">
				<ProfileCard className="flex-fill" profile={profile} srcTag={srcTag} />
				{rel.followsYou && !rel.mutual && (
					<Badge variant="outline" color="secondary" className="align-self-center">
						{t('Follows you')}
					</Badge>
				)}
				<ProfileStatusBadge profile={profile} />
				<ProfileConnectionIcon profile={profile} />
			</HBox>
		</Card>
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
	const navigate = useNavigate()
	const ctx = useCtx()
	const { switchTo } = useContextSwitch()

	const isMember = profile.connected === true
	const profileHref = profilePath(ctx.base, profile.idTag)

	const handleRowClick = () => {
		if (isMember) {
			switchTo(profile.idTag).catch((err) => {
				console.error('Failed to switch context:', err)
			})
		} else {
			navigate(profileHref)
		}
	}

	const handleViewProfile = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		navigate(profileHref)
	}

	return (
		<Card
			interactive
			padding={1}
			className="mb-1"
			role="button"
			tabIndex={0}
			onClick={wrapClick ? wrapClick(handleRowClick) : handleRowClick}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault()
					handleRowClick()
				}
			}}
			{...triggerProps}
		>
			<HBox gap={2} align="center">
				<ProfileCard className="flex-fill" profile={profile} srcTag={srcTag} />
				<Button
					variant="ghost"
					icon={<IcExternalLink />}
					aria-label={t('View profile')}
					onClick={handleViewProfile}
				/>
				<ProfileStatusBadge profile={profile} />
				<ProfileConnectionIcon profile={profile} />
			</HBox>
		</Card>
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
		<PageHeader
			className="auto-bg"
			level={2}
			title={title}
			subtitle={subtitle}
			leading={
				variant === 'community' ? (
					<ProfilePicture profile={{ profilePic }} srcTag={srcTag} small />
				) : (
					<Avatar size="sm" fallback={<IcUserAll />} />
				)
			}
		/>
	)
}

export function PersonListPage({ idTag }: { idTag?: string }) {
	const { t } = useTranslation()
	const location = useLocation()
	const { api } = useApi()
	const [auth] = useAuth()
	const [profiles, setProfiles] = React.useState<Profile[]>([])
	const [refreshTick, setRefreshTick] = React.useState(0)
	const [, setQrScannerOpen] = useQrScanner()
	const { menuState, closeMenu, getTriggerProps, wrapClick } = useProfileContextMenu()
	// The tenant the route names when there is one (this page is also rendered without a
	// route, from `PeoplePage`).
	const contextIdTag = useCtx().idTag || idTag

	React.useEffect(
		function loadPersonList() {
			if (!auth) return
			;(async function () {
				const qs = parseQS(location.search)
				const statusList = parseStatusList(qs.status)
				const connected = qs.connected === '1' ? true : undefined
				const following = qs.filter === 'followed' ? true : undefined
				const follower = qs.filter === 'followers' ? true : undefined
				const profiles = await api!.profiles.list({
					type: 'person',
					...(statusList.length ? { status: statusList } : {}),
					...(connected !== undefined ? { connected } : {}),
					...(following !== undefined ? { following } : {}),
					...(follower !== undefined ? { follower } : {})
				})
				setProfiles(profiles)
			})()
		},
		[auth, location.search, contextIdTag, refreshTick]
	)

	return (
		<>
			<Fcd.Container className="g-1" filterLabel={t('Filter')}>
				<Fcd.Filter>
					<FilterBar />
				</Fcd.Filter>
				<Fcd.Content>
					<PeopleHeader
						variant="person"
						title={t('People')}
						subtitle={`${t('Your connections')} · ${profiles.length}`}
					/>
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
				<FAB
					icon={<IcScan />}
					aria-label={t('Scan QR code')}
					onClick={() => setQrScannerOpen(true)}
				/>
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
	const { api } = useApi()
	const [auth] = useAuth()
	const [profiles, setProfiles] = React.useState<Profile[]>([])
	const [refreshTick, setRefreshTick] = React.useState(0)
	const { menuState, closeMenu, getTriggerProps, wrapClick } = useProfileContextMenu()
	// The tenant the route names; the effect below re-runs when it changes.
	const ctx = useCtx()

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
		[auth, location.search, ctx.idTag, refreshTick]
	)

	return (
		<>
			<Fcd.Container className="g-1" filterLabel={t('Filter')}>
				<Fcd.Filter>
					<FilterBar />
				</Fcd.Filter>
				<Fcd.Content>
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

			<FAB
				icon={<IcPlus />}
				aria-label={t('Create new community')}
				onClick={() => navigate(communityCreatePath(ctx.base))}
			/>

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

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { parseQS } from '@cloudillo/core'
import {
	Avatar,
	Badge,
	Button,
	FAB,
	Fcd,
	Icon,
	IdentityTag,
	List,
	ListItem,
	Nav,
	PageHeader,
	ProfilePicture,
	useApi,
	useAuth,
	VBox
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
	LuUsersRound as IcCommunities,
	LuCircleOff as IcUserBlocked,
	LuHandshake as IcUserConnected,
	LuUserPlus as IcUserFollowed,
	LuUserPlus as IcUserFollowing,
	LuBellOff as IcUserMuted,
	LuOctagonPause as IcUserSuspended
} from 'react-icons/lu'
import { useLocation, useNavigate } from 'react-router-dom'

import { useQrScanner } from '../components/QrScanner/index.js'
import { useEnterContext } from '../context/hat-entry.js'
import { useCtx } from '../context/index.js'
import { ProfileContextMenu, useProfileContextMenu } from '../context/profile-context-menu.js'
import { communityCreatePath, profilePath } from '../routes.js'
import { DrawerToggle } from '../ui/DrawerToggle.js'
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
	wrapClick?: (handler: (e: React.SyntheticEvent) => void) => (e: React.SyntheticEvent) => void
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
	const guardClick = wrapClick?.(() => {})

	return (
		<ListItem
			leading={<ProfilePicture profile={profile} srcTag={srcTag} />}
			title={profile.name}
			subtitle={<IdentityTag className="c-list-item-handle" idTag={profile.idTag} />}
			href={profilePath(ctx.base, profile.idTag)}
			onClick={guardClick}
			trailing={
				<>
					{rel.followsYou && !rel.mutual && (
						<Badge variant="outline" color="secondary">
							{t('Follows you')}
						</Badge>
					)}
					<ProfileStatusBadge profile={profile} />
					<ProfileConnectionIcon profile={profile} />
				</>
			}
			{...triggerProps}
		/>
	)
}

interface CommunityListCardProps {
	profile: Profile
	srcTag?: string
	wrapClick?: (handler: (e: React.SyntheticEvent) => void) => (e: React.SyntheticEvent) => void
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
	const enterContext = useEnterContext()

	const isMember = profile.connected === true
	const profileHref = profilePath(ctx.base, profile.idTag)

	const handleRowClick = () => {
		if (isMember) {
			enterContext(profile.idTag, { hat: '', feed: true }).catch((err) => {
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

	const rowClick = wrapClick ? wrapClick(handleRowClick) : handleRowClick

	return (
		<ListItem
			leading={<ProfilePicture profile={profile} srcTag={srcTag} />}
			title={profile.name}
			subtitle={<IdentityTag className="c-list-item-handle" idTag={profile.idTag} />}
			onClick={rowClick}
			actions={
				<Button
					variant="ghost"
					icon={<IcExternalLink />}
					aria-label={t('View profile')}
					onClick={handleViewProfile}
				/>
			}
			trailing={
				<>
					<ProfileStatusBadge profile={profile} />
					<ProfileConnectionIcon profile={profile} />
				</>
			}
			{...triggerProps}
		/>
	)
}

interface PeopleHeaderProps {
	variant: 'person' | 'community'
	title: string
	subtitle: string
	profilePic?: string
	srcTag?: string
	actions?: React.ReactNode
}

/** Goes in `Fcd.Content header`; in a community `leading` is the community avatar. */
export function PeopleHeader({
	variant,
	title,
	subtitle,
	profilePic,
	srcTag,
	actions
}: PeopleHeaderProps) {
	return (
		<PageHeader
			title={title}
			subtitle={subtitle}
			actions={actions}
			leading={
				variant === 'community' ? (
					<ProfilePicture profile={{ profilePic }} srcTag={srcTag} size="sm" />
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
	const [showFilter, setShowFilter] = React.useState(false)
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
			<Fcd.Container className="g-1">
				<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
					<VBox gap={2} padding={2}>
						<FilterBar />
					</VBox>
				</Fcd.Filter>
				<Fcd.Content
					width="reading"
					header={
						<PeopleHeader
							variant="person"
							title={t('People')}
							subtitle={`${t('Your connections')} · ${profiles.length}`}
							actions={
								<>
									<DrawerToggle onClick={() => setShowFilter(true)} />
									{auth && (
										<Button
											className="sm-hide"
											color="primary"
											icon={<IcScan />}
											onClick={() => setQrScannerOpen(true)}
										>
											{t('Scan QR code')}
										</Button>
									)}
								</>
							}
						/>
					}
				>
					<List variant="divided" aria-label={t('People')}>
						{profiles.map((profile) => (
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
					</List>
				</Fcd.Content>
			</Fcd.Container>

			{auth && (
				<FAB
					className="md-hide lg-hide"
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
	const [showFilter, setShowFilter] = React.useState(false)
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
			<Fcd.Container className="g-1">
				<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
					<VBox gap={2} padding={2}>
						<FilterBar />
					</VBox>
				</Fcd.Filter>
				<Fcd.Content
					width="reading"
					header={
						<PageHeader
							leading={<Avatar size="sm" fallback={<IcCommunities />} />}
							title={t('Communities')}
							subtitle={`${t('Your communities')} · ${profiles.length}`}
							actions={
								<>
									<DrawerToggle onClick={() => setShowFilter(true)} />
									<Button
										className="sm-hide"
										color="primary"
										icon={<IcPlus />}
										onClick={() => navigate(communityCreatePath(ctx.base))}
									>
										{t('Create new community')}
									</Button>
								</>
							}
						/>
					}
				>
					<List variant="divided" aria-label={t('Communities')}>
						{profiles.map((profile) => (
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
					</List>
				</Fcd.Content>
			</Fcd.Container>

			<FAB
				className="md-hide lg-hide"
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

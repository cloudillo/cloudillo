// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { parseQS } from '@cloudillo/core'
import {
	Avatar,
	Badge,
	Button,
	EmptyState,
	FAB,
	Fcd,
	IcAdd,
	IcAll,
	IcCommunity,
	IcConnection,
	IcFollowers,
	IcOpenExternal,
	Icon,
	IcPerson,
	IcScan,
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
import { useLocation, useNavigate } from 'react-router-dom'

import { useQrScanner } from '../components/QrScanner/index.js'
import { useEnterContext } from '../context/hat-entry.js'
import { useCtx } from '../context/index.js'
import { ProfileContextMenu, useProfileContextMenu } from '../context/profile-context-menu.js'
import { IcBlock, IcFollowing, IcMute, IcMutual, IcPeople, IcSuspended } from '../icons.js'
import { communityCreatePath, profilePath } from '../routes.js'
import { DrawerToggle } from '../ui/DrawerToggle.js'
import { PartnerCommunityPage } from './partner-communities.js'
import { PeopleHeader } from './people-header.js'
import { parseRelFilter, type RelFilter } from './rel-filter.js'
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
		return <Icon as={IcConnection} color="success" label={t('Connected')} />
	if (profile.connected === 'R')
		return <Icon as={IcConnection} color="warning" label={t('Connection requested')} />
	if (rel.mutual) return <Icon as={IcMutual} color="success" label={t('Mutual')} />
	if (rel.following) return <Icon as={IcFollowing} color="success" label={t('Following')} />
	if (rel.followsYou) return <Icon as={IcFollowers} color="secondary" label={t('Follows you')} />
	return <Icon as={IcPerson} />
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
		{ value: 'A', label: t('Active'), icon: IcPerson },
		{ value: 'M', label: t('Muted'), icon: IcMute },
		{ value: 'S', label: t('Suspended'), icon: IcSuspended },
		{ value: 'B', label: t('Blocked'), icon: IcBlock },
		{ value: 'all', label: t('All statuses'), icon: IcAll }
	] as const

function FilterBar({ variant }: { variant: 'person' | 'community' }) {
	const { t } = useTranslation()
	const statusFilters = getStatusFilters(t)
	const location = useLocation()
	const qs = parseQS(location.search)
	const defaultRel: RelFilter = variant === 'person' ? 'connected' : 'all'

	const relFilter = parseRelFilter(qs, variant)
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
	function relHref(v: RelFilter): string {
		const sp = new URLSearchParams(location.search)
		sp.delete('connected')
		sp.delete('filter')
		if (v !== defaultRel) {
			if (v === 'connected') sp.set('connected', '1')
			else sp.set('filter', v)
		}
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
					icon={<IcConnection />}
					label={variant === 'person' ? t('Connected') : t('Member of')}
					href={relHref('connected')}
					active={relFilter === 'connected'}
				/>
				<Nav.Item
					icon={<IcFollowing />}
					label={t('Following')}
					href={relHref('followed')}
					active={relFilter === 'followed'}
				/>
				{variant === 'person' && (
					<Nav.Item
						icon={<IcFollowers />}
						label={t('Followers')}
						href={relHref('followers')}
						active={relFilter === 'followers'}
					/>
				)}
				<Nav.Item
					icon={<IcAll />}
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
					icon={<IcOpenExternal />}
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

export function PersonListPage({ idTag }: { idTag?: string }) {
	const { t } = useTranslation()
	const location = useLocation()
	const { api } = useApi()
	const [auth] = useAuth()
	// `undefined` while loading
	const [profiles, setProfiles] = React.useState<Profile[]>()
	const [error, setError] = React.useState(false)
	const [refreshTick, setRefreshTick] = React.useState(0)
	const [, setQrScannerOpen] = useQrScanner()
	const [showFilter, setShowFilter] = React.useState(false)
	const { menuState, closeMenu, getTriggerProps, wrapClick } = useProfileContextMenu()
	// The tenant the route names when there is one (this page is also rendered without a
	// route, from `PeoplePage`).
	const contextIdTag = useCtx().idTag || idTag
	const qs = parseQS(location.search)
	const rel = parseRelFilter(qs, 'person')
	const relLabel = {
		connected: t('Connected'),
		followed: t('Following'),
		followers: t('Followers'),
		all: t('All')
	}[rel]
	const unfiltered = rel === 'connected' && !qs.status

	React.useEffect(
		function loadPersonList() {
			if (!auth) return
			let cancelled = false
			setError(false)
			;(async function () {
				try {
					const statusList = parseStatusList(parseQS(location.search).status)
					const profiles = await api!.profiles.list({
						type: 'person',
						...(statusList.length ? { status: statusList } : {}),
						...(rel === 'connected' ? { connected: true } : {}),
						...(rel === 'followed' ? { following: true } : {}),
						...(rel === 'followers' ? { follower: true } : {})
					})
					if (!cancelled) setProfiles(profiles)
				} catch (err) {
					console.error('Failed to load people', err)
					if (!cancelled) {
						setProfiles([])
						setError(true)
					}
				}
			})()
			return () => {
				cancelled = true
			}
		},
		[auth, rel, location.search, contextIdTag, refreshTick]
	)

	return (
		<>
			<Fcd.Container className="g-1">
				<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
					<VBox gap={2} padding={2}>
						<FilterBar variant="person" />
					</VBox>
				</Fcd.Filter>
				<Fcd.Content
					width="reading"
					header={
						<PeopleHeader
							variant="person"
							title={t('People')}
							subtitle={`${relLabel} · ${profiles?.length ?? 0}`}
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
					{error ? (
						<EmptyState fill icon={<IcPeople />} title={t('Something went wrong')} />
					) : (
						profiles?.length === 0 && (
							<EmptyState
								fill
								icon={<IcPeople />}
								title={unfiltered ? t('No connections yet') : t('No results found')}
								action={
									<Button
										color="primary"
										icon={<IcScan />}
										onClick={() => setQrScannerOpen(true)}
									>
										{t('Scan QR code')}
									</Button>
								}
							/>
						)
					)}
					<List variant="divided" aria-label={t('People')}>
						{(profiles ?? []).map((profile) => (
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

/** `/~/communities` lists my communities; a community context shows its partners instead. */
export function CommunityListPage() {
	const [auth] = useAuth()
	const ctx = useCtx()
	const isHomeContext = ctx.isHome || ctx.idTag === auth?.idTag
	return isHomeContext ? <HomeCommunityListPage /> : <PartnerCommunityPage />
}

function HomeCommunityListPage() {
	const { t } = useTranslation()
	const location = useLocation()
	const navigate = useNavigate()
	const { api } = useApi()
	const [auth] = useAuth()
	// `undefined` while loading
	const [profiles, setProfiles] = React.useState<Profile[]>()
	const [error, setError] = React.useState(false)
	const [refreshTick, setRefreshTick] = React.useState(0)
	const [showFilter, setShowFilter] = React.useState(false)
	const { menuState, closeMenu, getTriggerProps, wrapClick } = useProfileContextMenu()
	// The tenant the route names; the effect below re-runs when it changes.
	const ctx = useCtx()
	const rel = parseRelFilter(parseQS(location.search), 'community')

	React.useEffect(
		function loadCommunities() {
			if (!auth) return
			let cancelled = false
			setError(false)
			;(async function () {
				try {
					const statusList = parseStatusList(parseQS(location.search).status)
					const profiles = await api!.profiles.list({
						type: 'community',
						...(statusList.length ? { status: statusList } : {}),
						...(rel === 'connected' ? { connected: true } : {}),
						...(rel === 'followed' ? { following: true } : {})
					})
					if (!cancelled) setProfiles(profiles)
				} catch (err) {
					console.error('Failed to load communities', err)
					if (!cancelled) {
						setProfiles([])
						setError(true)
					}
				}
			})()
			return () => {
				cancelled = true
			}
		},
		[auth, rel, location.search, ctx.idTag, refreshTick]
	)

	return (
		<>
			<Fcd.Container className="g-1">
				<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
					<VBox gap={2} padding={2}>
						<FilterBar variant="community" />
					</VBox>
				</Fcd.Filter>
				<Fcd.Content
					width="reading"
					header={
						<PageHeader
							leading={<Avatar size="sm" fallback={<IcCommunity />} />}
							title={t('Communities')}
							subtitle={`${t('Your communities')} · ${profiles?.length ?? 0}`}
							actions={
								<>
									<DrawerToggle onClick={() => setShowFilter(true)} />
									<Button
										className="sm-hide"
										color="primary"
										icon={<IcAdd />}
										onClick={() => navigate(communityCreatePath(ctx.base))}
									>
										{t('Create new community')}
									</Button>
								</>
							}
						/>
					}
				>
					{error ? (
						<EmptyState fill icon={<IcCommunity />} title={t('Something went wrong')} />
					) : (
						profiles?.length === 0 && (
							<EmptyState
								fill
								icon={<IcCommunity />}
								title={
									location.search
										? t('No results found')
										: t('No communities yet')
								}
								action={
									<Button
										color="primary"
										icon={<IcAdd />}
										onClick={() => navigate(communityCreatePath(ctx.base))}
									>
										{t('Create new community')}
									</Button>
								}
							/>
						)
					)}
					<List variant="divided" aria-label={t('Communities')}>
						{(profiles ?? []).map((profile) => (
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
				icon={<IcAdd />}
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

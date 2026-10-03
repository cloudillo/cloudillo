// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `/~/communities/map` — my memberships and their partner communities, as a radial map or a
 * list. Home context only: everything comes from the home node's `GET /api/partners/map`.
 */

import type { PartnerMap, PartnerProfile } from '@cloudillo/core'
import {
	Avatar,
	Button,
	EmptyState,
	Fcd,
	IdentityTag,
	List,
	ListItem,
	PageHeader,
	ProfilePicture,
	Segmented,
	SegmentedItem,
	useApi,
	useAuth,
	useIsMobile
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuLogIn as IcEnter,
	LuNetwork as IcMap,
	LuRefreshCw as IcSync,
	LuUser as IcProfile
} from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'

import { enterViaLabel, useEnterContext } from '../context/hat-entry.js'
import { HOME_BASE, profilePath } from '../routes.js'
import { MapGraph } from './MapGraph.js'
import { displayName, layoutPartnerMap, partnersByCommunity } from './map-layout.js'

/** How long after a sync request (or a `syncing` map) the page re-fetches. */
const REFETCH_DELAY_MS = 5000
// ponytail: ~30s cap; a longer sync leaves "Syncing…" to the next visit.
const MAX_REFETCHES = 6

/** Node actions, shared by the List rows and the Map popover. */
export function useMapActions() {
	const navigate = useNavigate()
	const enterContext = useEnterContext()

	return React.useMemo(
		() => ({
			/** Switch into a membership, as yourself. */
			open(idTag: string) {
				enterContext(idTag, { hat: '', feed: true }).catch((err) =>
					console.error('Failed to open community', err)
				)
			},
			profile(idTag: string) {
				navigate(profilePath(HOME_BASE, idTag))
			},
			/** Enter a partner community wearing the `hat` membership's hat. */
			enterVia(idTag: string, hat: string) {
				enterContext(idTag, { hat }).catch((err) =>
					console.error('Failed to enter community', err)
				)
			}
		}),
		[navigate, enterContext]
	)
}

export type MapActions = ReturnType<typeof useMapActions>

function MapList({ map, actions }: { map: PartnerMap; actions: MapActions }) {
	const { t } = useTranslation()
	const byCommunity = React.useMemo(() => partnersByCommunity(map), [map])
	const mine = React.useMemo(() => new Set(map.communities.map((c) => c.idTag)), [map])

	function profileButton(p: PartnerProfile) {
		return (
			<Button
				size="sm"
				icon={<IcProfile />}
				aria-label={`${t('View profile')}: ${displayName(p)}`}
				onClick={() => actions.profile(p.idTag)}
			/>
		)
	}

	return (
		<>
			{[...map.communities]
				.sort((a, b) => displayName(a).localeCompare(displayName(b)))
				.map((community) => (
					<List
						key={community.idTag}
						variant="divided"
						className="mb-3"
						aria-label={displayName(community)}
					>
						<ListItem
							leading={<ProfilePicture profile={community} />}
							title={displayName(community)}
							subtitle={
								<IdentityTag
									className="c-list-item-handle"
									idTag={community.idTag}
								/>
							}
							trailing={
								<>
									<Button size="sm" onClick={() => actions.open(community.idTag)}>
										{t('Open')}
									</Button>
									{profileButton(community)}
								</>
							}
						/>
						{(byCommunity.get(community.idTag) ?? []).map((p) => {
							const label = enterViaLabel(t, displayName(p), displayName(community))
							return (
								<ListItem
									key={p.idTag}
									leading={<ProfilePicture profile={p} size="sm" />}
									title={displayName(p)}
									subtitle={t('Partner of {{name}}', {
										name: displayName(community)
									})}
									trailing={
										<>
											{mine.has(p.idTag) ? (
												<Button
													size="sm"
													onClick={() => actions.open(p.idTag)}
												>
													{t('Open')}
												</Button>
											) : (
												<Button
													size="sm"
													icon={<IcEnter />}
													aria-label={label}
													onClick={() =>
														actions.enterVia(p.idTag, community.idTag)
													}
												/>
											)}
											{profileButton(p)}
										</>
									}
								/>
							)
						})}
					</List>
				))}
		</>
	)
}

export function CommunityMap() {
	const { t } = useTranslation()
	const [auth] = useAuth()
	// Home client explicitly: plain useApi() follows apiAtom, which may name a community.
	const { api } = useApi(auth?.idTag ?? null)
	const isMobile = useIsMobile(600)
	const [view, setView] = React.useState<'map' | 'list'>(isMobile ? 'list' : 'map')
	const [map, setMap] = React.useState<PartnerMap | undefined>()
	const [error, setError] = React.useState(false)
	const [syncRequested, setSyncRequested] = React.useState(false)
	const actions = useMapActions()
	const refetchTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
	const mounted = React.useRef(true)

	const load = React.useCallback(async () => {
		if (!api) return
		try {
			const m = await api.partners.map()
			if (!mounted.current) return
			setMap(m)
			setError(false)
			return m
		} catch (err) {
			console.error('Failed to load community map', err)
			if (mounted.current) setError(true)
		}
	}, [api])

	/** Re-fetch after a delay, again while the server still reports `syncing`. */
	const refetchLater = React.useCallback(
		(tries = MAX_REFETCHES) => {
			clearTimeout(refetchTimer.current)
			refetchTimer.current = setTimeout(async () => {
				if (!mounted.current) return
				const m = await load()
				if (!mounted.current) return
				if (m?.syncing && tries > 1) refetchLater(tries - 1)
				else setSyncRequested(false)
			}, REFETCH_DELAY_MS)
		},
		[load]
	)

	React.useEffect(
		function initialLoad() {
			mounted.current = true
			// The backend schedules a sync itself when the map is stale: follow it.
			load().then((m) => {
				if (m?.syncing) refetchLater()
			})
			return () => {
				mounted.current = false
				clearTimeout(refetchTimer.current)
			}
		},
		[load, refetchLater]
	)

	const sync = React.useCallback(async () => {
		if (!api) return
		setSyncRequested(true)
		try {
			await api.partners.sync()
			if (mounted.current) refetchLater()
		} catch (err) {
			console.error('Failed to sync community map', err)
			setSyncRequested(false)
		}
	}, [api, refetchLater])

	const layout = React.useMemo(() => (map ? layoutPartnerMap(map) : undefined), [map])
	const syncing = syncRequested || !!map?.syncing
	const isEmpty = !!map && (!map.communities.length || (!map.syncedAt && !map.edges.length))

	const syncButton = (
		<Button icon={<IcSync />} disabled={syncRequested} onClick={() => void sync()}>
			{t('Sync')}
		</Button>
	)

	let subtitle: string | undefined
	if (syncing) subtitle = t('Syncing…')
	else if (map?.syncedAt) {
		subtitle = t('Last synced {{time}}', {
			time: new Date(map.syncedAt * 1000).toLocaleString()
		})
	} else if (map) subtitle = t('Never synced')

	let body: React.ReactNode = null
	if (error && !map) {
		body = (
			<EmptyState
				color="error"
				icon={<IcMap />}
				title={t('Could not load the community map')}
				actions={<Button onClick={() => void load()}>{t('Retry')}</Button>}
			/>
		)
	} else if (isEmpty) {
		body = (
			<EmptyState
				icon={<IcMap />}
				title={t('Community map')}
				description={t(
					'The map shows the communities you are a member of, and the communities they are partners with. Sync to fetch the latest partner lists.'
				)}
				actions={map.communities.length ? syncButton : undefined}
			/>
		)
	} else if (map && layout) {
		body =
			view === 'list' ? (
				<MapList map={map} actions={actions} />
			) : (
				<MapGraph layout={layout} actions={actions} onShowList={() => setView('list')} />
			)
	}

	return (
		<Fcd.Container className="g-1">
			<Fcd.Content
				width="reading"
				header={
					<PageHeader
						leading={<Avatar size="sm" fallback={<IcMap />} />}
						title={t('Community map')}
						subtitle={subtitle}
						actions={
							<>
								<Segmented
									size="sm"
									aria-label={t('View')}
									value={view}
									onChange={(value) => setView(value as 'map' | 'list')}
								>
									<SegmentedItem value="map">{t('Map')}</SegmentedItem>
									<SegmentedItem value="list">{t('List')}</SegmentedItem>
								</Segmented>
								{syncButton}
							</>
						}
					/>
				}
			>
				{body}
			</Fcd.Content>
		</Fcd.Container>
	)
}

// vim: ts=4

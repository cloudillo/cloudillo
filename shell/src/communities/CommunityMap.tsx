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
	Heading,
	IdentityTag,
	List,
	ListItem,
	PageHeader,
	Panel,
	ProfilePicture,
	Segmented,
	SegmentedItem,
	Text,
	useApi,
	useAuth,
	useIsMobile
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { enterViaLabel, useEnterContext } from '../context/hat-entry.js'
import { IcCommunityMap, IcEnter, IcProfile, IcSync } from '../icons.js'
import { HOME_BASE, profilePath } from '../routes.js'
import { MapGraph } from './MapGraph.js'
import { displayName, keepPolling, layoutPartnerMap, partnersByCommunity } from './map-layout.js'

/** How long after a sync request (or a `syncing` map) the page re-fetches. */
const REFETCH_DELAY_MS = 5000

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
				.map((community) => {
					const partners = byCommunity.get(community.idTag) ?? []
					return (
						<Panel
							key={community.idTag}
							variant="outline"
							className="mb-3"
							aria-label={displayName(community)}
						>
							<List>
								<ListItem
									className="c-community-map-member"
									leading={<ProfilePicture profile={community} size="lg" />}
									title={displayName(community)}
									subtitle={
										<IdentityTag
											className="c-list-item-handle"
											idTag={community.idTag}
										/>
									}
									trailing={
										<>
											<Button
												size="sm"
												variant="filled"
												color="primary"
												onClick={() => actions.open(community.idTag)}
											>
												{t('Open')}
											</Button>
											{profileButton(community)}
										</>
									}
								/>
							</List>
							{partners.length ? (
								<>
									<Heading
										level={3}
										overline
										className="c-community-map-partners-label"
									>
										{t('Partner communities ({{count}})', {
											count: partners.length
										})}
									</Heading>
									<List variant="divided" className="c-community-map-partners">
										{partners.map((p) => {
											const label = enterViaLabel(
												t,
												displayName(p),
												displayName(community)
											)
											return (
												<ListItem
													key={p.idTag}
													size="sm"
													leading={
														<ProfilePicture profile={p} size="sm" />
													}
													title={displayName(p)}
													subtitle={
														<IdentityTag
															className="c-list-item-handle"
															idTag={p.idTag}
														/>
													}
													trailing={
														<>
															{mine.has(p.idTag) && (
																<Button
																	size="sm"
																	onClick={() =>
																		actions.open(p.idTag)
																	}
																>
																	{t('Open')}
																</Button>
															)}
															<Button
																size="sm"
																icon={<IcEnter />}
																aria-label={label}
																onClick={() =>
																	actions.enterVia(
																		p.idTag,
																		community.idTag
																	)
																}
															/>
															{profileButton(p)}
														</>
													}
												/>
											)
										})}
									</List>
								</>
							) : (
								<Text as="p" emphasis="muted">
									{t('No partner communities yet')}
								</Text>
							)}
						</Panel>
					)
				})}
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
	const pollGen = React.useRef(0)

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

	/**
	 * Re-fetch after a delay, again until the sync landed: `syncing` only says this GET
	 * scheduled one, so also wait for `syncedAt` to move past `baseline`. A fresh start bumps
	 * `pollGen`, so a chain whose `load()` was already in flight stops instead of clobbering it.
	 */
	const refetchLater = React.useCallback(
		(baseline: PartnerMap['syncedAt'], attempt = 1, gen = ++pollGen.current) => {
			clearTimeout(refetchTimer.current)
			refetchTimer.current = setTimeout(async () => {
				if (!mounted.current) return
				const m = await load()
				if (!mounted.current || gen !== pollGen.current) return
				if (keepPolling(m, baseline, attempt)) refetchLater(baseline, attempt + 1, gen)
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
				if (m?.syncing) refetchLater(m.syncedAt)
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
			// `scheduled: false` = cooldown: nothing to wait for.
			const { scheduled } = await api.partners.sync()
			if (!mounted.current) return
			if (scheduled) refetchLater(map?.syncedAt)
			else setSyncRequested(false)
		} catch (err) {
			console.error('Failed to sync community map', err)
			setSyncRequested(false)
		}
	}, [api, refetchLater, map?.syncedAt])

	const layout = React.useMemo(() => (map ? layoutPartnerMap(map) : undefined), [map])
	const syncing = syncRequested || !!map?.syncing
	const isEmpty = !!map && (!map.communities.length || (!map.syncedAt && !map.edges.length))

	const syncButton = (
		<Button icon={<IcSync />} loading={syncing} onClick={() => void sync()}>
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
				icon={<IcCommunityMap />}
				title={t('Could not load the community map')}
				actions={<Button onClick={() => void load()}>{t('Retry')}</Button>}
			/>
		)
	} else if (isEmpty) {
		body = (
			<EmptyState
				icon={<IcCommunityMap />}
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
				width="wide"
				header={
					<PageHeader
						leading={<Avatar size="sm" fallback={<IcCommunityMap />} />}
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

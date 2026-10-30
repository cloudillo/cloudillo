// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * "Partner communities" on a community profile's Connections tab — the hat-bearing entry
 * points; a row click enters. Viewing A (I'm a member): every partner B enters "as <A>
 * member". Viewing any other community B: partners I'm a member of enter B with their hat.
 *
 * The list is the viewed community's `/me/full` `partners`: its public contracted partners,
 * not governed by `connection_visibility`. Malformed entries are dropped by `decodePartners`.
 */

import { decodePartners } from '@cloudillo/core'
import {
	Center,
	EmptyState,
	Fcd,
	IcCommunity,
	Icon,
	IdentityTag,
	List,
	ListItem,
	LoadingSpinner,
	ProfilePicture,
	useApi,
	useAuth
} from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { enterViaLabel } from '../context/hat-entry.js'
import {
	activeContextAtom,
	communitiesAtom,
	isContextLeader,
	useApiContext,
	useCtx
} from '../context/index.js'
import { IcEnter } from '../icons.js'
import { useMapActions } from '../communities/CommunityMap.js'
import { PartnersManager } from '../communities/partners.js'
import { PeopleHeader } from './people-header.js'

/** `title` renders above the list, so it disappears with it when there are no partners. */
export function PartnerCommunities({
	community,
	title
}: {
	community: { idTag: string; name?: string; partners?: unknown }
	title?: React.ReactNode
}) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const communities = useAtomValue(communitiesAtom)
	const activeContext = useAtomValue(activeContextAtom)
	const { enterVia } = useMapActions()
	const mine = React.useMemo(() => new Set(communities.map((c) => c.idTag)), [communities])
	const memberOfViewed = mine.has(community.idTag)
	const viewedName = community.name || community.idTag
	const activeIdTag = activeContext?.idTag
	const wornHat = activeContext?.hat?.idTag
	const partners = React.useMemo(
		() =>
			decodePartners(community.partners)
				.filter((p) => p.type === 'community')
				.map((p) => {
					let entry: { idTag: string; hat: string } | undefined
					if (memberOfViewed) entry = { idTag: p.idTag, hat: community.idTag }
					else if (mine.has(p.idTag)) entry = { idTag: community.idTag, hat: p.idTag }
					// Not enterable: it is the context we are already in
					if (entry && entry.idTag === activeIdTag && entry.hat === wornHat) {
						entry = undefined
					}
					return { p, entry }
				}),
		[community.partners, community.idTag, memberOfViewed, mine, activeIdTag, wornHat]
	)

	if (!auth || !partners.length) return null

	return (
		<>
			{title}
			<List variant="divided" aria-label={t('Partner communities')}>
				{partners.map(({ p, entry }) => {
					const name = p.name || p.idTag
					const label = memberOfViewed
						? t('Enter as {{name}} member', { name: viewedName })
						: enterViaLabel(t, viewedName, name)
					const enter = entry && (() => enterVia(entry.idTag, entry.hat))
					return (
						<ListItem
							key={p.idTag}
							leading={<ProfilePicture profile={p} srcTag={community.idTag} />}
							title={name}
							subtitle={
								<IdentityTag className="c-list-item-handle" idTag={p.idTag} />
							}
							onClick={enter}
							trailing={enter && <Icon as={IcEnter} label={label} />}
						/>
					)
				})}
			</List>
		</>
	)
}

/**
 * `/@comm/communities`: leaders get `PartnersManager` (requests, connect, hat roles, suspended
 * peers); everyone else the public `/me/full` partner list. Either way a row click enters.
 */
// `/me/full` partners honour `partners_public`, so a community hiding them shows
// members an empty list. Upgrade: `getClientFor(idTag).profiles.list({ type: 'community',
// connected: true })` once the backend lets members read it.
export function PartnerCommunityPage() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const ctx = useCtx()
	const activeContext = useAtomValue(activeContextAtom)
	const { getTokenFor } = useApiContext()
	// `undefined` while loading
	const [profile, setProfile] = React.useState<{
		name?: string
		profilePic?: string
		partners?: unknown
	}>()
	const [error, setError] = React.useState(false)
	const idTag = ctx.idTag

	React.useEffect(
		function loadPartners() {
			if (!api || !idTag) return
			let cancelled = false
			setProfile(undefined)
			setError(false)
			getTokenFor(idTag)
				.then((r) => api.profiles.getRemoteFull(idTag, r?.token))
				.then((p) => {
					if (!cancelled) setProfile(p as typeof profile)
				})
				.catch((err) => {
					console.error('Failed to load partner communities', err)
					if (!cancelled) {
						setProfile({})
						setError(true)
					}
				})
			return () => {
				cancelled = true
			}
		},
		[api, idTag, getTokenFor]
	)

	const count = React.useMemo(
		() => decodePartners(profile?.partners).filter((p) => p.type === 'community').length,
		[profile?.partners]
	)

	if (!idTag || profile === undefined) {
		return (
			<Center className="w-100 h-100">
				<LoadingSpinner size="lg" label={t('Loading...')} />
			</Center>
		)
	}

	const name = profile.name || idTag
	// The hub reads through its own client, so a `/me/full` failure doesn't hide it
	const canManage =
		activeContext?.idTag === idTag &&
		!activeContext.hat &&
		isContextLeader(activeContext, auth?.idTag)

	return (
		<Fcd.Container className="g-1">
			<Fcd.Content
				width="reading"
				header={
					<PeopleHeader
						variant="community"
						title={name}
						// The `/me/full` count leaves out suspended and uncontracted peers
						subtitle={
							canManage
								? t('Partner communities')
								: `${t('Partner communities')} · ${count}`
						}
						profilePic={profile.profilePic}
						srcTag={idTag}
					/>
				}
			>
				{canManage ? (
					<PartnersManager />
				) : error ? (
					<EmptyState fill icon={<IcCommunity />} title={t('Something went wrong')} />
				) : count ? (
					<PartnerCommunities community={{ idTag, name, partners: profile.partners }} />
				) : (
					<EmptyState
						fill
						icon={<IcCommunity />}
						title={t('No partner communities shared')}
					/>
				)}
			</Fcd.Content>
		</Fcd.Container>
	)
}

// vim: ts=4

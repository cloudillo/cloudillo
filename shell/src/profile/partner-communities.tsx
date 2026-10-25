// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * "Partner communities" on a community profile's Connections tab — the hat-bearing entry
 * points. Viewing A (I'm a member): every partner B gets "Enter as <A> member". Viewing any
 * other community B: partners I'm a member of get "Enter with this hat".
 *
 * The list is the viewed community's `/me/full` `partners`: its public contracted partners,
 * not governed by `connection_visibility`. Malformed entries are dropped by `decodePartners`.
 */

import { decodePartners } from '@cloudillo/core'
import {
	Button,
	Center,
	EmptyState,
	Fcd,
	IcCommunity,
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

import { enterViaLabel, useEnterContext } from '../context/hat-entry.js'
import {
	activeContextAtom,
	canAdminContext,
	communitiesAtom,
	useApiContext,
	useCtx
} from '../context/index.js'
import { IcEnter } from '../icons.js'
import { settingsPath } from '../routes.js'
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
	const enterContext = useEnterContext()
	const partners = React.useMemo(
		() => decodePartners(community.partners).filter((p) => p.type === 'community'),
		[community.partners]
	)

	const mine = React.useMemo(() => new Set(communities.map((c) => c.idTag)), [communities])
	const memberOfViewed = mine.has(community.idTag)
	const viewedName = community.name || community.idTag

	if (!auth || !partners.length) return null

	return (
		<>
			{title}
			<List variant="divided" aria-label={t('Partner communities')}>
				{partners.map((p) => {
					const name = p.name || p.idTag
					let action: React.ReactNode = null
					if (memberOfViewed) {
						action = (
							<Button
								size="sm"
								onClick={() => enterContext(p.idTag, { hat: community.idTag })}
							>
								{t('Enter as {{name}} member', { name: viewedName })}
							</Button>
						)
					} else if (mine.has(p.idTag)) {
						const label = enterViaLabel(t, viewedName, name)
						action = (
							<Button
								size="sm"
								icon={<IcEnter />}
								aria-label={label}
								onClick={() => enterContext(community.idTag, { hat: p.idTag })}
							/>
						)
					}
					return (
						<ListItem
							key={p.idTag}
							leading={<ProfilePicture profile={p} srcTag={community.idTag} />}
							title={name}
							subtitle={
								<IdentityTag className="c-list-item-handle" idTag={p.idTag} />
							}
							trailing={action}
						/>
					)
				})}
			</List>
		</>
	)
}

/**
 * `/@comm/communities`: the current community's partner communities, each with
 * "Enter as <community> member".
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
	const canManage =
		activeContext?.idTag === idTag && canAdminContext(activeContext, auth?.idTag, 'partners')
	const manage = canManage ? (
		<Button color="primary" href={settingsPath(ctx.base, 'partners')}>
			{t('Manage partners')}
		</Button>
	) : undefined

	return (
		<Fcd.Container className="g-1">
			<Fcd.Content
				width="reading"
				header={
					<PeopleHeader
						variant="community"
						title={name}
						subtitle={`${t('Partner communities')} · ${count}`}
						profilePic={profile.profilePic}
						srcTag={idTag}
						actions={error ? undefined : manage}
					/>
				}
			>
				{error ? (
					<EmptyState fill icon={<IcCommunity />} title={t('Something went wrong')} />
				) : count ? (
					<PartnerCommunities community={{ idTag, name, partners: profile.partners }} />
				) : (
					<EmptyState
						fill
						icon={<IcCommunity />}
						title={
							canManage
								? t('No partner communities yet')
								: t('No partner communities shared')
						}
						action={manage}
					/>
				)}
			</Fcd.Content>
		</Fcd.Container>
	)
}

// vim: ts=4

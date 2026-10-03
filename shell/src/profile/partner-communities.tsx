// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * "Partner communities" on a community profile's Connections tab — the hat-bearing entry
 * points. Viewing A (I'm a member): every partner B gets "Enter as <A> member". Viewing any
 * other community B: partners I'm a member of get "Enter with this hat".
 *
 * Listed with `GET /api/partners` on the viewed community's node: public by default, but a
 * community with `profile.partners_public = false` answers non-members with an empty list,
 * so the section then simply does not render.
 */

import type { PublicProfile } from '@cloudillo/core'
import {
	Button,
	Heading,
	IdentityTag,
	List,
	ListItem,
	ProfilePicture,
	useAuth
} from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuLogIn as IcEnter } from 'react-icons/lu'

import { enterViaLabel, useEnterContext } from '../context/hat-entry.js'
import { communitiesAtom, useApiContext } from '../context/index.js'

export function PartnerCommunities({ community }: { community: Profile }) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const { getClientFor } = useApiContext()
	const communities = useAtomValue(communitiesAtom)
	const enterContext = useEnterContext()
	const [loaded, setLoaded] = React.useState<{ idTag: string; list: PublicProfile[] }>()
	// Keyed by community, so another community's list never shows here
	const partners = loaded?.idTag === community.idTag ? loaded.list : []

	const mine = React.useMemo(() => new Set(communities.map((c) => c.idTag)), [communities])
	const memberOfViewed = mine.has(community.idTag)
	const viewedName = community.name || community.idTag

	React.useEffect(
		function loadPartners() {
			if (!auth) return
			const client = getClientFor(community.idTag, { auth: 'preferred' })
			if (!client) return
			let cancelled = false
			client.partners
				.list()
				.then((list) => {
					if (cancelled) return
					setLoaded({
						idTag: community.idTag,
						list: list.filter((p) => p.type === 'community')
					})
				})
				.catch((err) => {
					console.error('Failed to load partner communities', err)
				})
			return () => {
				cancelled = true
			}
		},
		[auth, community.idTag, getClientFor]
	)

	if (!auth || !partners.length) return null

	return (
		<>
			<Heading level={3} className="mt-3 mb-1">
				{t('Partner communities')}
			</Heading>
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

// vim: ts=4

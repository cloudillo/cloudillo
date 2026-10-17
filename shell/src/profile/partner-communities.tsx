// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
	Heading,
	IdentityTag,
	List,
	ListItem,
	ProfilePicture,
	useAuth
} from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { enterViaLabel, useEnterContext } from '../context/hat-entry.js'
import { communitiesAtom } from '../context/index.js'
import { IcEnter } from '../icons.js'

export function PartnerCommunities({
	community
}: {
	community: { idTag: string; name?: string; partners?: unknown }
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

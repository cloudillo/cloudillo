// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'
import { LuUsers as IcCommunity, LuUser as IcPerson } from 'react-icons/lu'
import { Link } from 'react-router-dom'

import { useAuth } from '../../hooks.js'
import { useLibTranslation } from '../../i18n.js'
import { mergeClasses } from '../utils.js'
import { IdentityTag } from './IdentityTag.js'
import { UnknownProfilePicture } from './UnknownProfilePicture.js'

export interface ProfileAudienceCardProps {
	className?: string
	audience: Profile
	profile: Profile
	srcTag?: string
	profileBasePath?: string
}

interface RowLinkProps {
	to?: string
	ariaLabel?: string
	className?: string
	children: React.ReactNode
}

function RowLink({ to, ariaLabel, className, children }: RowLinkProps) {
	if (to) {
		return (
			<Link to={to} aria-label={ariaLabel} className={className}>
				{children}
			</Link>
		)
	}
	return <div className={className}>{children}</div>
}

export function ProfileAudienceCard({
	className,
	audience,
	profile,
	srcTag,
	profileBasePath
}: ProfileAudienceCardProps) {
	const [auth] = useAuth()
	const { t } = useLibTranslation()
	// Gate on the resolved source tag, not on `auth` — an anonymous guest has no
	// auth but an explicit `srcTag` still resolves a perfectly fetchable URL.
	const idTag = srcTag ?? auth?.idTag
	const audienceTo = profileBasePath ? `${profileBasePath}/${audience.idTag}` : undefined
	const issuerTo = profileBasePath ? `${profileBasePath}/${profile.idTag}` : undefined
	const audienceLabel =
		audience.type === 'community'
			? t('View community {{name}}', { name: audience.name ?? audience.idTag })
			: t('View profile {{name}}', { name: audience.name ?? audience.idTag })
	const issuerLabel = t('View profile {{name}}', {
		name: profile.name ?? profile.idTag
	})

	return (
		<div className={mergeClasses('c-profile-card c-profile-card--dual', className)}>
			<div className="c-profile-card__avatars pos-relative">
				<RowLink
					to={audienceTo}
					ariaLabel={audienceLabel}
					className="c-profile-card__avatar-link"
				>
					{idTag && audience.profilePic ? (
						<img
							className="picture"
							src={getFileUrl(idTag, audience.profilePic, 'vis.pf')}
							alt=""
						/>
					) : (
						<UnknownProfilePicture />
					)}
				</RowLink>
				<RowLink
					to={issuerTo}
					ariaLabel={issuerLabel}
					className="c-profile-card__avatar-link c-profile-card__avatar-link--tiny"
				>
					{idTag && profile.profilePic ? (
						<img
							className="picture tiny"
							src={getFileUrl(idTag, profile.profilePic, 'vis.pf')}
							alt=""
						/>
					) : (
						<UnknownProfilePicture tiny />
					)}
				</RowLink>
			</div>
			<div className="c-profile-card__rows">
				<RowLink
					to={audienceTo}
					ariaLabel={audienceLabel}
					className="c-profile-card__row c-profile-card__row--audience"
				>
					{audience.type === 'community' ? (
						<IcCommunity className="type-icon" aria-hidden />
					) : audience.type === 'person' ? (
						<IcPerson className="type-icon" aria-hidden />
					) : null}
					<h4 className="name">{audience.name}</h4>
					<span className="tag">
						(<IdentityTag idTag={audience.idTag} />)
					</span>
				</RowLink>
				<RowLink
					to={issuerTo}
					ariaLabel={issuerLabel}
					className="c-profile-card__row c-profile-card__row--issuer"
				>
					{profile.type === 'community' ? (
						<IcCommunity className="type-icon" aria-hidden />
					) : profile.type === 'person' ? (
						<IcPerson className="type-icon" aria-hidden />
					) : null}
					<span className="name secondary">{profile.name}</span>
					<span className="tag secondary">
						(<IdentityTag idTag={profile.idTag} />)
					</span>
				</RowLink>
			</div>
		</div>
	)
}

// vim: ts=4

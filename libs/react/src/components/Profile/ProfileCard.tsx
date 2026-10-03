// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import type { Profile, ProfileInfo } from '@cloudillo/types'
import * as React from 'react'

import { useAuth } from '../../hooks.js'
import { Text } from '../Text/Text.js'
import { mergeClasses } from '../utils.js'
import { HatVia } from './HatVia.js'
import { IdentityTag } from './IdentityTag.js'
import { UnknownProfilePicture } from './UnknownProfilePicture.js'

export interface ProfileCardProps {
	className?: string
	profile: Profile
	srcTag?: string
	/** Defaults to `''`: the adjacent name and identity tag already carry the
	 *  information, so the picture is decorative. */
	alt?: string
	/** The community the actor speaks for: rings the picture and adds "via ▣ Name". */
	hat?: ProfileInfo
}

export function ProfileCard({ className, profile, srcTag, alt = '', hat }: ProfileCardProps) {
	const [auth] = useAuth()
	// Gate on the resolved source tag, not on `auth` — an anonymous guest has no
	// auth but an explicit `srcTag` still resolves a perfectly fetchable URL.
	const idTag = srcTag ?? auth?.idTag

	const picture =
		idTag && profile.profilePic ? (
			<img
				className="picture"
				src={getFileUrl(idTag, profile.profilePic, 'vis.pf')}
				alt={alt}
			/>
		) : (
			<UnknownProfilePicture />
		)

	return (
		<div className={mergeClasses('c-profile-card', className)}>
			{hat ? <span className="c-hat-ring">{picture}</span> : picture}
			<div className="body">
				<Text className="name" weight="semibold" truncate>
					{profile.name}
				</Text>
				{hat && <HatVia hat={hat} srcTag={srcTag} />}
				<div className="tag">
					<IdentityTag idTag={profile.idTag} />
				</div>
			</div>
		</div>
	)
}

// vim: ts=4

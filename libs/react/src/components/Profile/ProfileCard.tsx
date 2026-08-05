// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'

import { useAuth } from '../../hooks.js'
import { mergeClasses } from '../utils.js'
import { IdentityTag } from './IdentityTag.js'
import { UnknownProfilePicture } from './UnknownProfilePicture.js'

export interface ProfileCardProps {
	className?: string
	profile: Profile
	srcTag?: string
	/** Defaults to `''`: the adjacent name and identity tag already carry the
	 *  information, so the picture is decorative. */
	alt?: string
}

export function ProfileCard({ className, profile, srcTag, alt = '' }: ProfileCardProps) {
	const [auth] = useAuth()
	// Gate on the resolved source tag, not on `auth` — an anonymous guest has no
	// auth but an explicit `srcTag` still resolves a perfectly fetchable URL.
	const idTag = srcTag ?? auth?.idTag

	return (
		<div className={mergeClasses('c-profile-card', className)}>
			{idTag && profile.profilePic ? (
				<img
					className="picture"
					src={getFileUrl(idTag, profile.profilePic, 'vis.pf')}
					alt={alt}
				/>
			) : (
				<UnknownProfilePicture />
			)}
			<div className="body">
				<h4 className="name">{profile.name}</h4>
				<div className="tag">
					<IdentityTag idTag={profile.idTag} />
				</div>
			</div>
		</div>
	)
}

// vim: ts=4

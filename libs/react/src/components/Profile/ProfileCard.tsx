// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import type { Profile } from '@cloudillo/types'
import { useAuth } from '../../hooks.js'
import { mergeClasses } from '../utils.js'
import { UnknownProfilePicture } from './UnknownProfilePicture.js'
import { IdentityTag } from './IdentityTag.js'
import { getFileUrl } from '@cloudillo/core'

export interface ProfileCardProps {
	className?: string
	profile: Profile
	srcTag?: string
}

export function ProfileCard({ className, profile, srcTag }: ProfileCardProps) {
	const [auth] = useAuth()

	return (
		<div className={mergeClasses('c-profile-card', className)}>
			{auth && profile.profilePic ? (
				<img
					className="picture"
					src={getFileUrl(srcTag ?? auth?.idTag ?? '', profile.profilePic, 'vis.pf')}
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

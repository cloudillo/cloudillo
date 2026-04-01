// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import type { Profile } from '@cloudillo/types'
import { useAuth } from '../../hooks.js'
import { mergeClasses } from '../utils.js'
import { UnknownProfilePicture } from './UnknownProfilePicture.js'
import { IdentityTag } from './IdentityTag.js'
import { getFileUrl } from '@cloudillo/core'

export interface ProfileAudienceCardProps {
	className?: string
	audience: Profile
	profile: Profile
	srcTag?: string
}

export function ProfileAudienceCard({
	className,
	audience,
	profile,
	srcTag
}: ProfileAudienceCardProps) {
	const [auth] = useAuth()

	return (
		<div className={mergeClasses('c-profile-card', className)}>
			<div className="pos-relative">
				{auth && audience.profilePic ? (
					<img
						className="picture"
						src={getFileUrl(srcTag ?? auth?.idTag ?? '', audience.profilePic, 'vis.pf')}
					/>
				) : (
					<UnknownProfilePicture />
				)}
				{auth && profile.profilePic ? (
					<img
						className="picture tiny"
						src={getFileUrl(srcTag ?? auth?.idTag ?? '', profile.profilePic, 'vis.pf')}
					/>
				) : (
					<UnknownProfilePicture tiny />
				)}
			</div>
			<div className="body">
				<div className="c-hbox">
					<h4 className="name">{audience.name}</h4>
					<div className="tag">
						(<IdentityTag idTag={audience.idTag} />)
					</div>
				</div>
				<div className="c-hbox">
					<h4 className="name">{profile.name}</h4>
					<div className="tag">
						(<IdentityTag idTag={profile.idTag} />)
					</div>
				</div>
			</div>
		</div>
	)
}

// vim: ts=4

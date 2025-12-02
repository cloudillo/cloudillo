// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { useAuth } from '../../hooks.js'
import { mergeClasses } from '../utils.js'
import { UnknownProfilePicture } from './UnknownProfilePicture.js'
import { IdentityTag } from './IdentityTag.js'
import type { Profile } from './ProfileCard.js'

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
						src={`https://cl-o.${srcTag ?? auth?.idTag}/api/file/${audience.profilePic}?variant=pf`}
					/>
				) : (
					<UnknownProfilePicture />
				)}
				{auth && profile.profilePic ? (
					<img
						className="picture tiny"
						src={`https://cl-o.${srcTag ?? auth?.idTag}/api/file/${profile.profilePic}?variant=pf`}
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

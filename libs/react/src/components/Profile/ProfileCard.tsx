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

export interface Profile {
	name?: string
	idTag: string
	profilePic?: string
}

export interface ProfileCardProps {
	className?: string
	profile: Profile
	srcTag?: string
}

export function ProfileCard({ className, profile, srcTag }: ProfileCardProps) {
	const [auth] = useAuth()

	return <div className={mergeClasses('c-profile-card', className)}>
		{ auth && profile.profilePic
			? <img className="picture" src={`https://cl-o.${srcTag ?? auth?.idTag}/api/file/${profile.profilePic}?variant=pf`}/>
			: <UnknownProfilePicture/>
		}
		<div className="body">
			<h4 className="name">{profile.name}</h4>
			<div className="tag"><IdentityTag idTag={profile.idTag}/></div>
		</div>
	</div>
}

// vim: ts=4

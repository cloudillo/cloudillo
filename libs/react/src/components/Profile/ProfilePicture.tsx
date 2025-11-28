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
import { UnknownProfilePicture } from './UnknownProfilePicture.js'

export interface ProfilePictureProps {
	className?: string
	profile: { profilePic?: string }
	small?: boolean
	tiny?: boolean
	srcTag?: string
}

export function ProfilePicture({ className, profile, small, tiny, srcTag }: ProfilePictureProps) {
	const [auth] = useAuth()

	return <div className="c-profile-card">
		{ auth && profile.profilePic
			? <img className={'picture' + (tiny ? ' tiny' : small ? ' small' : '')} src={`https://cl-o.${srcTag ?? auth.idTag}/api/file/${profile.profilePic}?variant=pf`}/>
			: <UnknownProfilePicture small={small} tiny={tiny}/>
		}
	</div>
}

// vim: ts=4

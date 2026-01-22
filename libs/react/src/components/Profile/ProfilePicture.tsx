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
import { getFileUrl } from '@cloudillo/core'
import { mergeClasses } from '../utils.js'

export interface ProfilePictureProps {
	className?: string
	profile: { profilePic?: string }
	small?: boolean
	tiny?: boolean
	srcTag?: string
}

export function ProfilePicture({ className, profile, small, tiny, srcTag }: ProfilePictureProps) {
	const [auth] = useAuth()

	const idTag = srcTag ?? auth?.idTag

	return (
		<div className={mergeClasses('c-profile-card', className)}>
			{idTag && profile.profilePic ? (
				<img
					className={'picture' + (tiny ? ' tiny' : small ? ' small' : '')}
					src={getFileUrl(idTag, profile.profilePic, 'vis.pf')}
				/>
			) : (
				<UnknownProfilePicture small={small} tiny={tiny} />
			)}
		</div>
	)
}

// vim: ts=4

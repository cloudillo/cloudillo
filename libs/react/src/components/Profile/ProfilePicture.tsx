// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

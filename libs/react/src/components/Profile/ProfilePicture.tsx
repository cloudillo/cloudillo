// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import * as React from 'react'

import { useAuth } from '../../hooks.js'
import { mergeClasses } from '../utils.js'
import { UnknownProfilePicture } from './UnknownProfilePicture.js'

export interface ProfilePictureProps {
	className?: string
	profile: { profilePic?: string }
	small?: boolean
	tiny?: boolean
	srcTag?: string
	/** Accessible name; omit for a decorative picture that sits next to its own label. */
	alt?: string
}

export function ProfilePicture({
	className,
	profile,
	small,
	tiny,
	srcTag,
	alt
}: ProfilePictureProps) {
	const [auth] = useAuth()

	const idTag = srcTag ?? auth?.idTag

	return (
		<div className={mergeClasses('c-profile-card', className)}>
			{idTag && profile.profilePic ? (
				<img
					className={'picture' + (tiny ? ' tiny' : small ? ' small' : '')}
					src={getFileUrl(idTag, profile.profilePic, 'vis.pf')}
					alt={alt ?? ''}
				/>
			) : (
				<UnknownProfilePicture small={small} tiny={tiny} />
			)}
		</div>
	)
}

// vim: ts=4

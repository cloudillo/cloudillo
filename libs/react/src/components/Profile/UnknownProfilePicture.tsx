// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Avatar } from '../Avatar/Avatar.js'
import { mergeClasses } from '../utils.js'

export interface UnknownProfilePictureProps {
	small?: boolean
	tiny?: boolean
}

/**
 * @deprecated The silhouette is gone: use `<ProfilePicture profile size />`, whose
 * fallback is the monogram. Kept for app consumers; renders a neutral `?` Avatar.
 */
export function UnknownProfilePicture({ small, tiny }: UnknownProfilePictureProps) {
	const legacyClass = tiny ? 'tiny' : small ? 'small' : undefined
	return (
		<Avatar
			className={mergeClasses('picture', legacyClass)}
			size={tiny ? 'xs' : small ? 'sm' : 'md'}
			fallback="?"
		/>
	)
}

// vim: ts=4

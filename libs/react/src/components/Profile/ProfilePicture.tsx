// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl, idHue } from '@cloudillo/core'
import * as React from 'react'

import { useAuth } from '../../hooks.js'
import { Avatar, initialsFor } from '../Avatar/Avatar.js'
import { monogramFor } from '../Avatar/InitialsAvatar.js'
import type { AvatarShape, AvatarSize } from '../types.js'
import { mergeClasses } from '../utils.js'

export interface ProfilePictureProps {
	className?: string
	profile: { profilePic?: string; idTag?: string; name?: string }
	size?: AvatarSize
	shape?: AvatarShape
	/** @deprecated Use `size="sm"`. */
	small?: boolean
	/** @deprecated Use `size="xs"`. */
	tiny?: boolean
	/** Tenant serving the picture; defaults to the signed-in user. Also the colour seed when `profile.idTag` is absent. */
	srcTag?: string
	/** Accessible name; omit for a decorative picture that sits next to its own label. */
	alt?: string
}

/**
 * A person's avatar: their picture, or their monogram on their identity colour
 * (`idHue`, the same hue presence uses).
 *
 * The `c-profile-card` wrapper and the `picture` class are kept for the shell
 * styles that still target them.
 */
export function ProfilePicture({
	className,
	profile,
	size,
	shape,
	small,
	tiny,
	srcTag,
	alt
}: ProfilePictureProps) {
	const [auth] = useAuth()

	const idTag = srcTag ?? auth?.idTag
	// The monogram is only trusted from the profile or an explicit srcTag — the
	// signed-in user's own tag would put their initials on someone else.
	const personTag = profile.idTag ?? srcTag
	const seedTag = personTag ?? idTag
	const legacyClass = tiny ? 'tiny' : small ? 'small' : undefined

	return (
		<div className={mergeClasses('c-profile-card', className)}>
			<Avatar
				className={mergeClasses('picture', legacyClass, 'c-id-color')}
				size={size ?? (tiny ? 'xs' : small ? 'sm' : 'md')}
				shape={shape}
				src={
					idTag && profile.profilePic
						? getFileUrl(idTag, profile.profilePic, 'vis.pf')
						: undefined
				}
				alt={alt ?? ''}
				fallback={
					personTag ? monogramFor(personTag, profile.name) : initialsFor(profile.name)
				}
				style={{ '--id-hue': idHue(seedTag ?? profile.name ?? '') } as React.CSSProperties}
			/>
		</div>
	)
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import { Avatar, AvatarGroup, InitialsAvatar, monogramFor, useAuth } from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'

// Group avatar component showing stacked profile pictures
function GroupAvatarComponent({ profiles, max = 3 }: { profiles: Profile[]; max?: number }) {
	const [auth] = useAuth()
	const displayProfiles = profiles.slice(0, max)

	return (
		<AvatarGroup max={max}>
			{displayProfiles.map((profile) => {
				const src =
					auth?.idTag && profile.profilePic
						? getFileUrl(auth.idTag, profile.profilePic, 'vis.pf')
						: undefined
				// Without a picture, fall back to the idTag monogram on the
				// participant's own identity colour, so a group of two is legible
				// at a glance.
				return src ? (
					<Avatar
						key={profile.idTag}
						size="sm"
						src={src}
						alt={profile.name || profile.idTag}
						// A broken picture URL falls back to `fallback`; with none,
						// `Avatar` renders an empty circle.
						fallback={monogramFor(profile.idTag, profile.name)}
					/>
				) : (
					<InitialsAvatar
						key={profile.idTag}
						size="sm"
						name={profile.name || profile.idTag}
						idTag={profile.idTag}
						seed={profile.idTag}
					/>
				)
			})}
		</AvatarGroup>
	)
}

export const GroupAvatar = React.memo(GroupAvatarComponent)

// vim: ts=4

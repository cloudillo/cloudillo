// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import { Avatar, AvatarGroup, useAuth } from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'

// Group avatar component showing stacked profile pictures
function GroupAvatarComponent({ profiles, max = 3 }: { profiles: Profile[]; max?: number }) {
	const [auth] = useAuth()
	const displayProfiles = profiles.slice(0, max)

	return (
		<AvatarGroup max={max}>
			{displayProfiles.map((profile) => (
				<Avatar
					key={profile.idTag}
					size="sm"
					src={
						auth?.idTag && profile.profilePic
							? getFileUrl(auth.idTag, profile.profilePic, 'vis.pf')
							: undefined
					}
					alt={profile.name || profile.idTag}
					fallback={(profile.name || profile.idTag).charAt(0).toUpperCase()}
				/>
			))}
		</AvatarGroup>
	)
}

export const GroupAvatar = React.memo(GroupAvatarComponent)

// vim: ts=4

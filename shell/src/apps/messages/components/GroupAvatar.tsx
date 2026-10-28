// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { getFileUrl } from '@cloudillo/core'
import { Avatar, HBox, InitialsAvatar, monogramFor, useAuth } from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

// Group avatar: two small pictures on the diagonal of a md-sized square, so a
// group row has the same leading footprint as a direct chat's ProfilePicture.
// `total` is the real member count when `profiles` may be partial; anything
// beyond the two faces shows as a "+N" pill.
function GroupAvatarComponent({ profiles, total }: { profiles: Profile[]; total?: number }) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const count = Math.max(total ?? 0, profiles.length)
	const extra = count - 2

	return (
		<HBox
			className="group-avatar"
			aria-label={extra > 0 ? t('{{count}} members', { count }) : undefined}
		>
			{profiles.slice(0, 2).map((profile) => {
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
						size="xs"
						src={src}
						alt={profile.name || profile.idTag}
						// A broken picture URL falls back to `fallback`; with none,
						// `Avatar` renders an empty circle.
						fallback={monogramFor(profile.idTag, profile.name)}
					/>
				) : (
					<InitialsAvatar
						key={profile.idTag}
						size="xs"
						name={profile.name || profile.idTag}
						idTag={profile.idTag}
						seed={profile.idTag}
					/>
				)
			})}
			{extra > 0 && <Avatar size="xs" className="group-avatar-more" fallback={`+${extra}`} />}
		</HBox>
	)
}

export const GroupAvatar = React.memo(GroupAvatarComponent)

// vim: ts=4

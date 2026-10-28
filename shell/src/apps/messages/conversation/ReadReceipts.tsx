// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { AvatarGroup, HBox, IcCheck, ProfilePicture, Text } from '@cloudillo/react'
import type { ProfileInfo } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

export interface ReadReceiptsProps {
	/** Group: readers whose read point is this message (up to 3 avatars + "+N") */
	readers?: ProfileInfo[]
	/** DM: the peer has read up to this own message */
	seen?: boolean
	/** Own message: align to the end, like the bubble */
	local?: boolean
}

/** Read receipts under a message: "Seen" in DMs, reader avatars in groups */
export function ReadReceipts({ readers, seen, local }: ReadReceiptsProps) {
	const { t } = useTranslation()
	if (!seen && !readers?.length) return null
	const names = readers?.map((r) => r.name || r.idTag).join(', ')
	return (
		<HBox
			gap={1}
			align="center"
			justify={local ? 'end' : 'start'}
			className="px-2"
			title={seen ? undefined : t('Seen by {{names}}', { names })}
		>
			{seen ? (
				<>
					<IcCheck aria-hidden />
					<Text size="sm" emphasis="muted">
						{t('Seen')}
					</Text>
				</>
			) : (
				<AvatarGroup max={3} size="xs" title={names}>
					{readers?.map((r) => (
						<ProfilePicture
							key={r.idTag}
							profile={r}
							size="xs"
							alt={r.name || r.idTag}
						/>
					))}
				</AvatarGroup>
			)}
		</HBox>
	)
}

// vim: ts=4

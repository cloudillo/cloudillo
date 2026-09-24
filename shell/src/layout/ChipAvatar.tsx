// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { ProfilePicture } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuClock3 as IcPending } from 'react-icons/lu'

/** A context's avatar with its pending spinner and unread dot — the strip, popup and sheet. */
export function ChipAvatar({
	idTag,
	profilePic,
	pending,
	unread,
	iconSize = 10,
	children
}: {
	idTag: string
	profilePic?: string
	pending?: boolean
	unread?: boolean
	iconSize?: number
	children?: React.ReactNode
}) {
	const { t } = useTranslation()
	return (
		<span className="c-ctx-chip-avatar">
			{/* The clip lives on this inner span, so the badge and the pending spinner
			    below can hang outside the rounded square rather than be cut by it. */}
			<span className="c-ctx-chip-avatar-img">
				<ProfilePicture profile={{ profilePic }} srcTag={idTag} />
			</span>
			{pending && (
				<span className="c-sidebar-pending-indicator" title={t('Setting up...')}>
					<IcPending size={iconSize} />
				</span>
			)}
			{!pending && unread && (
				<span
					className="c-badge dot accent positioned tr"
					role="status"
					aria-label={t('New content')}
				/>
			)}
			{children}
		</span>
	)
}

// vim: ts=4

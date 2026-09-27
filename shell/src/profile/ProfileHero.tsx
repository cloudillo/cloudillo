// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Hero, Panel, VBox } from '@cloudillo/react'
import * as React from 'react'

export interface ProfileHeroProps {
	cover?: React.ReactNode
	avatar: React.ReactNode
	coverAction?: React.ReactNode
	avatarAction?: React.ReactNode
	/** Usually a PageHeader */
	header: React.ReactNode
	/** Rendered below the panel body, flush with its bottom edge */
	tabs?: React.ReactNode
	/** Extra rows under the header (chips, badges) */
	children?: React.ReactNode
}

/** Profile header panel: cover + overlapping avatar, header, chips and tabs. */
export function ProfileHero({
	cover,
	avatar,
	coverAction,
	avatarAction,
	header,
	tabs,
	children
}: ProfileHeroProps) {
	return (
		<Panel padding={0}>
			<Hero
				cover={cover}
				avatar={avatar}
				coverAction={coverAction}
				avatarAction={avatarAction}
			/>
			<VBox gap={1} padding={3}>
				{header}
				{children}
			</VBox>
			{tabs}
		</Panel>
	)
}

// vim: ts=4

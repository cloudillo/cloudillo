// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Hero, Panel, VBox } from '@cloudillo/react'
import * as React from 'react'

export interface ProfileHeroProps {
	cover?: React.ReactNode
	/** Identity hue for the gradient shown without a cover */
	hue?: number
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

/** Profile header panel: cover + overlapping avatar with the header beside it, chips and tabs. */
export function ProfileHero({
	cover,
	hue,
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
				hue={hue}
				avatar={avatar}
				coverAction={coverAction}
				avatarAction={avatarAction}
			>
				<VBox gap={1}>
					{header}
					{children}
				</VBox>
			</Hero>
			{tabs}
		</Panel>
	)
}

// vim: ts=4

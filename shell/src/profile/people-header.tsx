// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { Avatar, PageHeader, ProfilePicture } from '@cloudillo/react'
import * as React from 'react'

import { IcPeople } from '../icons.js'

interface PeopleHeaderProps {
	variant: 'person' | 'community'
	title: string
	subtitle: string
	profilePic?: string
	srcTag?: string
	actions?: React.ReactNode
}

/** Goes in `Fcd.Content header`; in a community `leading` is the community avatar. */
export function PeopleHeader({
	variant,
	title,
	subtitle,
	profilePic,
	srcTag,
	actions
}: PeopleHeaderProps) {
	return (
		<PageHeader
			title={title}
			subtitle={subtitle}
			actions={actions}
			leading={
				variant === 'community' ? (
					<ProfilePicture profile={{ profilePic }} srcTag={srcTag} size="sm" />
				) : (
					<Avatar size="sm" fallback={<IcPeople />} />
				)
			}
		/>
	)
}

// vim: ts=4

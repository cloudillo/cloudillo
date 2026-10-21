// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { PublicProfile } from '@cloudillo/core'
import * as React from 'react'

import { useLibTranslation } from '../../i18n.js'
import { Badge } from '../Badge/index.js'
import { IdentityTag } from '../Profile/IdentityTag.js'
import { ProfilePicture } from '../Profile/ProfilePicture.js'
import { mergeClasses } from '../utils.js'

export interface PersonCardProps {
	profile: PublicProfile
	/** Context lines under the identity, e.g. a community role or a file permission. */
	extra?: React.ReactNode
	/** Action buttons, rendered in a row at the bottom. */
	actions?: React.ReactNode
	/** Node serving the picture (`ProfilePicture` `srcTag`). */
	srcTag?: string
	className?: string
}

/** Who someone is: picture, name, identity tag, optional context and actions. Presentational. */
export function PersonCard({ profile, extra, actions, srcTag, className }: PersonCardProps) {
	const { t } = useLibTranslation()

	return (
		<div className={mergeClasses('c-person-card', className)}>
			<div className="c-person-card__head">
				<ProfilePicture profile={profile} size="lg" srcTag={srcTag} />
				<div className="c-person-card__id">
					<span className="c-person-card__name">{profile.name ?? profile.idTag}</span>
					<IdentityTag className="c-person-card__tag" idTag={profile.idTag} />
					{profile.type === 'community' && (
						<span>
							<Badge variant="soft" size="xs">
								{t('Community')}
							</Badge>
						</span>
					)}
				</div>
			</div>
			{extra && <div className="c-person-card__extra">{extra}</div>}
			{actions && <div className="c-person-card__actions">{actions}</div>}
		</div>
	)
}

// vim: ts=4

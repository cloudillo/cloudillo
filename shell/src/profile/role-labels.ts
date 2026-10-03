// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { CommunityRole } from '@cloudillo/types'
import type { TFunction } from 'i18next'

/** A community role's display name. */
export const roleLabels = (t: TFunction): Partial<Record<CommunityRole, string>> => ({
	follower: t('Follower'),
	supporter: t('Supporter'),
	contributor: t('Contributor'),
	moderator: t('Moderator'),
	leader: t('Leader')
})

/** A role as a floor ("who can enter"): that role and everyone above it. */
export const roleFloorLabels = (t: TFunction): Partial<Record<CommunityRole, string>> => ({
	follower: t('Followers and above'),
	supporter: t('Supporters and above'),
	contributor: t('Contributors and above'),
	moderator: t('Moderators and above'),
	leader: t('Leaders only')
})

/** The same wording as the room form's "Who can enter" options. */
export function floorText(t: TFunction, role: string): string {
	return roleFloorLabels(t)[role as CommunityRole] ?? t('Members only')
}

// vim: ts=4

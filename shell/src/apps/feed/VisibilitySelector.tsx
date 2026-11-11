// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	IcConnection,
	IcFollowers,
	IcPublic,
	type VisibilityCode,
	VisibilitySelect
} from '@cloudillo/react'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { busVisibility, fileVisibilityFromChar } from '../files/utils.js'

export type Visibility = 'public' | 'connected' | 'followers'

// `VisibilitySelect` speaks the profile-section chars; posts speak words.
const FEED_VISIBILITY: VisibilityCode[] = ['F', 'C', 'P']

function isPostVisibility(v: string): v is Visibility {
	return v === 'public' || v === 'connected' || v === 'followers'
}

interface VisibilityOption {
	value: Visibility
	label: string
	icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
	color: string
}

export const getVisibilityOptions = (t: TFunction): VisibilityOption[] => [
	{ value: 'followers', label: t('Followers'), icon: IcFollowers, color: 'var(--col-primary)' },
	{ value: 'connected', label: t('Connected'), icon: IcConnection, color: 'var(--col-warning)' },
	{ value: 'public', label: t('Public'), icon: IcPublic, color: 'var(--col-success)' }
]

export function getVisibilityMeta(
	t: TFunction,
	visibility: string | undefined
): VisibilityOption | undefined {
	if (!visibility) return undefined
	return getVisibilityOptions(t).find((o) => o.value === visibility)
}

/** Who will see a post, relative to its owner (public/followers/connected is evaluated against the post's owner). */
export function postAudienceSummary(
	t: TFunction,
	target: { kind: 'me' | 'community'; name?: string; idTag: string },
	visibility: Visibility
): string {
	if (visibility === 'public') return t('Visible to anyone')
	if (target.kind === 'me') {
		return visibility === 'followers'
			? t('Visible to your followers')
			: t('Visible to your connections')
	}
	const name = target.name || target.idTag
	return visibility === 'followers'
		? t('Visible to followers of {{name}}', { name })
		: t('Visible to members of {{name}}', { name })
}

interface VisibilitySelectorProps {
	value: Visibility
	onChange: (value: Visibility) => void
}

/** Post visibility picker; keeps the feed's F → C → P order. */
export const VisibilitySelector = React.memo(function VisibilitySelector({
	value,
	onChange
}: VisibilitySelectorProps) {
	const { t } = useTranslation()
	return (
		<VisibilitySelect
			value={busVisibility(value) as VisibilityCode}
			onChange={(v) => {
				const w = fileVisibilityFromChar(v)
				if (isPostVisibility(w)) onChange(w)
			}}
			options={FEED_VISIBILITY}
			aria-label={t('Visibility')}
		/>
	)
})

// vim: ts=4

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

export type Visibility = 'P' | 'C' | 'F'

const FEED_VISIBILITY: VisibilityCode[] = ['F', 'C', 'P']

interface VisibilityOption {
	value: Visibility
	label: string
	icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
	color: string
}

export const getVisibilityOptions = (t: TFunction): VisibilityOption[] => [
	{ value: 'F', label: t('Followers'), icon: IcFollowers, color: 'var(--col-primary)' },
	{ value: 'C', label: t('Connected'), icon: IcConnection, color: 'var(--col-warning)' },
	{ value: 'P', label: t('Public'), icon: IcPublic, color: 'var(--col-success)' }
]

export function getVisibilityMeta(
	t: TFunction,
	visibility: string | undefined
): VisibilityOption | undefined {
	if (!visibility) return undefined
	return getVisibilityOptions(t).find((o) => o.value === visibility)
}

/** Who will see a post, relative to its owner (P/F/C is evaluated against the post's owner). */
export function postAudienceSummary(
	t: TFunction,
	target: { kind: 'me' | 'community'; name?: string; idTag: string },
	visibility: Visibility
): string {
	if (visibility === 'P') return t('Visible to anyone')
	if (target.kind === 'me') {
		return visibility === 'F'
			? t('Visible to your followers')
			: t('Visible to your connections')
	}
	const name = target.name || target.idTag
	return visibility === 'F'
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
			value={value}
			onChange={(v) => onChange(v as Visibility)}
			options={FEED_VISIBILITY}
			aria-label={t('Visibility')}
		/>
	)
})

// vim: ts=4

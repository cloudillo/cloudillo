// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { VisibilitySelect, type VisibilityCode } from '@cloudillo/react'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuGlobe as IcGlobe, LuUserCheck as IcUserCheck, LuUsers as IcUsers } from 'react-icons/lu'

export type Visibility = 'P' | 'C' | 'F'

const FEED_VISIBILITY: VisibilityCode[] = ['F', 'C', 'P']

interface VisibilityOption {
	value: Visibility
	label: string
	icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
	color: string
}

export const getVisibilityOptions = (t: TFunction): VisibilityOption[] => [
	{ value: 'F', label: t('Followers'), icon: IcUserCheck, color: 'var(--col-primary)' },
	{ value: 'C', label: t('Connected'), icon: IcUsers, color: 'var(--col-warning)' },
	{ value: 'P', label: t('Public'), icon: IcGlobe, color: 'var(--col-success)' }
]

export function getVisibilityMeta(
	t: TFunction,
	visibility: string | undefined
): VisibilityOption | undefined {
	if (!visibility) return undefined
	return getVisibilityOptions(t).find((o) => o.value === visibility)
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

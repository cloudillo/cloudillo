// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, mergeClasses, Popper } from '@cloudillo/react'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuGlobe as IcGlobe, LuUserCheck as IcUserCheck, LuUsers as IcUsers } from 'react-icons/lu'

export type Visibility = 'P' | 'C' | 'F'

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

export const VisibilitySelector = React.memo(function VisibilitySelector({
	value,
	onChange
}: VisibilitySelectorProps) {
	const { t } = useTranslation()
	const visibilityOptions = React.useMemo(() => getVisibilityOptions(t), [t])
	const selected = visibilityOptions.find((o) => o.value === value) || visibilityOptions[0]
	const Icon = selected.icon

	return (
		<Popper
			menuClassName="c-button link secondary sm c-hbox g-1 align-items-center"
			icon={<Icon style={{ color: selected.color }} />}
			label={selected.label}
			aria-label={t('Visibility')}
		>
			<ul className="c-nav vertical emph">
				{visibilityOptions.map((opt) => {
					const OptIcon = opt.icon
					const isActive = value === opt.value
					return (
						<li key={opt.value}>
							<Button
								kind="nav-item"
								className={mergeClasses(isActive && 'active')}
								onClick={() => onChange(opt.value)}
							>
								<OptIcon style={{ color: opt.color }} />
								{opt.label}
							</Button>
						</li>
					)
				})}
			</ul>
		</Popper>
	)
})

// vim: ts=4

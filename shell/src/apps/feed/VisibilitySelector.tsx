// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuGlobe as IcGlobe, LuUsers as IcUsers, LuUserCheck as IcUserCheck } from 'react-icons/lu'

import { Button, Popper, mergeClasses } from '@cloudillo/react'

export type Visibility = 'P' | 'C' | 'F'

interface VisibilityOption {
	value: Visibility
	label: string
	icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
	color: string
}

const getVisibilityOptions = (t: TFunction): VisibilityOption[] => [
	{ value: 'F', label: t('Followers'), icon: IcUserCheck, color: 'var(--col-primary)' },
	{ value: 'C', label: t('Connected'), icon: IcUsers, color: 'var(--col-warning)' },
	{ value: 'P', label: t('Public'), icon: IcGlobe, color: 'var(--col-success)' }
]

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
			menuClassName="c-btn link secondary sm"
			icon={<Icon style={{ color: selected.color }} />}
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

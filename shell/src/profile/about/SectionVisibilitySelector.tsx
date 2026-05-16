// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	LuGlobe as IcGlobe,
	LuUsers as IcUsers,
	LuUserCheck as IcUserCheck,
	LuShield as IcRole
} from 'react-icons/lu'

import { Button, Popper, mergeClasses } from '@cloudillo/react'

interface VisibilityOption {
	value: string
	label: string
	icon: React.ComponentType<{ className?: string }>
	colorClass: string
}

const getPersonalOptions = (t: TFunction): VisibilityOption[] => [
	{ value: 'P', label: t('Public'), icon: IcGlobe, colorClass: 'text-success' },
	{ value: 'F', label: t('Followers'), icon: IcUserCheck, colorClass: 'text-primary' },
	{ value: 'C', label: t('Connected'), icon: IcUsers, colorClass: 'text-warning' }
]

const getCommunityOptions = (t: TFunction): VisibilityOption[] => [
	{ value: 'P', label: t('Public'), icon: IcGlobe, colorClass: 'text-success' },
	{ value: 'follower', label: t('Follower+'), icon: IcUserCheck, colorClass: 'text-primary' },
	{ value: 'supporter', label: t('Supporter+'), icon: IcRole, colorClass: 'text-secondary' },
	{
		value: 'contributor',
		label: t('Contributor+'),
		icon: IcRole,
		colorClass: 'text-secondary'
	},
	{ value: 'moderator', label: t('Moderator+'), icon: IcRole, colorClass: 'text-warning' },
	{ value: 'leader', label: t('Leader only'), icon: IcRole, colorClass: 'text-error' }
]

interface SectionVisibilitySelectorProps {
	value: string
	onChange: (value: string) => void
	isCommunity: boolean
}

export function SectionVisibilitySelector({
	value,
	onChange,
	isCommunity
}: SectionVisibilitySelectorProps) {
	const { t } = useTranslation()
	const options = React.useMemo(
		() => (isCommunity ? getCommunityOptions(t) : getPersonalOptions(t)),
		[isCommunity, t]
	)
	const selected = options.find((o) => o.value === value) || options[0]
	const Icon = selected.icon

	return (
		<Popper
			menuClassName="c-btn link secondary sm"
			icon={<Icon className={selected.colorClass} />}
		>
			<ul className="c-nav vertical emph">
				{options.map((opt) => {
					const OptIcon = opt.icon
					const isActive = value === opt.value
					return (
						<li key={opt.value}>
							<Button
								kind="nav-item"
								className={mergeClasses(isActive && 'active')}
								onClick={() => onChange(opt.value)}
							>
								<OptIcon className={opt.colorClass} />
								{opt.label}
							</Button>
						</li>
					)
				})}
			</ul>
		</Popper>
	)
}

// vim: ts=4

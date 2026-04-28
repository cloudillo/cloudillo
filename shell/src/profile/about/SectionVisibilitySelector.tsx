// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
	labelKey: string
	icon: React.ComponentType<{ className?: string }>
	colorClass: string
}

const PERSONAL_OPTIONS: VisibilityOption[] = [
	{ value: 'P', labelKey: 'Public', icon: IcGlobe, colorClass: 'text-success' },
	{ value: 'F', labelKey: 'Followers', icon: IcUserCheck, colorClass: 'text-primary' },
	{ value: 'C', labelKey: 'Connected', icon: IcUsers, colorClass: 'text-warning' }
]

const COMMUNITY_OPTIONS: VisibilityOption[] = [
	{ value: 'P', labelKey: 'Public', icon: IcGlobe, colorClass: 'text-success' },
	{ value: 'follower', labelKey: 'Follower+', icon: IcUserCheck, colorClass: 'text-primary' },
	{ value: 'supporter', labelKey: 'Supporter+', icon: IcRole, colorClass: 'text-secondary' },
	{
		value: 'contributor',
		labelKey: 'Contributor+',
		icon: IcRole,
		colorClass: 'text-secondary'
	},
	{ value: 'moderator', labelKey: 'Moderator+', icon: IcRole, colorClass: 'text-warning' },
	{ value: 'leader', labelKey: 'Leader only', icon: IcRole, colorClass: 'text-error' }
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
	const options = isCommunity ? COMMUNITY_OPTIONS : PERSONAL_OPTIONS
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
								{t(opt.labelKey)}
							</Button>
						</li>
					)
				})}
			</ul>
		</Popper>
	)
}

// vim: ts=4

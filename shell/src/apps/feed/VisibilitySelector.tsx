// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuGlobe as IcGlobe, LuUsers as IcUsers, LuUserCheck as IcUserCheck } from 'react-icons/lu'

import { Button, Popper, mergeClasses } from '@cloudillo/react'

export type Visibility = 'P' | 'C' | 'F'

const visibilityOptions: {
	value: Visibility
	labelKey: string
	icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
	color: string
}[] = [
	{ value: 'F', labelKey: 'Followers', icon: IcUserCheck, color: 'var(--col-primary)' },
	{ value: 'C', labelKey: 'Connected', icon: IcUsers, color: 'var(--col-warning)' },
	{ value: 'P', labelKey: 'Public', icon: IcGlobe, color: 'var(--col-success)' }
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
								navItem
								className={mergeClasses(isActive && 'active')}
								onClick={() => onChange(opt.value)}
							>
								<OptIcon style={{ color: opt.color }} />
								{t(opt.labelKey)}
							</Button>
						</li>
					)
				})}
			</ul>
		</Popper>
	)
})

// vim: ts=4

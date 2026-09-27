// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { CommunityVisibility, PersonalVisibility } from '@cloudillo/types'
import * as React from 'react'
import {
	LuChevronDown as IcCaret,
	LuGlobe as IcGlobe,
	LuShield as IcRole,
	LuUserCheck as IcUserCheck,
	LuUsers as IcUsers
} from 'react-icons/lu'

import { Button } from '../Button/Button.js'
import { FieldContext, useFieldControl } from '../Form/Field.js'
import { useLibTranslation } from '../../i18n.js'
import { Menu, MenuItem } from '../Menu/Menu.js'
import type { Size } from '../types.js'

/** Platform visibility codes: personal (`P`/`F`/`C`) and community role levels */
export type VisibilityCode = PersonalVisibility | CommunityVisibility

export const PERSONAL_VISIBILITY: VisibilityCode[] = ['P', 'F', 'C']
export const COMMUNITY_VISIBILITY: VisibilityCode[] = [
	'P',
	'follower',
	'supporter',
	'contributor',
	'moderator',
	'leader'
]

const META: Record<VisibilityCode, { label: string; icon: React.ElementType; color: string }> = {
	P: { label: 'Public', icon: IcGlobe, color: 'text-success' },
	F: { label: 'Followers', icon: IcUserCheck, color: 'text-primary' },
	C: { label: 'Connected', icon: IcUsers, color: 'text-warning' },
	follower: { label: 'Follower+', icon: IcUserCheck, color: 'text-primary' },
	supporter: { label: 'Supporter+', icon: IcRole, color: 'text-secondary' },
	contributor: { label: 'Contributor+', icon: IcRole, color: 'text-secondary' },
	moderator: { label: 'Moderator+', icon: IcRole, color: 'text-warning' },
	leader: { label: 'Leader only', icon: IcRole, color: 'text-error' }
}

export interface VisibilitySelectProps {
	value: VisibilityCode
	onChange: (value: VisibilityCode) => void
	/** Codes offered, in order; defaults to `PERSONAL_VISIBILITY` */
	options?: VisibilityCode[]
	/** Defaults to the enclosing Field's size, else `sm` */
	size?: Size
	disabled?: boolean
	'aria-label'?: string
	className?: string
}

/** Visibility picker — ghost Button (icon + label + caret) opening a radio Menu */
export function VisibilitySelect({
	value,
	onChange,
	options = PERSONAL_VISIBILITY,
	size,
	disabled,
	className,
	...props
}: VisibilitySelectProps) {
	const { t } = useLibTranslation()
	const field = useFieldControl(props, undefined, 'VisibilitySelect')
	const labelId = React.useContext(FieldContext)?.labelId
	const valueId = React.useId()
	const current = META[value] ?? META[options[0]]
	const Icon = current.icon

	return (
		<Menu
			trigger={
				<Button
					{...field.controlProps}
					ref={field.ref}
					variant="ghost"
					size={size ?? field.size ?? 'sm'}
					disabled={disabled}
					className={className}
					aria-label={labelId ? undefined : (props['aria-label'] ?? t('Visibility'))}
					aria-labelledby={labelId ? `${labelId} ${valueId}` : undefined}
				>
					<Icon className={current.color} aria-hidden="true" />
					<span id={valueId}>{t(current.label)}</span>
					<IcCaret aria-hidden="true" />
				</Button>
			}
		>
			{options.map((code) => {
				const opt = META[code]
				const OptIcon = opt.icon
				return (
					<MenuItem
						key={code}
						icon={<OptIcon className={opt.color} />}
						label={t(opt.label)}
						selected={code === value}
						onClick={() => onChange(code)}
					/>
				)
			})}
		</Menu>
	)
}

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuEye as IcEye, LuEyeOff as IcEyeOff } from 'react-icons/lu'

import { mergeClasses } from '@cloudillo/react'
import { passwordStrength } from '../auth/utils.js'

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
	icon?: React.ReactNode
	groupClassName?: string
}

export function PasswordInput({
	icon,
	groupClassName,
	className,
	...inputProps
}: PasswordInputProps) {
	const [visible, setVisible] = React.useState(false)

	return (
		<div className={mergeClasses('c-input-group', groupClassName)}>
			{icon && <div className="c-button icon">{icon}</div>}
			<input
				className={mergeClasses('c-input', className)}
				{...inputProps}
				type={visible ? 'text' : 'password'}
			/>
			<button type="button" className="c-link px-1" onClick={() => setVisible(!visible)}>
				{visible ? <IcEye /> : <IcEyeOff />}
			</button>
		</div>
	)
}

export function PasswordStrengthBar({
	password,
	className,
	style
}: {
	password: string
	className?: string
	style?: React.CSSProperties
}) {
	const { t } = useTranslation()

	if (!password) return null

	const strength = passwordStrength(password, t)
	const strengthVariant = (['error', 'error', 'warning', 'success', 'success'] as const)[
		strength.score
	]
	return (
		<div className={mergeClasses('mt-1 mb-2', className)} style={style}>
			<div className={`c-progress xs ${strengthVariant}`}>
				<div className="bar" style={{ width: `${strength.percent}%` }} />
			</div>
			<span className={`small text-${strengthVariant}`}>{strength.label}</span>
		</div>
	)
}

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuEye as IcEye, LuEyeOff as IcEyeOff } from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { Button } from '../Button/index.js'
import { Progress } from '../Progress/index.js'
import { Text } from '../Text/index.js'
import { createComponent, mergeClasses } from '../utils.js'
import { Input, type InputProps } from './Input.js'

export type PasswordInputProps = Omit<InputProps, 'type' | 'trailing'>

/** Password Input with a reveal toggle in the trailing slot; `leading` takes an icon. */
export const PasswordInput = createComponent<HTMLInputElement, PasswordInputProps>(
	'PasswordInput',
	(props, ref) => {
		const { t } = useLibTranslation()
		const [visible, setVisible] = React.useState(false)

		return (
			<Input
				{...props}
				ref={ref}
				type={visible ? 'text' : 'password'}
				trailing={
					<Button
						variant="ghost"
						size="sm"
						icon={visible ? <IcEye /> : <IcEyeOff />}
						aria-label={visible ? t('Hide password') : t('Show password')}
						aria-pressed={visible}
						onClick={() => setVisible(!visible)}
					/>
				}
			/>
		)
	}
)

const STRENGTH_COLORS = ['error', 'error', 'warning', 'success', 'success'] as const

/** 0 (too short) … 4 (strong): length ≥ 8 gates, then length ≥ 12 and character classes. */
export function passwordScore(password: string): number {
	if (!password || password.length < 8) return 0
	let score = 1
	if (password.length >= 12) score++
	if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
	if (/\d/.test(password)) score++
	if (/[^a-zA-Z0-9]/.test(password)) score++
	return Math.min(4, score)
}

export interface PasswordStrengthBarProps extends React.HTMLAttributes<HTMLDivElement> {
	password: string
	align?: 'left' | 'right'
}

export function PasswordStrengthBar({
	password,
	align,
	className,
	...props
}: PasswordStrengthBarProps) {
	const { t } = useLibTranslation()

	if (!password) return null

	const score = passwordScore(password)
	const color = STRENGTH_COLORS[score]
	const labels = [t('Too short'), t('Weak'), t('Fair'), t('Good'), t('Strong')]
	return (
		<div className={mergeClasses('mt-1 mb-2', className)} {...props}>
			<Progress className="xs" value={score * 25} color={color} />
			<Text as="div" size="sm" color={color} align={align}>
				{labels[score]}
			</Text>
		</div>
	)
}

// vim: ts=4

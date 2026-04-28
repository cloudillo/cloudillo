// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '@cloudillo/react'

export type FABVariant = 'primary' | 'secondary' | 'accent'
export type FABSize = 'small' | 'default' | 'large'

export interface FABProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: FABVariant
	size?: FABSize
	icon?: React.ReactNode
	label?: string
}

export const FAB = createComponent<HTMLButtonElement, FABProps>(
	'FAB',
	(
		{ variant = 'secondary', size = 'default', icon, label, className, children, ...props },
		ref
	) => (
		<button
			ref={ref}
			type="button"
			aria-label={label}
			className={mergeClasses(
				'c-fab',
				variant === 'primary' && 'primary',
				variant === 'accent' && 'accent',
				size === 'small' && 'small',
				size === 'large' && 'large',
				className
			)}
			{...props}
		>
			{icon ?? children}
		</button>
	)
)

// vim: ts=4

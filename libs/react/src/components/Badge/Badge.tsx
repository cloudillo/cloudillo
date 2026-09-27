// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { ColorVariant, Size } from '../types.js'
import { createComponent, mergeClasses } from '../utils.js'

interface BadgeBaseProps extends React.HTMLAttributes<HTMLSpanElement> {
	color?: ColorVariant
	/** `filled` (default), `soft` (container tone) or `outline`. */
	variant?: 'soft' | 'filled' | 'outline'
	size?: Size
	/** Leading icon, shown before the text. */
	icon?: React.ReactNode
	/** @deprecated Badges are pills by default; this is a no-op. */
	rounded?: boolean
}

/** A Badge is never interactive. A `dot` carries no text, so it needs an `aria-label`. */
export type BadgeProps = BadgeBaseProps &
	(
		| { dot?: false; children?: React.ReactNode }
		| { dot: true; 'aria-label': string; children?: never }
	)

export const Badge = createComponent<HTMLSpanElement, BadgeProps>(
	'Badge',
	(
		{
			className,
			color,
			variant = 'filled',
			size,
			icon,
			dot,
			rounded: _rounded,
			children,
			...props
		},
		ref
	) => {
		return (
			<span
				ref={ref}
				role={dot ? 'img' : undefined}
				className={mergeClasses(
					'c-badge',
					variant === 'soft' ? `container-${color ?? 'secondary'}` : color,
					variant === 'outline' && 'outline',
					size !== 'md' && size,
					dot && 'dot',
					icon && !dot ? 'with-icon' : undefined,
					className
				)}
				{...props}
			>
				{!dot && icon}
				{!dot && children}
			</span>
		)
	}
)

// vim: ts=4

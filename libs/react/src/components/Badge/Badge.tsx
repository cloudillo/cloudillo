// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { ColorVariant } from '../types.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
	variant?: ColorVariant
	rounded?: boolean
	children?: React.ReactNode
}

export const Badge = createComponent<HTMLSpanElement, BadgeProps>(
	'Badge',
	({ className, variant, rounded, children, ...props }, ref) => {
		return (
			<span
				ref={ref}
				className={mergeClasses('c-badge', variant, rounded && 'br', className)}
				{...props}
			>
				{children}
			</span>
		)
	}
)

// vim: ts=4

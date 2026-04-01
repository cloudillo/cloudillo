// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'
import type { ColorVariant } from '../types.js'

export interface AvatarBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
	count?: number
	variant?: ColorVariant
	children?: React.ReactNode
}

export const AvatarBadge = createComponent<HTMLSpanElement, AvatarBadgeProps>(
	'AvatarBadge',
	({ className, count, variant, children, ...props }, ref) => {
		return (
			<span
				ref={ref}
				className={mergeClasses('c-avatar-badge', variant, className)}
				{...props}
			>
				{count !== undefined ? count : children}
			</span>
		)
	}
)

// vim: ts=4

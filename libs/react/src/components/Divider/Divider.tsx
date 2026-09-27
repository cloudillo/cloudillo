// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { ColorVariant } from '../types.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Visible label, also announced (e.g. an unread marker) */
	label?: string
	color?: ColorVariant
	orientation?: 'horizontal' | 'vertical'
}

export const Divider = createComponent<HTMLDivElement, DividerProps>(
	'Divider',
	({ label, color, orientation = 'horizontal', className, ...props }, ref) => (
		<div
			ref={ref}
			role="separator"
			aria-orientation={orientation}
			aria-label={label}
			className={mergeClasses('c-divider', orientation, color, className)}
			{...props}
		>
			{label && <span>{label}</span>}
		</div>
	)
)

// vim: ts=4

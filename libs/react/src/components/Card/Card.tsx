// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'
import type { ColorVariant, Elevation } from '../types.js'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: ColorVariant
	elevation?: Elevation
	interactive?: boolean
	children?: React.ReactNode
}

export const Card = createComponent<HTMLDivElement, CardProps>(
	'Card',
	({ className, variant, elevation, interactive, children, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-card',
					variant,
					elevation,
					interactive && 'interactive',
					className
				)}
				{...props}
			>
				{children}
			</div>
		)
	}
)

// vim: ts=4

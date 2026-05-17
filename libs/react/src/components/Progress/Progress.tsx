// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'
import type { ColorVariant } from '../types.js'

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
	value?: number // 0-100
	variant?: ColorVariant
	indeterminate?: boolean
	children?: React.ReactNode
}

export const Progress = createComponent<HTMLDivElement, ProgressProps>(
	'Progress',
	({ className, value = 0, variant, indeterminate, style, children, ...props }, ref) => {
		const clamped = Math.min(100, Math.max(0, value))
		const barStyle: React.CSSProperties | undefined = indeterminate
			? undefined
			: { width: `${clamped}%` }

		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-progress',
					variant,
					indeterminate && 'indeterminate',
					className
				)}
				style={style}
				role="progressbar"
				aria-valuenow={indeterminate ? undefined : clamped}
				aria-valuemin={0}
				aria-valuemax={100}
				{...props}
			>
				<div className="bar" style={barStyle}>
					{children}
				</div>
			</div>
		)
	}
)

// vim: ts=4

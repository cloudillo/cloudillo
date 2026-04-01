// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface HBoxProps extends React.HTMLAttributes<HTMLDivElement> {
	wrap?: boolean
	gap?: 0 | 1 | 2 | 3
	children?: React.ReactNode
}

export const HBox = createComponent<HTMLDivElement, HBoxProps>(
	'HBox',
	({ className, wrap, gap, children, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-hbox',
					wrap && 'flex-wrap',
					gap !== undefined && `g-${gap}`,
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

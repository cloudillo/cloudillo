// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface VBoxProps extends React.HTMLAttributes<HTMLDivElement> {
	wrap?: boolean
	gap?: 0 | 1 | 2 | 3
	fill?: boolean
	children?: React.ReactNode
}

export const VBox = createComponent<HTMLDivElement, VBoxProps>(
	'VBox',
	({ className, wrap, gap, fill, children, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-vbox',
					wrap && 'flex-wrap',
					gap !== undefined && `g-${gap}`,
					fill && 'fill',
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

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface TagListProps extends React.HTMLAttributes<HTMLDivElement> {
	gap?: 0 | 1 | 2 | 3
	children?: React.ReactNode
}

export const TagList = createComponent<HTMLDivElement, TagListProps>(
	'TagList',
	({ className, gap = 1, children, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={mergeClasses('c-hbox flex-wrap', `g-${gap}`, className)}
				{...props}
			>
				{children}
			</div>
		)
	}
)

// vim: ts=4

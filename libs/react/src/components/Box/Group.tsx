// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface GroupProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode
}

export const Group = createComponent<HTMLDivElement, GroupProps>(
	'Group',
	({ className, children, ...props }, ref) => {
		return (
			<div ref={ref} className={mergeClasses('c-group', className)} {...props}>
				{children}
			</div>
		)
	}
)

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

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

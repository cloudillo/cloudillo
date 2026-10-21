// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export interface SidebarNavProps extends React.HTMLAttributes<HTMLUListElement> {
	children?: React.ReactNode
}

export const SidebarNav = createComponent<HTMLUListElement, SidebarNavProps>(
	'SidebarNav',
	({ className, children, ...props }, ref) => {
		return (
			<ul ref={ref} className={mergeClasses('c-sidebar-nav', className)} {...props}>
				{children}
			</ul>
		)
	}
)

// vim: ts=4

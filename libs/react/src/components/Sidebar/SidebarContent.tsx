// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface SidebarContentProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode
}

export const SidebarContent = createComponent<HTMLDivElement, SidebarContentProps>(
	'SidebarContent',
	({ className, children, ...props }, ref) => {
		return (
			<div ref={ref} className={mergeClasses('c-sidebar-content', className)} {...props}>
				{children}
			</div>
		)
	}
)

// vim: ts=4

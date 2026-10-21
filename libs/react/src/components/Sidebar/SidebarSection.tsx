// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export interface SidebarSectionProps extends React.HTMLAttributes<HTMLDivElement> {
	title?: string
	children?: React.ReactNode
}

export const SidebarSection = createComponent<HTMLDivElement, SidebarSectionProps>(
	'SidebarSection',
	({ className, title, children, ...props }, ref) => {
		return (
			<div ref={ref} className={mergeClasses('c-sidebar-section', className)} {...props}>
				{title && <div className="c-sidebar-section-title">{title}</div>}
				{children}
			</div>
		)
	}
)

// vim: ts=4

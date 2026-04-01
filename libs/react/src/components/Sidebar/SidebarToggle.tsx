// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'
import { useSidebarContext } from './SidebarContext.js'

export interface SidebarToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	children?: React.ReactNode
}

export const SidebarToggle = createComponent<HTMLButtonElement, SidebarToggleProps>(
	'SidebarToggle',
	({ className, onClick, children, ...props }, ref) => {
		const context = useSidebarContext()

		function handleClick(evt: React.MouseEvent<HTMLButtonElement>) {
			if (context.toggle) {
				context.toggle()
			}
			onClick?.(evt)
		}

		return (
			<button
				ref={ref}
				type="button"
				className={mergeClasses('c-sidebar-toggle', className)}
				onClick={handleClick}
				{...props}
			>
				{children}
			</button>
		)
	}
)

// vim: ts=4

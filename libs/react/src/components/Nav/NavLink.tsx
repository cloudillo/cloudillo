// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface NavLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
	active?: boolean
	children?: React.ReactNode
}

export const NavLink = createComponent<HTMLAnchorElement, NavLinkProps>(
	'NavLink',
	({ className, active, children, ...props }, ref) => {
		return (
			<a
				ref={ref}
				className={mergeClasses('c-nav-link', active && 'active', className)}
				{...props}
			>
				{children}
			</a>
		)
	}
)

// vim: ts=4

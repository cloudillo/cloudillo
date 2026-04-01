// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent, polyRef } from '../utils.js'

export interface NavItemProps extends React.HTMLAttributes<HTMLElement> {
	as?: 'button' | 'li' | 'div'
	active?: boolean
	disabled?: boolean
	gap?: 0 | 1 | 2 | 3
	children?: React.ReactNode
}

export const NavItem = createComponent<HTMLElement, NavItemProps>(
	'NavItem',
	({ as: Component = 'li', className, active, disabled, gap, children, ...props }, ref) => {
		return (
			<Component
				ref={polyRef(ref)}
				className={mergeClasses(
					'c-nav-item',
					active && 'active',
					disabled && 'disabled',
					gap !== undefined && `g-${gap}`,
					className
				)}
				{...(disabled && Component === 'button' ? { disabled: true } : {})}
				{...props}
			>
				{children}
			</Component>
		)
	}
)

// vim: ts=4

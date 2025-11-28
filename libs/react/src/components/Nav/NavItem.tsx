// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

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
				ref={ref as any}
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

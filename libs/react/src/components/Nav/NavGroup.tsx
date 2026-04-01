// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent, polyRef } from '../utils.js'

export interface NavGroupProps extends React.HTMLAttributes<HTMLUListElement | HTMLDivElement> {
	as?: 'ul' | 'div'
	vertical?: boolean
	gap?: 0 | 1 | 2 | 3
	children?: React.ReactNode
}

export const NavGroup = createComponent<HTMLUListElement | HTMLDivElement, NavGroupProps>(
	'NavGroup',
	({ as: Component = 'ul', className, vertical, gap, children, ...props }, ref) => {
		return (
			<Component
				ref={polyRef(ref)}
				className={mergeClasses(
					'c-nav-group',
					vertical && 'vertical',
					gap !== undefined && `g-${gap}`,
					className
				)}
				{...props}
			>
				{children}
			</Component>
		)
	}
)

// vim: ts=4

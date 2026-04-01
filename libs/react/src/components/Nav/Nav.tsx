// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent, polyRef } from '../utils.js'
import type { Elevation } from '../types.js'

export interface NavProps extends React.HTMLAttributes<HTMLElement> {
	as?: 'nav' | 'ul' | 'div'
	vertical?: boolean
	elevation?: Elevation
	emph?: boolean
	small?: boolean
	children?: React.ReactNode
}

export const Nav = createComponent<HTMLElement, NavProps>(
	'Nav',
	(
		{ as: Component = 'nav', className, vertical, elevation, emph, small, children, ...props },
		ref
	) => {
		return (
			<Component
				ref={polyRef(ref)}
				className={mergeClasses(
					'c-nav',
					vertical && 'vertical',
					elevation,
					emph && 'emph',
					small && 'h-small',
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

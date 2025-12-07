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
				ref={ref as any}
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

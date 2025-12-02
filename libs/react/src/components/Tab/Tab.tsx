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
import { TabsContext } from './Tabs.js'
import type { ColorVariant } from '../types.js'

export interface TabProps extends React.HTMLAttributes<HTMLButtonElement | HTMLAnchorElement> {
	value?: string
	variant?: ColorVariant
	active?: boolean
	as?: 'button' | 'a'
	href?: string
	children?: React.ReactNode
}

export const Tab = createComponent<HTMLButtonElement | HTMLAnchorElement, TabProps>(
	'Tab',
	(
		{ className, value, variant, active: activeProp, as, href, onClick, children, ...props },
		ref
	) => {
		const context = React.useContext(TabsContext)

		// Determine if this tab is active
		const isActive = activeProp ?? (value !== undefined && context.value === value)

		function handleClick(evt: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) {
			if (value !== undefined && context.onTabChange) {
				context.onTabChange(value)
			}
			if (onClick) {
				onClick(evt as any)
			}
		}

		const Component = as || (href ? 'a' : 'button')

		return (
			<Component
				ref={ref as any}
				className={mergeClasses('c-tab', variant, isActive && 'active', className)}
				role="tab"
				aria-selected={isActive}
				onClick={handleClick}
				{...(Component === 'a' ? { href } : { type: 'button' })}
				{...props}
			>
				{children}
			</Component>
		)
	}
)

// vim: ts=4

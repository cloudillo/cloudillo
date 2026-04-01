// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent, polyRef } from '../utils.js'
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
				onClick(evt as React.MouseEvent<HTMLButtonElement & HTMLAnchorElement>)
			}
		}

		const Component = as || (href ? 'a' : 'button')

		return (
			<Component
				ref={polyRef(ref)}
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

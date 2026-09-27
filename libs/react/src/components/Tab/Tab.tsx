// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Link as RouterLink } from 'react-router-dom'

import { useRouteActive } from '../Nav/Nav.js'
import type { ColorVariant } from '../types.js'
import { createComponent, isInternal, mergeClasses, polyRef } from '../utils.js'
import { TabsContext } from './Tabs.js'

export interface TabProps extends React.HTMLAttributes<HTMLButtonElement | HTMLAnchorElement> {
	value?: string
	color?: ColorVariant
	/** Overrides the value/router-derived active state */
	active?: boolean
	as?: 'button' | 'a'
	/** `/…` (without `as`) → router link, active when the route matches */
	href?: string
	icon?: React.ReactNode
	count?: number
	children?: React.ReactNode
}

const TabInner = createComponent<HTMLButtonElement | HTMLAnchorElement, TabProps>(
	'TabInner',
	(
		{
			className,
			value,
			color,
			active: activeProp,
			as,
			href,
			icon,
			count,
			onClick,
			children,
			...props
		},
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

		const common = {
			className: mergeClasses('c-tab', color, isActive && 'active', className),
			role: 'tab',
			'aria-selected': isActive,
			onClick: handleClick,
			...props
		}
		const content = (
			<>
				{icon}
				{children}
				{count !== undefined && <span className="c-tab-count">{count}</span>}
			</>
		)

		if (href && !as && isInternal(href)) {
			return (
				<RouterLink ref={polyRef(ref)} to={href} {...common}>
					{content}
				</RouterLink>
			)
		}

		const Component = as || (href ? 'a' : 'button')
		return (
			<Component
				ref={polyRef(ref)}
				{...(Component === 'a' ? { href } : { type: 'button' as const })}
				{...common}
			>
				{content}
			</Component>
		)
	}
)

const RoutedTab = createComponent<
	HTMLButtonElement | HTMLAnchorElement,
	TabProps & { href: string }
>('RoutedTab', (props, ref) => {
	// Route match only turns a tab on; otherwise the Tabs value decides
	const routeActive = useRouteActive(props.href)
	return <TabInner ref={ref} {...props} active={routeActive || undefined} />
})

export const Tab = createComponent<HTMLButtonElement | HTMLAnchorElement, TabProps>(
	'Tab',
	(props, ref) =>
		props.href && !props.as && isInternal(props.href) && props.active === undefined ? (
			<RoutedTab ref={ref} {...props} href={props.href} />
		) : (
			<TabInner ref={ref} {...props} />
		)
)

// vim: ts=4

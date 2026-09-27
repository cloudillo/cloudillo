// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'

import type { Elevation, Size } from '../types.js'
import { createComponent, isCrossOrigin, isInternal, mergeClasses, polyRef } from '../utils.js'

const trimSlash = (path: string) => path.replace(/(.)\/$/, '$1')

/** Exact-path match of an in-app href against the router location (needs a Router) */
export function useRouteActive(href: string): boolean {
	const { pathname } = useLocation()
	return trimSlash(pathname) === trimSlash(href.split(/[?#]/)[0])
}

export interface NavProps extends React.HTMLAttributes<HTMLElement> {
	orientation?: 'vertical' | 'horizontal'
	size?: Size
	/** @deprecated legacy single-element render (no inner `<ul>`), for NavItem children */
	as?: 'nav' | 'ul' | 'div'
	/** @deprecated use `orientation="vertical"` */
	vertical?: boolean
	elevation?: Elevation
	emph?: boolean
	/** @deprecated use `size="sm"` */
	small?: boolean
	children?: React.ReactNode
}

export const NavComponent = createComponent<HTMLElement, NavProps>(
	'Nav',
	(
		{ as, className, orientation, size, vertical, elevation, emph, small, children, ...props },
		ref
	) => {
		if (as) {
			const Component = as
			return (
				<Component
					ref={polyRef(ref)}
					className={mergeClasses(
						'c-nav',
						(vertical || orientation === 'vertical') && 'vertical',
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
		const sz = size ?? (small ? 'sm' : undefined)
		return (
			<nav
				ref={ref}
				className={mergeClasses(
					'c-nav',
					orientation ?? 'vertical',
					sz !== 'md' && sz,
					elevation,
					emph && 'emph',
					className
				)}
				{...props}
			>
				<ul className="c-nav-list">{children}</ul>
			</nav>
		)
	}
)

export interface NavSectionProps extends Omit<React.HTMLAttributes<HTMLLIElement>, 'title'> {
	label?: React.ReactNode
}

export const NavSection = createComponent<HTMLLIElement, NavSectionProps>(
	'NavSection',
	({ className, label, children, ...props }, ref) => {
		const id = React.useId()
		return (
			<li ref={ref} className={mergeClasses('c-nav-section', className)} {...props}>
				{label !== undefined && (
					<div id={id} className="c-nav-header">
						{label}
					</div>
				)}
				<ul className="c-nav-list" aria-labelledby={label !== undefined ? id : undefined}>
					{children}
				</ul>
			</li>
		)
	}
)

export interface NavDividerProps extends React.HTMLAttributes<HTMLLIElement> {}

export const NavDivider = createComponent<HTMLLIElement, NavDividerProps>(
	'NavDivider',
	({ className, ...props }, ref) => (
		<li
			ref={ref}
			role="separator"
			className={mergeClasses('c-nav-divider', className)}
			{...props}
		/>
	)
)

export interface NavMenuItemProps {
	label: React.ReactNode
	icon?: React.ReactNode
	/** `/…` → router link with router-derived `aria-current`; otherwise a plain `<a>` */
	href?: string
	onClick?: (evt: React.MouseEvent<HTMLElement>) => void
	/** Trailing node, usually a `<Badge>` */
	badge?: React.ReactNode
	count?: number
	/** Indent level for tree-like menus */
	depth?: number
	/** Overrides the router-derived active state */
	active?: boolean
	disabled?: boolean
	className?: string
}

function NavItemInner({
	label,
	icon,
	href,
	onClick,
	badge,
	count,
	depth,
	active,
	disabled
}: Omit<NavMenuItemProps, 'className'>) {
	const className = mergeClasses('c-nav-item', active && 'active')
	const style = depth ? ({ '--nav-depth': depth } as React.CSSProperties) : undefined
	const content = (
		<>
			{icon}
			<span className="c-nav-item-label">{label}</span>
			{count !== undefined && <span className="c-nav-item-count">{count}</span>}
			{badge}
		</>
	)

	if (href && !disabled) {
		const linkProps = {
			className,
			style,
			onClick,
			'aria-current': active ? ('page' as const) : undefined
		}
		return isInternal(href) ? (
			<RouterLink to={href} {...linkProps}>
				{content}
			</RouterLink>
		) : (
			<a href={href} rel={isCrossOrigin(href) ? 'noopener' : undefined} {...linkProps}>
				{content}
			</a>
		)
	}
	return (
		<button
			type="button"
			className={className}
			style={style}
			disabled={disabled}
			onClick={onClick}
			aria-current={active || undefined}
		>
			{content}
		</button>
	)
}

function RoutedNavItem(props: Omit<NavMenuItemProps, 'className'> & { href: string }) {
	const active = useRouteActive(props.href)
	return <NavItemInner {...props} active={active} />
}

export const NavMenuItem = createComponent<HTMLLIElement, NavMenuItemProps>(
	'NavMenuItem',
	({ className, ...props }, ref) => (
		<li ref={ref} className={className}>
			{props.href && isInternal(props.href) && props.active === undefined ? (
				<RoutedNavItem {...props} href={props.href} />
			) : (
				<NavItemInner {...props} />
			)}
		</li>
	)
)

/** `<Nav aria-label>` + `Nav.Section` / `Nav.Item` / `Nav.Divider` → `<nav><ul><li>` */
export const Nav = Object.assign(NavComponent, {
	Section: NavSection,
	Item: NavMenuItem,
	Divider: NavDivider
})

// vim: ts=4

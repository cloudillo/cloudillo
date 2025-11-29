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
import { Link } from 'react-router-dom'
import { mergeClasses, createComponent } from '../utils.js'
import { Badge } from '../Badge/index.js'

export interface FilterBarProps extends React.HTMLAttributes<HTMLUListElement> {
	variant?: 'vertical' | 'horizontal'
	elevation?: 'low' | 'mid' | 'high'
}

export const FilterBarComponent = createComponent<HTMLUListElement, FilterBarProps>(
	'FilterBar',
	({ className, variant = 'vertical', elevation = 'low', children, ...props }, ref) => {
		return (
			<ul
				ref={ref}
				className={mergeClasses(
					'c-nav',
					'c-filter-bar',
					variant,
					elevation,
					className
				)}
				{...props}
			>
				{children}
			</ul>
		)
	}
)

export interface FilterBarItemProps extends Omit<React.LiHTMLAttributes<HTMLLIElement>, 'onClick'> {
	icon?: React.ReactNode
	label: React.ReactNode
	to?: string
	href?: string
	active?: boolean
	badge?: React.ReactNode
	badgeVariant?: 'error' | 'warning' | 'success' | 'primary' | 'secondary'
	disabled?: boolean
	onClick?: () => void
}

export const FilterBarItem = createComponent<HTMLLIElement, FilterBarItemProps>(
	'FilterBarItem',
	({ className, icon, label, to, href, active, badge, badgeVariant = 'error', disabled, onClick, children, ...props }, ref) => {
		const content = (
			<>
				{icon}
				<span className="c-filter-bar-item-label">{label}</span>
				{badge !== undefined && (
					<Badge variant={badgeVariant} rounded className="c-filter-bar-item-badge">
						{badge}
					</Badge>
				)}
			</>
		)

		let linkElement: React.ReactNode

		if (to) {
			linkElement = (
				<Link
					className={mergeClasses('c-nav-link', active && 'active', disabled && 'disabled')}
					to={to}
				>
					{content}
				</Link>
			)
		} else if (href) {
			linkElement = (
				<a
					className={mergeClasses('c-nav-link', active && 'active', disabled && 'disabled')}
					href={href}
				>
					{content}
				</a>
			)
		} else {
			linkElement = (
				<button
					className={mergeClasses('c-nav-item', active && 'active')}
					type="button"
					disabled={disabled}
					onClick={onClick}
				>
					{content}
				</button>
			)
		}

		return (
			<li ref={ref} className={mergeClasses('c-nav-item', className)} {...props}>
				{linkElement}
				{children}
			</li>
		)
	}
)

export interface FilterBarDividerProps extends React.HTMLAttributes<HTMLHRElement> {}

export const FilterBarDivider = createComponent<HTMLHRElement, FilterBarDividerProps>(
	'FilterBarDivider',
	({ className, ...props }, ref) => {
		return <hr ref={ref} className={mergeClasses('c-filter-bar-divider', 'w-100', className)} {...props} />
	}
)

export interface FilterBarSectionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
	title?: React.ReactNode
}

export const FilterBarSection = createComponent<HTMLDivElement, FilterBarSectionProps>(
	'FilterBarSection',
	({ className, title, children, ...props }, ref) => {
		return (
			<div ref={ref} className={mergeClasses('c-filter-bar-section', className)} {...props}>
				{title && <div className="c-filter-bar-section-title">{title}</div>}
				{children}
			</div>
		)
	}
)

export interface FilterBarSearchProps extends React.InputHTMLAttributes<HTMLInputElement> {
	onSearch?: (query: string) => void
	searchIcon?: React.ReactNode
}

export const FilterBarSearch = createComponent<HTMLInputElement, FilterBarSearchProps>(
	'FilterBarSearch',
	({ className, onSearch, searchIcon, onChange, ...props }, ref) => {
		const [query, setQuery] = React.useState('')

		const handleChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
			setQuery(e.target.value)
			onChange?.(e)
		}, [onChange])

		const handleSubmit = React.useCallback((e: React.FormEvent) => {
			e.preventDefault()
			onSearch?.(query)
		}, [query, onSearch])

		return (
			<form className={mergeClasses('c-input-group', 'c-filter-bar-search', className)} onSubmit={handleSubmit}>
				<input
					ref={ref}
					type="text"
					className="c-input"
					value={query}
					onChange={handleChange}
					{...props}
				/>
				{searchIcon && (
					<button className="c-button secondary" type="submit">
						{searchIcon}
					</button>
				)}
			</form>
		)
	}
)

// Compound component
export const FilterBar = Object.assign(FilterBarComponent, {
	Item: FilterBarItem,
	Divider: FilterBarDivider,
	Section: FilterBarSection,
	Search: FilterBarSearch,
})

// vim: ts=4

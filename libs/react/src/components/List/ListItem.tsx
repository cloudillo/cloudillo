// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuChevronRight as IcChevron } from 'react-icons/lu'
import { Link as RouterLink } from 'react-router-dom'

import { createComponent, isCrossOrigin, isInternal, mergeClasses } from '../utils.js'
import { ListContext } from './List.js'

export interface ListItemProps
	extends Omit<React.LiHTMLAttributes<HTMLLIElement>, 'title' | 'onClick'> {
	/** Avatar, icon or ColorDot before the text */
	leading?: React.ReactNode
	/** Row title; on an `href`/`onClick` row it is the link/button that makes the whole row clickable */
	title?: React.ReactNode
	subtitle?: React.ReactNode
	/** Always-visible secondary info after the text (e.g. `<Meta>`, a time) */
	meta?: React.ReactNode
	/** Hover-revealed row actions; always visible on touch and while the row has focus */
	actions?: React.ReactNode
	/** Always-visible trailing content (Toggle, Badge, …) */
	trailing?: React.ReactNode
	/** Whole-row link; adds a chevron. `/…` renders a router `Link`. */
	href?: string
	/** Whole-row action (or the select handler in a `selectable` List) */
	onClick?: (evt: React.SyntheticEvent<HTMLElement>) => void
	selected?: boolean
	disabled?: boolean
}

export const ListItem = createComponent<HTMLLIElement, ListItemProps>(
	'ListItem',
	(
		{
			className,
			leading,
			title,
			subtitle,
			meta,
			actions,
			trailing,
			href,
			onClick,
			selected,
			disabled,
			children,
			...props
		},
		ref
	) => {
		const { selectable } = React.useContext(ListContext)

		// Plain prose item (marker lists): no row layout
		if (title === undefined && leading === undefined) {
			return (
				<li ref={ref} className={className} {...props}>
					{children}
				</li>
			)
		}

		const titleCls = 'c-list-item-title'
		let titleEl: React.ReactNode
		if (selectable || disabled || (!href && !onClick)) {
			titleEl = <span className={titleCls}>{title}</span>
		} else if (href) {
			titleEl = isInternal(href) ? (
				<RouterLink to={href} className={`${titleCls} stretched`} onClick={onClick}>
					{title}
				</RouterLink>
			) : (
				<a
					href={href}
					rel={isCrossOrigin(href) ? 'noopener' : undefined}
					className={`${titleCls} stretched`}
					onClick={onClick}
				>
					{title}
				</a>
			)
		} else {
			titleEl = (
				<button type="button" className={`${titleCls} stretched`} onClick={onClick}>
					{title}
				</button>
			)
		}

		// Listbox option: the row itself is the focus stop and the click target
		const optionProps: React.LiHTMLAttributes<HTMLLIElement> = selectable
			? {
					role: 'option',
					'aria-selected': !!selected,
					'aria-disabled': disabled || undefined,
					// every option is a tab stop; roving tabindex + arrow keys when lists get long
					tabIndex: disabled ? -1 : 0,
					onClick: disabled ? undefined : onClick,
					onKeyDown: (evt) => {
						if (disabled || (evt.key !== 'Enter' && evt.key !== ' ')) return
						evt.preventDefault()
						onClick?.(evt)
					}
				}
			: {}

		return (
			<li
				ref={ref}
				className={mergeClasses(
					'c-list-item',
					(selectable || href || onClick) && !disabled && 'interactive',
					selected && 'selected',
					disabled && 'disabled',
					className
				)}
				{...optionProps}
				{...props}
			>
				{leading && <span className="c-list-item-leading">{leading}</span>}
				<span className="c-list-item-body">
					{titleEl}
					{subtitle && <span className="c-list-item-subtitle">{subtitle}</span>}
					{children}
				</span>
				{meta && <span className="c-list-item-meta">{meta}</span>}
				{actions && <span className="c-list-item-actions">{actions}</span>}
				{trailing && <span className="c-list-item-trailing">{trailing}</span>}
				{href && <IcChevron className="c-list-item-chevron" aria-hidden="true" />}
			</li>
		)
	}
)

// vim: ts=4

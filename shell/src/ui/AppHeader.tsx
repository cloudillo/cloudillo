// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { mergeClasses } from '@cloudillo/react'
import * as React from 'react'

export interface AppHeaderProps {
	'aria-label': string
	inert?: boolean
	/** Shown at the very start; hidden below sm while `expanded`. */
	logo?: React.ReactNode
	/** Start group, after the logo. Children are list items (`AppHeaderItem`). */
	start?: React.ReactNode
	/** Middle tier (the context strip). */
	center?: React.ReactNode
	/** End group of actions. Children are list items (`AppHeaderItem`, `HandChip`, …). */
	end?: React.ReactNode
	/** The start group grows to fill the row (the open omnibox); below sm the end group hides. */
	expanded?: boolean
}

/** The shell's top bar — logo + start | center | end. */
export function AppHeader({
	'aria-label': ariaLabel,
	inert,
	logo,
	start,
	center,
	end,
	expanded
}: AppHeaderProps) {
	return (
		<nav
			inert={inert}
			className="c-nav nav-top justify-content-between border-radius-0 mb-2 g-1"
			aria-label={ariaLabel}
		>
			{/* Only the expanded start group grows to fill the row; idle it stays
			    content-sized so the center keeps clear of the end icons. Expanded, it
			    may shrink below the input's intrinsic width, and below sm the end
			    group yields the row to it. */}
			<ul
				className={mergeClasses('c-nav-group g-1', expanded && 'flex-fill')}
				style={expanded ? { minWidth: 0 } : undefined}
			>
				{logo && (
					<li className={mergeClasses('c-nav-item', expanded && 'sm-hide')}>{logo}</li>
				)}
				{start}
			</ul>
			{center}
			<ul className={mergeClasses('c-nav-group g-1', expanded && 'sm-hide')}>{end}</ul>
		</nav>
	)
}

export interface AppHeaderItemProps {
	/** Grow to fill the group (the omnibox input). */
	fill?: boolean
	className?: string
	children: React.ReactNode
}

/** One entry in an `AppHeader` group. */
export function AppHeaderItem({ fill, className, children }: AppHeaderItemProps) {
	return (
		<li
			className={mergeClasses(fill && 'flex-fill', className)}
			style={fill ? { minWidth: 0 } : undefined}
		>
			{children}
		</li>
	)
}

// vim: ts=4

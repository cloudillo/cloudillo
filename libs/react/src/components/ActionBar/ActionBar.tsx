// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent, mergeClasses } from '../utils.js'

export interface ActionBarProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Actions pinned to the start edge (e.g. a destructive "Delete"). */
	start?: React.ReactNode
	/** The end group fills the row and its buttons share it equally. */
	stretch?: boolean
	children?: React.ReactNode
}

/**
 * Row of dialog/form actions. Desktop: right-aligned, primary last.
 * Below 48rem: stacked full-width, the last child (primary) on top. Owns its top spacing.
 */
export const ActionBar = createComponent<HTMLDivElement, ActionBarProps>(
	'ActionBar',
	({ className, start, stretch, children, ...props }, ref) => (
		<div
			ref={ref}
			className={mergeClasses('c-action-bar', stretch && 'stretch', className)}
			{...props}
		>
			{start && <div className="c-action-bar__start">{start}</div>}
			<div className="c-action-bar__end">{children}</div>
		</div>
	)
)

// vim: ts=4

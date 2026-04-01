// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
	compact?: boolean
	children?: React.ReactNode
}

export const Toolbar = createComponent<HTMLDivElement, ToolbarProps>(
	'Toolbar',
	({ className, compact, children, ...props }, ref) => (
		<div
			ref={ref}
			className={mergeClasses('c-toolbar', compact && 'compact', className)}
			{...props}
		>
			{children}
		</div>
	)
)

export interface ToolbarDividerProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ToolbarDivider = createComponent<HTMLDivElement, ToolbarDividerProps>(
	'ToolbarDivider',
	({ className, ...props }, ref) => (
		<div ref={ref} className={mergeClasses('c-toolbar-divider', className)} {...props} />
	)
)

export interface ToolbarSpacerProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ToolbarSpacer = createComponent<HTMLDivElement, ToolbarSpacerProps>(
	'ToolbarSpacer',
	({ className, ...props }, ref) => (
		<div ref={ref} className={mergeClasses('c-toolbar-spacer', className)} {...props} />
	)
)

export interface ToolbarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode
}

export const ToolbarGroup = createComponent<HTMLDivElement, ToolbarGroupProps>(
	'ToolbarGroup',
	({ className, children, ...props }, ref) => (
		<div ref={ref} className={mergeClasses('c-toolbar-group', className)} {...props}>
			{children}
		</div>
	)
)

// vim: ts=4

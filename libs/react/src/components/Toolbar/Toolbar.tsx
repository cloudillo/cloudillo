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

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface TreeViewProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode
}

export const TreeView = createComponent<HTMLDivElement, TreeViewProps>(
	'TreeView',
	({ className, children, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={mergeClasses('c-tree-view c-vbox', className)}
				role="tree"
				{...props}
			>
				{children}
			</div>
		)
	}
)

// vim: ts=4

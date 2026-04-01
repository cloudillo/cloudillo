// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'
import { useSidebarContext } from './SidebarContext.js'

export interface SidebarBackdropProps extends React.HTMLAttributes<HTMLDivElement> {
	show?: boolean
}

export const SidebarBackdrop = createComponent<HTMLDivElement, SidebarBackdropProps>(
	'SidebarBackdrop',
	({ className, show, onClick, ...props }, ref) => {
		const context = useSidebarContext()

		// Use show prop or derive from context (open but not pinned)
		const isVisible = show ?? (context.isOpen && !context.isPinned)

		function handleClick(evt: React.MouseEvent<HTMLDivElement>) {
			if (context.close) {
				context.close()
			}
			onClick?.(evt)
		}

		if (!isVisible) return null

		return (
			<div
				ref={ref}
				className={mergeClasses('c-sidebar-backdrop', className)}
				onClick={handleClick}
				{...props}
			/>
		)
	}
)

// vim: ts=4

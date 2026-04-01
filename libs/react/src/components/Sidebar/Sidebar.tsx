// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'
import { SidebarContext } from './SidebarContext.js'
import type { UseSidebarReturn } from './useSidebar.js'

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
	side?: 'left' | 'right'
	open?: boolean
	pinned?: boolean
	collapsed?: boolean
	width?: number
	autoPin?: boolean
	// Pass sidebar hook return for controlled mode
	sidebar?: UseSidebarReturn
	children?: React.ReactNode
}

export const Sidebar = createComponent<HTMLElement, SidebarProps>(
	'Sidebar',
	(
		{
			className,
			side = 'left',
			open,
			pinned,
			collapsed,
			width,
			autoPin,
			sidebar,
			style,
			children,
			...props
		},
		ref
	) => {
		// Use either controlled props or sidebar hook values
		const isOpen = open ?? sidebar?.isOpen ?? false
		const isPinned = pinned ?? sidebar?.isPinned ?? false
		const isCollapsed = collapsed ?? sidebar?.isCollapsed ?? false
		const sidebarWidth = width ?? sidebar?.width ?? 256

		const sidebarStyle = {
			...style,
			'--sidebar-width': `${sidebarWidth}px`
		} as React.CSSProperties

		return (
			<SidebarContext.Provider value={{ side, ...sidebar }}>
				<aside
					ref={ref}
					className={mergeClasses(
						'c-sidebar',
						side,
						isOpen && 'open',
						isPinned && 'pinned',
						isCollapsed && 'collapsed',
						autoPin && 'auto-pin',
						className
					)}
					style={sidebarStyle}
					{...props}
				>
					{children}
				</aside>
			</SidebarContext.Provider>
		)
	}
)

// vim: ts=4

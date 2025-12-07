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

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

export interface SidebarResizeHandleProps extends React.HTMLAttributes<HTMLDivElement> {
	onResize?: (width: number) => void
}

export const SidebarResizeHandle = createComponent<HTMLDivElement, SidebarResizeHandleProps>(
	'SidebarResizeHandle',
	({ className, onResize, ...props }, ref) => {
		const context = useSidebarContext()
		const [isResizing, setIsResizing] = React.useState(false)
		const startX = React.useRef(0)
		const startWidth = React.useRef(0)

		React.useEffect(() => {
			if (!isResizing) return

			function handleMouseMove(evt: MouseEvent) {
				const delta = context.side === 'right'
					? startX.current - evt.clientX
					: evt.clientX - startX.current
				const newWidth = startWidth.current + delta

				if (context.setWidth) {
					context.setWidth(newWidth)
				}
				onResize?.(newWidth)
			}

			function handleMouseUp() {
				setIsResizing(false)
			}

			document.addEventListener('mousemove', handleMouseMove)
			document.addEventListener('mouseup', handleMouseUp)

			return () => {
				document.removeEventListener('mousemove', handleMouseMove)
				document.removeEventListener('mouseup', handleMouseUp)
			}
		}, [isResizing, context.side, context.setWidth, onResize])

		function handleMouseDown(evt: React.MouseEvent) {
			evt.preventDefault()
			startX.current = evt.clientX
			startWidth.current = context.width ?? 256
			setIsResizing(true)
		}

		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-sidebar-resize-handle',
					isResizing && 'resizing',
					className
				)}
				onMouseDown={handleMouseDown}
				{...props}
			/>
		)
	}
)

// vim: ts=4

// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
				const delta =
					context.side === 'right'
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

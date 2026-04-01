// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * ToolGroup: a grouped tool button with popover for mobile toolbar.
 * Shows a single button with the last-used tool icon; tapping opens
 * a popover above with all tools in the group.
 */

import * as React from 'react'
import type { ToolType } from '../tools/index.js'

export interface ToolGroupItem {
	tool: ToolType
	icon: React.ReactNode
	title: string
	shortcut: string
}

export interface ToolGroupProps {
	items: ToolGroupItem[]
	activeTool: ToolType
	lastUsedTool: ToolType
	onToolChange: (tool: ToolType) => void
}

export function ToolGroup({ items, activeTool, lastUsedTool, onToolChange }: ToolGroupProps) {
	const [open, setOpen] = React.useState(false)
	const groupRef = React.useRef<HTMLDivElement>(null)

	// Determine the icon to show on the group button
	const displayItem = items.find((i) => i.tool === lastUsedTool) ?? items[0]
	const isActive = items.some((i) => i.tool === activeTool)

	// Close popover on outside click/touch
	React.useEffect(() => {
		if (!open) return
		const handleOutside = (e: MouseEvent | TouchEvent) => {
			if (groupRef.current && !groupRef.current.contains(e.target as Node)) {
				setOpen(false)
			}
		}
		document.addEventListener('mousedown', handleOutside)
		document.addEventListener('touchstart', handleOutside)
		return () => {
			document.removeEventListener('mousedown', handleOutside)
			document.removeEventListener('touchstart', handleOutside)
		}
	}, [open])

	const handleGroupClick = () => {
		setOpen((prev) => !prev)
	}

	const handleItemClick = (tool: ToolType) => {
		onToolChange(tool)
		setOpen(false)
	}

	return (
		<div className="ideallo-tool-group" ref={groupRef}>
			<button
				className={`ideallo-tool-btn ${isActive ? 'active' : ''}`}
				onClick={handleGroupClick}
				title={displayItem.title}
			>
				{displayItem.icon}
				<span className="ideallo-tool-group-indicator" />
			</button>
			{open && (
				<div className="ideallo-tool-popover">
					{items.map((item) => (
						<button
							key={item.tool}
							className={`ideallo-tool-btn ${activeTool === item.tool ? 'active' : ''}`}
							onClick={() => handleItemClick(item.tool)}
							title={`${item.title} (${item.shortcut})`}
						>
							{item.icon}
						</button>
					))}
				</div>
			)}
		</div>
	)
}

// vim: ts=4

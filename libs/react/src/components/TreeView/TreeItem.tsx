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
import { LuChevronDown, LuChevronRight } from 'react-icons/lu'

export interface TreeItemDragData {
	id: string
	type: 'object' | 'container'
}

export interface TreeItemProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Unique identifier for the item */
	id: string
	/** Depth level for indentation (0 = root) */
	depth?: number
	/** Whether item is expanded (for items with children) */
	expanded?: boolean
	/** Whether item is selected */
	selected?: boolean
	/** Whether item has children (shows expand toggle) */
	hasChildren?: boolean
	/** Icon to display before the label */
	icon?: React.ReactNode
	/** Label text */
	label?: React.ReactNode
	/** Actions to display on the right side */
	actions?: React.ReactNode
	/** Whether the item is being dragged */
	dragging?: boolean
	/** Whether item is a drop target */
	dropTarget?: boolean
	/** Drop position indicator: 'before', 'after', or 'inside' */
	dropPosition?: 'before' | 'after' | 'inside' | null
	/** Callback when expand toggle is clicked */
	onToggle?: () => void
	/** Callback when item is selected */
	onSelect?: () => void
	/** Enable drag-drop functionality */
	isDraggable?: boolean
	/** Data to pass during drag operations */
	dragData?: TreeItemDragData
	/** Called when drag starts */
	onItemDragStart?: (e: React.DragEvent, data: TreeItemDragData) => void
	/** Called when dragging over this item */
	onItemDragOver?: (e: React.DragEvent, position: 'before' | 'after' | 'inside') => void
	/** Called when leaving drag target */
	onItemDragLeave?: (e: React.DragEvent) => void
	/** Called when dropped on this item */
	onItemDrop?: (e: React.DragEvent, position: 'before' | 'after' | 'inside') => void
	/** Called when drag ends */
	onItemDragEnd?: (e: React.DragEvent) => void
	/** Nested child items */
	children?: React.ReactNode
}

const INDENT_SIZE = 16 // pixels per depth level

export const TreeItem = createComponent<HTMLDivElement, TreeItemProps>(
	'TreeItem',
	(
		{
			className,
			id,
			depth = 0,
			expanded = false,
			selected = false,
			hasChildren = false,
			icon,
			label,
			actions,
			dragging = false,
			dropTarget = false,
			dropPosition = null,
			onToggle,
			onSelect,
			isDraggable = false,
			dragData,
			onItemDragStart,
			onItemDragOver,
			onItemDragLeave,
			onItemDrop,
			onItemDragEnd,
			children,
			...props
		},
		ref
	) => {
		const rowRef = React.useRef<HTMLDivElement>(null)

		const handleClick = React.useCallback(
			(e: React.MouseEvent) => {
				e.stopPropagation()
				onSelect?.()
			},
			[onSelect]
		)

		const handleToggleClick = React.useCallback(
			(e: React.MouseEvent) => {
				e.stopPropagation()
				onToggle?.()
			},
			[onToggle]
		)

		// Drag handlers
		const handleDragStart = React.useCallback(
			(e: React.DragEvent) => {
				if (!isDraggable || !dragData) return
				e.dataTransfer.effectAllowed = 'move'
				e.dataTransfer.setData('application/json', JSON.stringify(dragData))
				onItemDragStart?.(e, dragData)
			},
			[isDraggable, dragData, onItemDragStart]
		)

		const handleDragOver = React.useCallback(
			(e: React.DragEvent) => {
				e.preventDefault()
				e.stopPropagation()
				if (!onItemDragOver) return

				// Calculate drop position based on mouse position within the row
				const row = rowRef.current
				if (!row) return

				const rect = row.getBoundingClientRect()
				const y = e.clientY - rect.top
				const height = rect.height

				let position: 'before' | 'after' | 'inside'
				if (hasChildren) {
					// For containers, divide into 3 zones
					if (y < height * 0.25) {
						position = 'before'
					} else if (y > height * 0.75) {
						position = 'after'
					} else {
						position = 'inside'
					}
				} else {
					// For regular items, divide into 2 zones
					if (y < height * 0.5) {
						position = 'before'
					} else {
						position = 'after'
					}
				}

				e.dataTransfer.dropEffect = 'move'
				onItemDragOver(e, position)
			},
			[hasChildren, onItemDragOver]
		)

		const handleDragLeave = React.useCallback(
			(e: React.DragEvent) => {
				e.stopPropagation()
				onItemDragLeave?.(e)
			},
			[onItemDragLeave]
		)

		const handleDrop = React.useCallback(
			(e: React.DragEvent) => {
				e.preventDefault()
				e.stopPropagation()
				if (!onItemDrop) return

				// Calculate final drop position
				const row = rowRef.current
				if (!row) return

				const rect = row.getBoundingClientRect()
				const y = e.clientY - rect.top
				const height = rect.height

				let position: 'before' | 'after' | 'inside'
				if (hasChildren) {
					if (y < height * 0.25) {
						position = 'before'
					} else if (y > height * 0.75) {
						position = 'after'
					} else {
						position = 'inside'
					}
				} else {
					if (y < height * 0.5) {
						position = 'before'
					} else {
						position = 'after'
					}
				}

				onItemDrop(e, position)
			},
			[hasChildren, onItemDrop]
		)

		const handleDragEnd = React.useCallback(
			(e: React.DragEvent) => {
				onItemDragEnd?.(e)
			},
			[onItemDragEnd]
		)

		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-tree-item',
					selected && 'selected',
					dragging && 'dragging',
					dropTarget && 'drop-target',
					dropPosition && `drop-${dropPosition}`,
					className
				)}
				role="treeitem"
				aria-expanded={hasChildren ? expanded : undefined}
				aria-selected={selected}
				data-tree-item-id={id}
				{...props}
			>
				<div
					ref={rowRef}
					className="c-tree-item-row c-hbox"
					style={{ paddingLeft: depth * INDENT_SIZE }}
					onClick={handleClick}
					draggable={isDraggable}
					onDragStart={handleDragStart}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					onDragEnd={handleDragEnd}
				>
					{/* Expand/collapse toggle */}
					<span
						className="c-tree-item-toggle"
						onClick={handleToggleClick}
						style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
					>
						{expanded ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
					</span>

					{/* Icon */}
					{icon && <span className="c-tree-item-icon">{icon}</span>}

					{/* Label */}
					<span className="c-tree-item-label flex-fill">{label}</span>

					{/* Actions */}
					{actions && (
						<span
							className="c-tree-item-actions c-hbox"
							onClick={(e) => e.stopPropagation()}
						>
							{actions}
						</span>
					)}
				</div>

				{/* Child items */}
				{expanded && children && (
					<div className="c-tree-item-children" role="group">
						{children}
					</div>
				)}
			</div>
		)
	}
)

// vim: ts=4

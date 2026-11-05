// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { useDraggable, useDroppable } from '@dnd-kit/core'
import * as React from 'react'

import { useLibTranslation } from '../../i18n.js'
import { IcDisclosure } from '../../icons.js'
import { useMergedRefs } from '../hooks.js'
import { createComponent, mergeClasses } from '../utils.js'
import { TreeDndContext, TreeFocusContext, type TreeMoveData } from './TreeView.js'

/** True below the item being dragged under `onMove`: it cannot drop into itself */
const InsideActiveContext = React.createContext(false)

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
	/** Allow drop-inside zone even without children (for items that can become containers) */
	allowDropInside?: boolean
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
	/** HTML5 drag-drop (the `onItem*` callbacks); under TreeView `onMove`, `false` opts out */
	isDraggable?: boolean
	/** Under TreeView `onMove`, `false` takes the item out of the drop targets */
	isDroppable?: boolean
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

const INTERACTIVE = 'input, textarea, select, button, a[href], [contenteditable="true"]'

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
			allowDropInside = hasChildren,
			icon,
			label,
			actions,
			dragging = false,
			dropTarget = false,
			dropPosition = null,
			onToggle,
			onSelect,
			isDraggable,
			isDroppable = true,
			dragData,
			onItemDragStart,
			onItemDragOver,
			onItemDragLeave,
			onItemDrop,
			onItemDragEnd,
			onKeyDown,
			children,
			...props
		},
		ref
	) => {
		const { t } = useLibTranslation()
		const rowRef = React.useRef<HTMLDivElement>(null)
		const dnd = React.useContext(TreeDndContext)
		const focus = React.useContext(TreeFocusContext)
		const release = focus?.release
		React.useEffect(() => () => release?.(id), [release, id])
		const insideActive = React.useContext(InsideActiveContext)
		const html5Drag = !dnd && !!isDraggable
		const isActive = dnd?.activeId === id
		const moveData: TreeMoveData = {
			label:
				typeof label === 'string'
					? label
					: ((props['aria-label'] as string | undefined) ?? id),
			node: label,
			allowDropInside
		}
		const canDrag = !!dnd && isDraggable !== false
		const {
			attributes,
			listeners,
			setNodeRef: setDragRef,
			setActivatorNodeRef
		} = useDraggable({ id, data: moveData, disabled: !canDrag })
		// The outer treeitem is the keyboard activator: it holds the roving focus
		const outerRef = useMergedRefs(ref, setActivatorNodeRef)
		const { setNodeRef: setDropRef } = useDroppable({
			id,
			data: moveData,
			disabled: !dnd || !isDroppable || insideActive || isActive
		})
		const setRowRef = React.useCallback(
			(el: HTMLDivElement | null) => {
				rowRef.current = el
				setDragRef(el)
				setDropRef(el)
			},
			[setDragRef, setDropRef]
		)
		// Only the drag instructions (`aria-describedby`) go on the treeitem: its role and
		// "tree item" announcement stay, and the roving tabIndex replaces dnd-kit's
		const {
			role: _role,
			'aria-pressed': _pressed,
			'aria-roledescription': _roleDesc,
			'aria-disabled': _disabled,
			tabIndex: _tabIndex,
			...dragAttributes
		} = attributes
		// Controls inside the row keep their own pointer and keyboard input: typing a
		// space or selecting text in an input must not pick the row up
		const dragListeners = React.useMemo(
			() =>
				listeners &&
				Object.fromEntries(
					Object.entries(listeners).map(([name, handler]) => [
						name,
						(e: React.SyntheticEvent) => {
							const hit = (e.target as Element).closest?.(INTERACTIVE)
							if (hit && e.currentTarget.contains(hit)) return
							handler(e)
						}
					])
				),
			[listeners]
		)
		// Pointer drags start on the row; the keyboard pick-up runs on the treeitem itself
		// (not when a key bubbles up from a control or a child item)
		const { onKeyDown: dragKeyDown, ...pointerListeners } = dragListeners ?? {}
		const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
			onKeyDown?.(e)
			if (!e.defaultPrevented && e.target === e.currentTarget) dragKeyDown?.(e)
		}
		const dropAt = dropPosition ?? (dnd && dnd.overId === id ? dnd.position : null)

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
				// Keep arrow keys working after a mouse toggle
				;(e.currentTarget as HTMLElement).closest<HTMLElement>('[role="treeitem"]')?.focus()
			},
			[onToggle]
		)

		// Drag handlers
		const handleDragStart = React.useCallback(
			(e: React.DragEvent) => {
				if (!html5Drag || !dragData) return
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
				if (allowDropInside) {
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
			[allowDropInside, onItemDragOver]
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
				if (allowDropInside) {
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
			[allowDropInside, onItemDrop]
		)

		const handleDragEnd = React.useCallback(
			(e: React.DragEvent) => {
				onItemDragEnd?.(e)
			},
			[onItemDragEnd]
		)

		return (
			<div
				ref={outerRef}
				className={mergeClasses(
					'c-tree-item',
					selected && 'selected',
					(dragging || isActive) && 'dragging',
					dropTarget && 'drop-target',
					dropAt && `drop-${dropAt}`,
					className
				)}
				role="treeitem"
				aria-level={depth + 1}
				aria-expanded={hasChildren ? expanded : undefined}
				aria-selected={selected}
				data-tree-item-id={id}
				{...(canDrag ? dragAttributes : undefined)}
				tabIndex={focus ? (focus.focusedId === id ? 0 : -1) : undefined}
				onKeyDown={handleKeyDown}
				{...props}
			>
				<div
					ref={setRowRef}
					className="c-tree-item-row c-hbox"
					// A host tree can set both from CSS. Inline, so it beats any `padding` rule.
					style={{
						paddingLeft: `calc(var(--c-tree-indent-base, 0px) + ${depth} * var(--c-tree-indent, 16px))`
					}}
					onClick={handleClick}
					{...(dnd
						? pointerListeners
						: {
								draggable: html5Drag,
								onDragStart: handleDragStart,
								onDragOver: handleDragOver,
								onDragLeave: handleDragLeave,
								onDrop: handleDrop,
								onDragEnd: handleDragEnd
							})}
				>
					{/* Expand/collapse toggle */}
					{/* Out of the Tab order: ←/→ on the item reach it */}
					<button
						type="button"
						tabIndex={-1}
						className="c-tree-item-toggle"
						aria-label={expanded ? t('Collapse') : t('Expand')}
						onClick={handleToggleClick}
						style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
					>
						<IcDisclosure
							size={14}
							style={expanded ? { transform: 'rotate(90deg)' } : undefined}
						/>
					</button>

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
						<InsideActiveContext.Provider value={insideActive || isActive}>
							{children}
						</InsideActiveContext.Provider>
					</div>
				)}
			</div>
		)
	}
)

// vim: ts=4

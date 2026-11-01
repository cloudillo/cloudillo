// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	type Active,
	type Announcements,
	type CollisionDetection,
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragMoveEvent,
	DragOverlay,
	type Over,
	pointerWithin
} from '@dnd-kit/core'
import * as React from 'react'

import { useLibTranslation } from '../../i18n.js'
import { useDragSensors } from '../SortableList/SortableList.js'
import { createComponent, mergeClasses } from '../utils.js'
import { treeKeyAction } from './keyboard.js'

export type TreeDropPosition = 'before' | 'after' | 'inside'

/** Drag data a TreeItem registers under `onMove` */
export interface TreeMoveData {
	label: string
	node: React.ReactNode
	allowDropInside: boolean
}

export interface TreeDndState {
	activeId: string | null
	overId: string | null
	position: TreeDropPosition | null
}

/** Present only inside a `TreeView` with `onMove` */
export const TreeDndContext = React.createContext<TreeDndState | null>(null)

/** Roving focus: the item holding the tree's one tab stop (`null` = the tree itself) */
export interface TreeFocusState {
	focusedId: string | null
	/** An unmounting item gives the tab stop back to the tree */
	release: (id: string) => void
}

export const TreeFocusContext = React.createContext<TreeFocusState | null>(null)

const ITEM = '[role="treeitem"]'

export interface TreeViewProps extends React.HTMLAttributes<HTMLDivElement> {
	/**
	 * Enables pointer/keyboard drag of every TreeItem (opt one out with `isDraggable={false}`).
	 * Called on drop with the dragged item, the item it landed on and where relative to it.
	 */
	onMove?: (id: string, targetId: string, position: TreeDropPosition) => void
	children?: React.ReactNode
}

const collisionDetection: CollisionDetection = (args) => {
	const hits = pointerWithin(args)
	return hits.length ? hits : closestCenter(args)
}

function dropPosition(active: Active, over: Over | null): TreeDropPosition | null {
	const dragged = active.rect.current.translated
	if (!over || over.id === active.id || !dragged) return null
	const y = dragged.top + dragged.height / 2 - over.rect.top
	const h = over.rect.height
	if ((over.data.current as TreeMoveData | undefined)?.allowDropInside) {
		return y < h * 0.25 ? 'before' : y > h * 0.75 ? 'after' : 'inside'
	}
	return y < h / 2 ? 'before' : 'after'
}

const IDLE: TreeDndState = { activeId: null, overId: null, position: null }

function TreeDnd({
	onMove,
	activeRef,
	children
}: {
	onMove: NonNullable<TreeViewProps['onMove']>
	/** Mirrors `activeId` for TreeView's key handler, which sits outside the provider */
	activeRef: React.MutableRefObject<string | null>
	children: React.ReactNode
}) {
	const { t } = useLibTranslation()
	const sensors = useDragSensors()
	const [state, setState] = React.useState(IDLE)
	const [overlay, setOverlay] = React.useState<React.ReactNode>(null)
	const stateRef = React.useRef(state)
	stateRef.current = state
	activeRef.current = state.activeId

	const announcements = React.useMemo<Announcements>(() => {
		const name = (x: Active | Over | null) =>
			(x?.data.current as TreeMoveData | undefined)?.label
		const sentence = (active: Active, over: Over | null) => {
			const { position } = stateRef.current
			if (!over || !position) return undefined
			const vars = { name: name(active), target: name(over) }
			if (position === 'inside') return t('{{name}} inside {{target}}', vars)
			if (position === 'before') return t('{{name}} before {{target}}', vars)
			return t('{{name}} after {{target}}', vars)
		}
		return {
			onDragStart: ({ active }) => t('Picked up {{name}}', { name: name(active) }),
			onDragOver: ({ active, over }) => sentence(active, over),
			onDragEnd: ({ active, over }) => {
				const where = sentence(active, over)
				return where
					? t('Dropped: {{where}}', { where })
					: t('Cancelled, {{name}} not moved', { name: name(active) })
			},
			onDragCancel: ({ active }) => t('Cancelled, {{name}} not moved', { name: name(active) })
		}
	}, [t])

	function track({ active, over }: DragMoveEvent) {
		const position = dropPosition(active, over)
		const overId = position && over ? String(over.id) : null
		const prev = stateRef.current
		if (prev.overId !== overId || prev.position !== position) {
			setState({ activeId: String(active.id), overId, position })
		}
	}

	function end({ active, over }: DragEndEvent) {
		const position = dropPosition(active, over)
		setState(IDLE)
		setOverlay(null)
		if (over && position) onMove(String(active.id), String(over.id), position)
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={collisionDetection}
			accessibility={{ announcements }}
			onDragStart={({ active }) => {
				setState({ ...IDLE, activeId: String(active.id) })
				setOverlay((active.data.current as TreeMoveData | undefined)?.node)
			}}
			onDragMove={track}
			onDragOver={track}
			onDragEnd={end}
			onDragCancel={() => {
				setState(IDLE)
				setOverlay(null)
			}}
		>
			<TreeDndContext.Provider value={state}>{children}</TreeDndContext.Provider>
			<DragOverlay dropAnimation={null}>
				{overlay ? (
					<div className="c-tree-item-row c-hbox c-tree-drag-overlay">{overlay}</div>
				) : null}
			</DragOverlay>
		</DndContext>
	)
}

export const TreeView = createComponent<HTMLDivElement, TreeViewProps>(
	'TreeView',
	({ className, onMove, onKeyDown, onFocus, children, ...props }, ref) => {
		const [focusedId, setFocusedId] = React.useState<string | null>(null)
		const release = React.useCallback((id: string) => {
			setFocusedId((cur) => (cur === id ? null : cur))
		}, [])
		const focus = React.useMemo(() => ({ focusedId, release }), [focusedId, release])
		const dragActive = React.useRef<string | null>(null)

		function handleFocus(e: React.FocusEvent<HTMLDivElement>) {
			onFocus?.(e)
			const tree = e.currentTarget
			if (e.target === tree) {
				// Tabbed onto the tree itself: hand focus to the selected item, else the first
				const item =
					tree.querySelector<HTMLElement>(`${ITEM}[aria-selected="true"]`) ??
					tree.querySelector<HTMLElement>(ITEM)
				item?.focus()
				return
			}
			const id = (e.target as Element).closest(ITEM)?.getAttribute('data-tree-item-id')
			if (id != null) setFocusedId(id)
		}

		function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
			onKeyDown?.(e)
			// dnd-kit's KeyboardSensor owns the keys while it drags; inputs and buttons
			// inside a row keep theirs
			if (e.defaultPrevented || dragActive.current || e.altKey || e.ctrlKey || e.metaKey)
				return
			const target = e.target as HTMLElement
			if (target.getAttribute('role') !== 'treeitem') return
			const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(ITEM))
			const action = treeKeyAction(
				e.key,
				els.map((el) => ({
					level: Number(el.getAttribute('aria-level')) || 1,
					expanded: el.getAttribute('aria-expanded') === 'true',
					hasChildren: el.hasAttribute('aria-expanded')
				})),
				els.indexOf(target),
				{ draggable: !!onMove }
			)
			if (!action) return
			e.preventDefault()
			// The row is the item's first child; clicking it or its toggle runs the
			// item's own onSelect / onToggle
			const row = target.firstElementChild as HTMLElement | null
			if ('focus' in action) els[action.focus]?.focus()
			else if ('toggle' in action)
				row?.querySelector<HTMLElement>('.c-tree-item-toggle')?.click()
			else row?.click()
		}

		const tree = (
			<div
				ref={ref}
				className={mergeClasses('c-tree-view c-vbox', className)}
				role="tree"
				tabIndex={focusedId === null ? 0 : -1}
				onFocus={handleFocus}
				onKeyDown={handleKeyDown}
				{...props}
			>
				{children}
			</div>
		)
		return (
			<TreeFocusContext.Provider value={focus}>
				{onMove ? (
					<TreeDnd onMove={onMove} activeRef={dragActive}>
						{tree}
					</TreeDnd>
				) : (
					tree
				)}
			</TreeFocusContext.Provider>
		)
	}
)

// vim: ts=4

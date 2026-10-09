// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	type Announcements,
	closestCenter,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors
} from '@dnd-kit/core'
import {
	horizontalListSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { LuArrowDown, LuArrowUp, LuArrowUpToLine, LuGripVertical } from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { Button } from '../Button/index.js'
import { Menu, MenuItem } from '../Menu/index.js'
import { mergeClasses } from '../utils.js'

/** Space picks up; Enter is left to the handle so it opens the Move menu. */
const KEYBOARD_CODES = { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] }

/** Pointer + keyboard sensors shared by SortableList and TreeView `onMove`. */
export function useDragSensors(sortable = false) {
	return useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			keyboardCodes: KEYBOARD_CODES,
			...(sortable ? { coordinateGetter: sortableKeyboardCoordinates } : {})
		})
	)
}

interface ItemData {
	group: string
	index: number
	label: string
}

interface ListEntry {
	count: number
	keys: string[]
	horizontal: boolean
	/** `false`: a source-only list — it never accepts a drop */
	sortable: boolean
	onReorder: SortableListProps<unknown>['onReorder']
	/** The drag overlay's copy of the item at `index` */
	render: (index: number) => React.ReactNode
}

interface GroupContextValue {
	register: (group: string, entry: ListEntry) => () => void
}

const GroupContext = React.createContext<GroupContextValue | null>(null)

function useAnnouncements(lists: React.RefObject<Map<string, ListEntry>>) {
	const { t } = useLibTranslation()
	return React.useMemo<Announcements>(() => {
		const describe = (over?: Partial<ItemData>) => {
			const index = over?.index ?? 0
			const total = (over?.group && lists.current.get(over.group)?.count) || 0
			return t('position {{pos}} of {{total}}', {
				pos: index + 1,
				total: Math.max(total, index + 1)
			})
		}
		return {
			onDragStart: ({ active }) => {
				const data = active.data.current as ItemData | undefined
				return t('Picked up {{name}}, {{where}}', {
					name: data?.label,
					where: describe(data)
				})
			},
			onDragOver: ({ over }) =>
				over
					? t('Moved to {{where}}', { where: describe(over.data.current as ItemData) })
					: undefined,
			onDragEnd: ({ active, over }) =>
				over
					? t('Dropped {{name}} at {{where}}', {
							name: (active.data.current as ItemData | undefined)?.label,
							where: describe(over.data.current as ItemData)
						})
					: undefined,
			onDragCancel: ({ active }) =>
				t('Cancelled, {{name}} returned', {
					name: (active.data.current as ItemData | undefined)?.label
				})
		}
	}, [t, lists])
}

/** One DndContext for every SortableList beneath it, so lists sharing it trade items. */
function DndRoot({
	lists,
	children
}: {
	lists: React.RefObject<Map<string, ListEntry>>
	children: React.ReactNode
}) {
	const sensors = useDragSensors(true)
	const announcements = useAnnouncements(lists)
	const [dragged, setDragged] = React.useState<ItemData | null>(null)

	function onDragStart({ active }: DragStartEvent) {
		setDragged((active.data.current as ItemData | undefined) ?? null)
	}

	function onDragEnd({ active, over }: DragEndEvent) {
		setDragged(null)
		const from = active.data.current as ItemData | undefined
		const to = over?.data.current as Partial<ItemData> | undefined
		if (!from || !to?.group) return
		const target = lists.current.get(to.group)
		if (!target?.sortable) return
		const key = lists.current.get(from.group)?.keys[from.index]
		if (from.group === to.group) {
			if (to.index !== undefined && to.index !== from.index)
				target.onReorder(from.index, to.index)
		} else if (to.index === undefined) {
			target.onReorder(from.index, target.count, from.group, key)
		} else {
			// Into another list: land after the item when released past its centre
			const rect = active.rect.current.translated
			const after =
				!!rect &&
				!!over &&
				(target.horizontal
					? rect.left + rect.width / 2 > over.rect.left + over.rect.width / 2
					: rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2)
			target.onReorder(from.index, to.index + (after ? 1 : 0), from.group, key)
		}
	}

	// Portalled, so an item can leave a clipped or scrolling container (e.g. a popup)
	const overlay = dragged && lists.current.get(dragged.group)?.render(dragged.index)

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			accessibility={{ announcements }}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onDragCancel={() => setDragged(null)}
		>
			{children}
			{typeof document !== 'undefined' &&
				createPortal(
					<DragOverlay>
						{overlay ? (
							<div className="c-sortable-item dragging overlay">{overlay}</div>
						) : null}
					</DragOverlay>,
					document.body
				)}
		</DndContext>
	)
}

function useListRegistry() {
	const lists = React.useRef(new Map<string, ListEntry>())
	const register = React.useCallback((group: string, entry: ListEntry) => {
		lists.current.set(group, entry)
		return () => {
			if (lists.current.get(group) === entry) lists.current.delete(group)
		}
	}, [])
	return { lists, register }
}

export interface SortableGroupProps {
	children: React.ReactNode
}

/** Links the `SortableList`s beneath it (each with its own `group`) for cross-list moves. */
export function SortableGroup({ children }: SortableGroupProps) {
	const { lists, register } = useListRegistry()
	const ctx = React.useMemo(() => ({ register }), [register])
	return (
		<GroupContext.Provider value={ctx}>
			<DndRoot lists={lists}>{children}</DndRoot>
		</GroupContext.Provider>
	)
}

export interface SortableItemState {
	index: number
	dragging: boolean
	/** Drag handle + Move menu; place it in the rendered item (absent with `handle={false}`) */
	handle: React.ReactNode
}

export interface SortableListProps<T> {
	items: T[]
	getKey: (item: T) => string
	/**
	 * `to` is the item's index after the move. Within one list that is `arrayMove` semantics;
	 * for a cross-list move this is called on the destination list with the source `group`,
	 * `from` indexes the source list and `key` is the moved item's source key.
	 */
	onReorder: (from: number, to: number, group?: string, key?: string) => void
	renderItem: (item: T, state: SortableItemState) => React.ReactNode
	/** Name used in announcements and the handle's label */
	getLabel?: (item: T) => string
	/**
	 * `false`: the whole item drags by pointer and no Move menu is rendered — the consumer
	 * must offer the keyboard route (WCAG 2.5.7) some other way, e.g. a context menu.
	 */
	handle?: boolean
	/** List id inside a `SortableGroup`; lists in the same group trade items */
	group?: string
	orientation?: 'vertical' | 'horizontal'
	/** `false`: a source-only list — items drag out into another list, never reorder or accept drops */
	sortable?: boolean
	className?: string
}

/** Sortable list — pointer/keyboard drag plus a Move menu on the handle (WCAG 2.5.7). */
export function SortableList<T>(props: SortableListProps<T>) {
	const groupCtx = React.useContext(GroupContext)
	const own = useListRegistry()
	if (groupCtx) return <ListBody {...props} register={groupCtx.register} />
	return (
		<DndRoot lists={own.lists}>
			<ListBody {...props} register={own.register} />
		</DndRoot>
	)
}

const DEFAULT_GROUP = 'default'

function ListBody<T>({
	items,
	getKey,
	onReorder,
	renderItem,
	getLabel,
	handle = true,
	group = DEFAULT_GROUP,
	orientation = 'vertical',
	sortable = true,
	className,
	register
}: SortableListProps<T> & { register: GroupContextValue['register'] }) {
	const { t } = useLibTranslation()
	const [status, setStatus] = React.useState('')
	const keys = items.map(getKey)
	const horizontal = orientation === 'horizontal'
	// Only an empty list needs its own drop target; otherwise the items are the targets
	const { setNodeRef } = useDroppable({
		id: `group:${group}`,
		data: { group },
		disabled: items.length > 0 || !sortable
	})

	const entry = React.useMemo<ListEntry>(
		() => ({
			count: items.length,
			keys: items.map(getKey),
			horizontal,
			sortable,
			onReorder,
			render: (index) =>
				items[index] === undefined
					? null
					: renderItem(items[index], { index, dragging: true, handle: null })
		}),
		[items, getKey, horizontal, sortable, onReorder, renderItem]
	)
	React.useLayoutEffect(() => register(group, entry), [register, group, entry])

	const move = (item: T, from: number, to: number) => {
		onReorder(from, to)
		setStatus(
			t('{{name}} moved to position {{pos}} of {{total}}', {
				name: getLabel?.(item) ?? t('Item'),
				pos: to + 1,
				total: items.length
			})
		)
	}

	return (
		<SortableContext
			id={group}
			items={keys}
			strategy={horizontal ? horizontalListSortingStrategy : verticalListSortingStrategy}
		>
			<div
				ref={setNodeRef}
				className={mergeClasses(
					'c-sortable-list',
					horizontal ? 'c-hbox' : 'c-vbox',
					className
				)}
			>
				{items.map((item, index) => (
					<SortableItem
						key={keys[index]}
						id={keys[index]}
						data={{ group, index, label: getLabel?.(item) ?? t('Item') }}
						handle={handle && sortable}
						droppable={sortable}
						last={index === items.length - 1}
						onMove={(to) => move(item, index, to)}
					>
						{(state) => renderItem(item, state)}
					</SortableItem>
				))}
				<span className="sr-only" role="status" aria-live="polite">
					{status}
				</span>
			</div>
		</SortableContext>
	)
}

function SortableItem({
	id,
	data,
	handle,
	droppable,
	last,
	onMove,
	children
}: {
	id: string
	data: ItemData
	handle: boolean
	droppable: boolean
	last: boolean
	onMove: (to: number) => void
	children: (state: SortableItemState) => React.ReactNode
}) {
	const { t } = useLibTranslation()
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id,
		data,
		disabled: { draggable: false, droppable: !droppable }
	})
	// `role` and `aria-pressed` are dropped: the handle is a real button, the item is not one
	const { role: _role, 'aria-pressed': _pressed, ...dragAttributes } = attributes
	const first = data.index === 0

	const handleNode = handle ? (
		<Menu
			trigger={
				<Button
					variant="ghost"
					size="sm"
					className="c-sortable-handle"
					icon={<LuGripVertical />}
					aria-label={t('Move {{name}}', { name: data.label })}
					{...dragAttributes}
					{...listeners}
				/>
			}
		>
			<MenuItem
				icon={<LuArrowUp />}
				label={t('Move up')}
				disabled={first}
				onClick={() => onMove(data.index - 1)}
			/>
			<MenuItem
				icon={<LuArrowDown />}
				label={t('Move down')}
				disabled={last}
				onClick={() => onMove(data.index + 1)}
			/>
			<MenuItem
				icon={<LuArrowUpToLine />}
				label={t('Move to top')}
				disabled={first}
				onClick={() => onMove(0)}
			/>
		</Menu>
	) : null

	return (
		<div
			ref={setNodeRef}
			className={mergeClasses('c-sortable-item', isDragging && 'dragging')}
			style={{ transform: CSS.Translate.toString(transform), transition }}
			// Handle-less: pointer only, so the item's own focusable content keeps its keys
			onPointerDown={
				handle
					? undefined
					: (listeners?.onPointerDown as
							| React.PointerEventHandler<HTMLDivElement>
							| undefined)
			}
		>
			{children({ index: data.index, dragging: isDragging, handle: handleNode })}
		</div>
	)
}

// vim: ts=4

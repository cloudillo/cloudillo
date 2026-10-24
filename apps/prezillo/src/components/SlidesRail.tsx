// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Left slides rail: a vertical list of live slide thumbnails. Only thumbnails within one
 * screen of the rail's view render their objects; the rest draw just the background.
 *
 * One Tab stop (roving tabindex): ↑/↓/Home/End move focus and switch slide. Editors also get
 * drag reorder, a context menu (right click, Shift+F10 / Menu key, "⋯"), Alt+↑/↓ to move,
 * Delete and Ctrl+D, and a "+ New slide" tile.
 */

import { Button, IcAdd, SortableList, useNearSet } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { ViewId, ViewNode, YPrezilloDocument } from '../crdt'
import { toInsertIndex } from '../crdt/view-ops'
import type { TemplateWithUsage } from '../hooks/useTemplates'
import { SlideMenu, type SlideMenuCmds, thumbIn, useSlideMenu } from './SlideMenu'
import { SlideThumbnail, type ViewOccupants } from './SlideThumbnail'

export interface SlidesRailProps extends SlideMenuCmds {
	/** DOM id (the toggle's `aria-controls`) */
	id?: string
	doc: YPrezilloDocument
	views: ViewNode[]
	/** Highlighted slide; null while a template is selected */
	activeViewId: ViewId | null
	templates: TemplateWithUsage[]
	ownerTag?: string
	token?: string
	onSelect: (id: ViewId) => void
	/** Navigation only: no drag, menu, editing keys or "+ New slide" tile */
	readOnly?: boolean
	/** Collaborators per slide (built in `app.tsx` from `useDocPresence`) */
	viewOccupants?: ReadonlyMap<ViewId, ViewOccupants>
}

export type SlideKeyAction =
	| { type: 'move'; to: number }
	| { type: 'duplicate' }
	| { type: 'delete' }
	| { type: 'go'; index: number }

/** Rail key → action on slide `index` of `count`; the menu key is handled separately */
export function slideKeyAction(
	e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean },
	index: number,
	count: number,
	editable: boolean
): SlideKeyAction | undefined {
	const mod = e.ctrlKey || e.metaKey
	const plain = !mod && !e.altKey && !e.shiftKey
	const key = e.key

	if (editable && e.altKey && !mod && !e.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown'))
		return { type: 'move', to: index + (key === 'ArrowUp' ? -1 : 1) }
	if (editable && mod && !e.altKey && !e.shiftKey && key.toLowerCase() === 'd')
		return { type: 'duplicate' }
	if (editable && plain && key === 'Delete') return { type: 'delete' }
	if (plain && key === 'ArrowUp') return { type: 'go', index: index - 1 }
	if (plain && key === 'ArrowDown') return { type: 'go', index: index + 1 }
	if (plain && key === 'Home') return { type: 'go', index: 0 }
	if (plain && key === 'End') return { type: 'go', index: count - 1 }
}

/** Slide to focus after deleting `viewId` (at `index`): its neighbour if it was the active one */
export function deleteFocusTarget(
	views: ViewNode[],
	index: number,
	viewId: ViewId,
	activeViewId: ViewId | null
): ViewId | null {
	if (viewId !== activeViewId && activeViewId) return activeViewId
	return (views[index - 1] ?? views[index + 1])?.id ?? null
}

export function SlidesRail({
	id,
	doc,
	views,
	activeViewId,
	templates,
	ownerTag,
	token,
	onSelect,
	readOnly,
	onMoveView,
	onAddAfter,
	onDuplicate,
	onDelete,
	onToggleSkip,
	viewOccupants
}: SlidesRailProps) {
	const { t } = useTranslation()
	const railRef = React.useRef<HTMLElement>(null)
	const slideMenu = useSlideMenu(railRef, readOnly)
	// Slide to focus once it is rendered (after delete / move / duplicate re-renders the list)
	const pendingFocusRef = React.useRef<ViewId | null>(null)
	const editable = !readOnly
	const viewKey = views.map((v) => v.id).join(',')

	// View ids of thumbnails within one screen of the rail's view
	const near = useNearSet(railRef, '.c-slide-thumb[data-view-id]', 'viewId', [viewKey, editable])

	React.useEffect(() => {
		railRef.current
			?.querySelector('[aria-current="true"]')
			?.scrollIntoView({ block: 'nearest' })
	}, [activeViewId])

	const thumbEl = (viewId: ViewId) => thumbIn(railRef.current, viewId)

	// Set only by key and menu handlers, never from an `activeViewId` change (following a
	// presenter must not steal focus)
	React.useLayoutEffect(() => {
		const pending = pendingFocusRef.current
		if (!pending) return
		const el = thumbEl(pending)
		if (el) {
			pendingFocusRef.current = null
			el.focus()
		}
	})

	const focusId = views.some((v) => v.id === activeViewId) ? activeViewId : views[0]?.id
	const last = views.at(-1)

	function go(index: number) {
		const view = views[index]
		if (!view) return
		onSelect(view.id)
		thumbEl(view.id)?.focus()
	}

	function moveTo(viewId: ViewId, insertIndex: number) {
		pendingFocusRef.current = viewId
		onMoveView?.(viewId, insertIndex)
	}

	/** `to` is the final index */
	function move(viewId: ViewId, from: number, to: number) {
		if (to < 0 || to >= views.length || to === from) return
		moveTo(viewId, toInsertIndex(from, to))
	}

	const focusNew = (cmd?: (viewId: ViewId) => ViewId | undefined) => (viewId: ViewId) => {
		const newId = cmd?.(viewId)
		if (newId) pendingFocusRef.current = newId
		return newId
	}
	const addAfter = focusNew(onAddAfter)
	const duplicate = focusNew(onDuplicate)

	// The last slide is refused by `onDelete` (`handleDeleteView`)
	async function remove(viewId: ViewId, index: number) {
		// Set only once deleted: during the confirm, focus stays in the dialog
		const target = deleteFocusTarget(views, index, viewId, activeViewId)
		const deleted = (await onDelete?.(viewId)) ?? false
		if (deleted) pendingFocusRef.current = target
		return deleted
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
		const view = views[index]
		if (slideMenu.onMenuKey(e, view.id)) return
		const action = slideKeyAction(e, index, views.length, editable)
		if (!action) return
		// Also for Ctrl+D: the browser would bookmark the page
		e.preventDefault()
		if (action.type === 'move') move(view.id, index, action.to)
		else if (action.type === 'duplicate') duplicate(view.id)
		else if (action.type === 'delete') remove(view.id, index)
		else go(action.index)
	}

	const thumb = (view: ViewNode, index: number) => (
		<SlideThumbnail
			key={view.id}
			view={view}
			index={index}
			doc={doc}
			templates={templates}
			active={view.id === activeViewId}
			near={near.has(view.id)}
			ownerTag={ownerTag}
			token={token}
			onSelect={onSelect}
			tabIndex={view.id === focusId ? 0 : -1}
			onKeyDown={(e) => handleKeyDown(e, index)}
			onContextMenu={editable ? (e) => slideMenu.onContextMenu(e, view.id) : undefined}
			onMore={editable ? (anchor) => slideMenu.open(view.id, anchor) : undefined}
			occupants={viewOccupants?.get(view.id)}
		/>
	)

	return (
		<nav id={id} ref={railRef} className="c-slides-rail" aria-label={t('Slides')}>
			{editable ? (
				<SortableList
					className="c-slides-rail__list"
					items={views}
					getKey={(v) => v.id}
					getLabel={(v) => t('Slide {{n}}', { n: views.indexOf(v) + 1 })}
					handle={false}
					onReorder={(from, to) => {
						const v = views[from]
						if (v) onMoveView?.(v.id, toInsertIndex(from, to))
					}}
					renderItem={(v, st) => thumb(v, st.index)}
				/>
			) : (
				views.map(thumb)
			)}
			{editable && last && (
				<Button
					variant="ghost"
					className="c-slide-thumb-add"
					icon={<IcAdd />}
					onClick={() => onAddAfter?.(last.id)}
				>
					{t('New slide')}
				</Button>
			)}
			{slideMenu.menu && (
				<SlideMenu
					menu={slideMenu.menu}
					views={views}
					onClose={slideMenu.close}
					onAddAfter={addAfter}
					onDuplicate={duplicate}
					onToggleSkip={onToggleSkip}
					onMoveView={moveTo}
					onDelete={(viewId) =>
						remove(
							viewId,
							views.findIndex((v) => v.id === viewId)
						)
					}
				/>
			)}
		</nav>
	)
}

// vim: ts=4

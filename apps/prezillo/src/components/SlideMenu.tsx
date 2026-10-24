// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	IcAdd,
	IcDelete,
	IcDuplicate,
	IcHide,
	IcMoveDown,
	IcMoveToTop,
	IcMoveUp,
	IcSendToBack,
	IcShow,
	isContextMenuKey,
	isKeyboardContextMenu,
	Menu,
	MenuItem
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { ViewId, ViewNode } from '../crdt'
import { toInsertIndex } from '../crdt/view-ops'

/** Slide editing callbacks shared by the rail, the slide menu and the mobile picker */
export interface SlideMenuCmds {
	/** `insertIndex` is insert-before (`reorderView` semantics) */
	onMoveView?: (viewId: ViewId, insertIndex: number) => void
	/** New slide after `viewId`; returns the new slide (focused) */
	onAddAfter?: (viewId: ViewId) => ViewId | undefined
	/** Returns the new slide (focused) */
	onDuplicate?: (viewId: ViewId) => ViewId | undefined
	/** Resolves false when nothing was deleted, e.g. the user cancelled */
	onDelete?: (viewId: ViewId) => Promise<boolean>
	/** Flips "skip in presentation" */
	onToggleSkip?: (viewId: ViewId) => void
}

export interface SlideMenuState {
	viewId: ViewId
	/** Right click */
	position?: { x: number; y: number }
	/** Keyboard or "⋯": the thumbnail is refocused on close */
	anchor?: HTMLElement
}

export const thumbIn = (root: HTMLElement | null | undefined, viewId: ViewId) =>
	root?.querySelector<HTMLElement>(`.c-slide-thumb[data-view-id="${CSS.escape(viewId)}"]`)

/** Right click opens at the pointer; keyboard-fired contextmenu (0,0) anchors to the thumbnail */
function contextMenuState(e: React.MouseEvent<HTMLElement>, viewId: ViewId): SlideMenuState {
	return isKeyboardContextMenu(e)
		? { viewId, anchor: e.currentTarget }
		: { viewId, position: { x: e.clientX, y: e.clientY } }
}

/**
 * Slide menu state and its open paths (key, right click, "⋯"). `close` refocuses the thumbnail
 * inside `containerRef` when the menu was opened from it.
 */
export function useSlideMenu(
	containerRef: React.RefObject<HTMLElement | null>,
	readOnly?: boolean
) {
	const [menu, setMenu] = React.useState<SlideMenuState>()
	return {
		menu,
		open: (viewId: ViewId, anchor?: HTMLElement) => setMenu({ viewId, anchor }),
		onContextMenu: (e: React.MouseEvent<HTMLElement>, viewId: ViewId) => {
			e.preventDefault()
			setMenu(contextMenuState(e, viewId))
		},
		/** Opens on Shift+F10 / Menu key; true when handled */
		onMenuKey: (e: React.KeyboardEvent<HTMLElement>, viewId: ViewId) => {
			if (readOnly || !isContextMenuKey(e)) return false
			e.preventDefault()
			setMenu({ viewId, anchor: e.currentTarget })
			return true
		},
		close: () => {
			if (menu?.anchor) thumbIn(containerRef.current, menu.viewId)?.focus()
			setMenu(undefined)
		}
	}
}

export interface SlideMenuProps extends SlideMenuCmds {
	menu: SlideMenuState
	/** Full slide order (indices, skipped state) */
	views: ViewNode[]
	onClose: () => void
}

/** The one slide context menu; every move goes through `toInsertIndex` */
export function SlideMenu({
	menu,
	views,
	onClose,
	onMoveView,
	onAddAfter,
	onDuplicate,
	onDelete,
	onToggleSkip
}: SlideMenuProps) {
	const { t } = useTranslation()
	const { viewId } = menu
	const index = views.findIndex((v) => v.id === viewId)
	if (index < 0) return null
	const lastIndex = views.length - 1
	const move = (to: number) => onMoveView?.(viewId, toInsertIndex(index, to))

	return (
		<Menu key={viewId} position={menu.position} anchor={menu.anchor} onClose={onClose}>
			<MenuItem
				icon={<IcAdd />}
				label={t('New slide after this')}
				onClick={() => onAddAfter?.(viewId)}
			/>
			<MenuItem
				icon={<IcDuplicate />}
				label={t('Duplicate')}
				onClick={() => onDuplicate?.(viewId)}
			/>
			{views[index].hidden ? (
				<MenuItem
					icon={<IcShow />}
					label={t('Show in presentation')}
					onClick={() => onToggleSkip?.(viewId)}
				/>
			) : (
				<MenuItem
					icon={<IcHide />}
					label={t('Skip in presentation')}
					onClick={() => onToggleSkip?.(viewId)}
				/>
			)}
			<MenuItem
				icon={<IcMoveUp />}
				label={t('Move up')}
				disabled={index === 0}
				onClick={() => move(index - 1)}
			/>
			<MenuItem
				icon={<IcMoveDown />}
				label={t('Move down')}
				disabled={index === lastIndex}
				onClick={() => move(index + 1)}
			/>
			<MenuItem
				icon={<IcMoveToTop />}
				label={t('Move to start')}
				disabled={index === 0}
				onClick={() => move(0)}
			/>
			<MenuItem
				icon={<IcSendToBack />}
				label={t('Move to end')}
				disabled={index === lastIndex}
				onClick={() => move(lastIndex)}
			/>
			<MenuItem
				icon={<IcDelete />}
				label={t('Delete')}
				color="error"
				disabled={views.length <= 1}
				description={
					views.length <= 1 ? t('A presentation needs at least one slide') : undefined
				}
				onClick={() => onDelete?.(viewId)}
			/>
		</Menu>
	)
}

// vim: ts=4

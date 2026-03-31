// This file is part of the Cloudillo Platform.
// Copyright (C) 2026  Szilárd Hajba
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

import { useEffect, useRef, useCallback } from 'react'

export interface BlockContextMenuOptions {
	enabled: boolean
	isReadOnly: boolean
	onCommentBlock: (blockId: string) => void
	onDeleteBlock?: (blockId: string) => void
}

/**
 * Provides a custom context menu (right-click on desktop, long-press on mobile)
 * on BlockNote blocks. Shows "Comment" for all comment-capable users,
 * plus "Delete" for write-access users.
 *
 * Uses event delegation on the scroll container — no DOM manipulation inside
 * the editor tree.
 */
function createMenuItem(label: string, onClick: () => void, danger?: boolean): HTMLButtonElement {
	const item = document.createElement('button')
	item.className = 'notillo-context-menu-item'
	if (danger) item.classList.add('notillo-context-menu-item--danger')
	item.textContent = label
	item.onclick = onClick
	return item
}

export function useBlockContextMenu({
	enabled,
	isReadOnly,
	onCommentBlock,
	onDeleteBlock
}: BlockContextMenuOptions) {
	const menuRef = useRef<HTMLDivElement | null>(null)
	const onCommentBlockRef = useRef(onCommentBlock)
	onCommentBlockRef.current = onCommentBlock
	const onDeleteBlockRef = useRef(onDeleteBlock)
	onDeleteBlockRef.current = onDeleteBlock
	const isReadOnlyRef = useRef(isReadOnly)
	isReadOnlyRef.current = isReadOnly
	const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const touchStartRef = useRef<{ x: number; y: number } | null>(null)

	const hideMenu = useCallback(() => {
		if (menuRef.current) {
			menuRef.current.style.display = 'none'
		}
	}, [])

	const showMenu = useCallback(
		(x: number, y: number, blockId: string) => {
			const menu = menuRef.current
			if (!menu) return

			// Remove old items
			while (menu.firstChild) {
				menu.removeChild(menu.firstChild)
			}

			// Comment item (always available when enabled)
			menu.appendChild(
				createMenuItem('💬 Comment', () => {
					onCommentBlockRef.current(blockId)
					hideMenu()
				})
			)

			// Write-only items
			if (!isReadOnlyRef.current && onDeleteBlockRef.current) {
				const deleteRef = onDeleteBlockRef.current
				menu.appendChild(
					createMenuItem(
						'🗑 Delete',
						() => {
							deleteRef(blockId)
							hideMenu()
						},
						true
					)
				)
			}

			// Position menu near click, clamped to viewport
			menu.style.display = 'flex'
			const menuRect = menu.getBoundingClientRect()
			const maxX = window.innerWidth - menuRect.width - 8
			const maxY = window.innerHeight - menuRect.height - 8
			menu.style.left = `${Math.max(8, Math.min(x, maxX))}px`
			menu.style.top = `${Math.max(8, Math.min(y, maxY))}px`
		},
		[hideMenu]
	)

	useEffect(() => {
		if (!enabled) return

		// Create menu element
		const menu = document.createElement('div')
		menu.className = 'notillo-block-context-menu'
		menu.style.display = 'none'
		document.body.appendChild(menu)
		menuRef.current = menu

		function findBlockId(target: HTMLElement): string | undefined {
			const blockOuter = target.closest('.bn-block-outer[data-id]') as HTMLElement | null
			return blockOuter?.dataset.id || undefined
		}

		// Right-click handler (desktop)
		function handleContextMenu(e: MouseEvent) {
			const target = e.target as HTMLElement
			// Only handle events inside the editor scroll area
			if (!target.closest('.c-fcd-content-scroll')) return
			const blockId = findBlockId(target)
			if (!blockId) return

			e.preventDefault()
			showMenu(e.clientX, e.clientY, blockId)
		}

		// Long-press handlers (mobile)
		function handleTouchStart(e: TouchEvent) {
			const target = e.target as HTMLElement
			if (!target.closest('.c-fcd-content-scroll')) return
			const blockId = findBlockId(target)
			if (!blockId) return

			const touch = e.touches[0]
			touchStartRef.current = { x: touch.clientX, y: touch.clientY }

			longPressTimerRef.current = setTimeout(() => {
				longPressTimerRef.current = null
				showMenu(touch.clientX, touch.clientY, blockId)
			}, 500)
		}

		function handleTouchMove(e: TouchEvent) {
			if (!longPressTimerRef.current || !touchStartRef.current) return
			const touch = e.touches[0]
			const dx = touch.clientX - touchStartRef.current.x
			const dy = touch.clientY - touchStartRef.current.y
			// Cancel if finger moved more than 10px
			if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
				clearTimeout(longPressTimerRef.current)
				longPressTimerRef.current = null
			}
		}

		function handleTouchEnd() {
			if (longPressTimerRef.current) {
				clearTimeout(longPressTimerRef.current)
				longPressTimerRef.current = null
			}
		}

		// Dismiss on click outside, Escape, or scroll
		function handleDismissClick(e: MouseEvent) {
			if (menu.style.display === 'none') return
			if (menu.contains(e.target as Node)) return
			menu.style.display = 'none'
		}

		function handleDismissTouch(e: TouchEvent) {
			if (menu.style.display === 'none') return
			if (menu.contains(e.target as Node)) return
			menu.style.display = 'none'
		}

		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				menu.style.display = 'none'
			}
		}

		function handleScroll() {
			menu.style.display = 'none'
		}

		document.addEventListener('contextmenu', handleContextMenu)
		document.addEventListener('touchstart', handleTouchStart, { passive: true })
		document.addEventListener('touchmove', handleTouchMove, { passive: true })
		document.addEventListener('touchend', handleTouchEnd, { passive: true })
		document.addEventListener('touchcancel', handleTouchEnd, { passive: true })
		document.addEventListener('mousedown', handleDismissClick, true)
		document.addEventListener('touchstart', handleDismissTouch, true)
		document.addEventListener('keydown', handleKeyDown)
		const scrollArea = document.querySelector('.c-fcd-content-scroll')
		scrollArea?.addEventListener('scroll', handleScroll, { passive: true })

		return () => {
			document.removeEventListener('contextmenu', handleContextMenu)
			document.removeEventListener('touchstart', handleTouchStart)
			document.removeEventListener('touchmove', handleTouchMove)
			document.removeEventListener('touchend', handleTouchEnd)
			document.removeEventListener('touchcancel', handleTouchEnd)
			document.removeEventListener('mousedown', handleDismissClick, true)
			document.removeEventListener('touchstart', handleDismissTouch, true)
			document.removeEventListener('keydown', handleKeyDown)
			scrollArea?.removeEventListener('scroll', handleScroll)
			if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
			menu.remove()
			menuRef.current = null
		}
	}, [enabled, showMenu])
}

// vim: ts=4

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
import { createPortal } from 'react-dom'
import { mergeClasses, createComponent } from '../utils.js'
import { useMergedRefs, useEscapeKey, useOutsideClick } from '../hooks.js'

export interface MenuPosition {
	x: number
	y: number
}

export interface MenuProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
	position: MenuPosition
	onClose: () => void
	children?: React.ReactNode
}

export const Menu = createComponent<HTMLDivElement, MenuProps>(
	'Menu',
	({ position, onClose, children, className, style, ...props }, ref) => {
		const menuRef = React.useRef<HTMLDivElement | null>(null)
		const [adjustedPosition, setAdjustedPosition] = React.useState(position)

		// Combine refs using shared hook
		const mergedRef = useMergedRefs(ref, menuRef)

		// Adjust position to keep menu within viewport
		React.useLayoutEffect(
			function adjustMenuPosition() {
				if (!menuRef.current) return

				const rect = menuRef.current.getBoundingClientRect()
				const viewportWidth = window.innerWidth
				const viewportHeight = window.innerHeight

				let { x, y } = position

				// Adjust horizontal position if menu overflows right edge
				if (x + rect.width > viewportWidth) {
					x = Math.max(0, viewportWidth - rect.width - 8)
				}

				// Adjust vertical position if menu overflows bottom edge
				if (y + rect.height > viewportHeight) {
					y = Math.max(0, viewportHeight - rect.height - 8)
				}

				setAdjustedPosition({ x, y })
			},
			[position]
		)

		// Close on outside click using shared hook
		useOutsideClick(menuRef, onClose)

		// Close on Escape using shared hook
		useEscapeKey(onClose)

		// Focus first menu item on mount
		React.useEffect(function focusFirstItem() {
			if (!menuRef.current) return
			const firstItem = menuRef.current.querySelector<HTMLButtonElement>(
				'.c-menu-item:not([disabled])'
			)
			firstItem?.focus()
		}, [])

		// Handle keyboard navigation
		function handleKeyDown(evt: React.KeyboardEvent) {
			if (!menuRef.current) return

			const items = Array.from(
				menuRef.current.querySelectorAll<HTMLButtonElement>('.c-menu-item:not([disabled])')
			)
			const currentIndex = items.findIndex((item) => item === document.activeElement)

			switch (evt.key) {
				case 'ArrowDown':
					evt.preventDefault()
					const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
					items[nextIndex]?.focus()
					break
				case 'ArrowUp':
					evt.preventDefault()
					const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
					items[prevIndex]?.focus()
					break
				case 'Home':
					evt.preventDefault()
					items[0]?.focus()
					break
				case 'End':
					evt.preventDefault()
					items[items.length - 1]?.focus()
					break
			}
		}

		const menuElement = (
			<div
				ref={mergedRef}
				className={mergeClasses('c-menu', className)}
				role="menu"
				onKeyDown={handleKeyDown}
				style={{
					...style,
					left: adjustedPosition.x,
					top: adjustedPosition.y
				}}
				{...props}
			>
				{children}
			</div>
		)

		// Render in portal to escape stacking context issues
		const portalContainer = document.getElementById('popper-container') || document.body
		return createPortal(menuElement, portalContainer)
	}
)

export interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	icon?: React.ReactNode
	label: string
	shortcut?: string
	danger?: boolean
}

export const MenuItem = createComponent<HTMLButtonElement, MenuItemProps>(
	'MenuItem',
	({ icon, label, shortcut, danger, disabled, onClick, className, ...props }, ref) => (
		<button
			ref={ref}
			type="button"
			role="menuitem"
			className={mergeClasses('c-menu-item', danger && 'danger', className)}
			disabled={disabled}
			onClick={onClick}
			{...props}
		>
			{icon && <span className="c-menu-item-icon">{icon}</span>}
			<span className="c-menu-item-label">{label}</span>
			{shortcut && <span className="c-menu-item-shortcut">{shortcut}</span>}
		</button>
	)
)

export interface MenuDividerProps extends React.HTMLAttributes<HTMLDivElement> {}

export const MenuDivider = createComponent<HTMLDivElement, MenuDividerProps>(
	'MenuDivider',
	({ className, ...props }, ref) => (
		<div ref={ref} className={mergeClasses('c-menu-divider', className)} {...props} />
	)
)

export interface MenuHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode
}

export const MenuHeader = createComponent<HTMLDivElement, MenuHeaderProps>(
	'MenuHeader',
	({ className, children, ...props }, ref) => (
		<div ref={ref} className={mergeClasses('c-menu-header', className)} {...props}>
			{children}
		</div>
	)
)

// vim: ts=4

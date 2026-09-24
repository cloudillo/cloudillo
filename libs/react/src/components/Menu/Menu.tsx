// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'

import { useEscapeKey, useMenuKeyboard, useMergedRefs, useOutsideDismiss } from '../hooks.js'
import { createComponent, mergeClasses } from '../utils.js'

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
		// Also as state, so the keyboard hook re-runs once the node exists.
		const [menuEl, setMenuEl] = React.useState<HTMLDivElement | null>(null)
		const [adjustedPosition, setAdjustedPosition] = React.useState(position)
		// Touch taps often never reach the document-level click listener (they land in an
		// app iframe, or iOS sends no click on non-clickable targets), so on coarse pointers
		// a transparent backdrop catches the dismissing tap instead.
		const [coarse] = React.useState(() => !!window.matchMedia?.('(pointer: coarse)').matches)

		// Combine refs using shared hook
		const mergedRef = useMergedRefs(ref, menuRef, setMenuEl)

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

		// Close on outside click. `#popper-container` is exempt alongside the menu
		// itself, so clicks in submenu portals (rendered as siblings there) count as
		// inside. It is a static shell element, so the render-time lookup is safe.
		// Contract (same as Popper/Dropdown): the dismissing click is consumed, so it
		// does not also activate whatever was under it; a right-click closes the menu
		// but passes through, so it can open the next context menu.
		useOutsideDismiss([menuEl, document.getElementById('popper-container')], onClose, {
			closeOnContextMenu: true
		})

		// Close on Escape using shared hook
		useEscapeKey(onClose)

		// Focus entry and arrow/Home/End roving, shared with Dropdown. The narrower
		// selector keeps a submenu trigger out of the rotation — it has its own
		// ArrowRight handling.
		const handleKeyDown = useMenuKeyboard(menuEl, {
			itemSelector: '.c-menu-item:not([disabled])'
		})

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
		return createPortal(
			<>
				{coarse && (
					<div
						className="c-menu-backdrop"
						aria-hidden="true"
						onClick={onClose}
						// Swallow only: the long-press that opened the menu can deliver its
						// own `contextmenu` here, which must not close it again.
						onContextMenu={(evt) => evt.preventDefault()}
					/>
				)}
				{menuElement}
			</>,
			portalContainer
		)
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
		// A generic element is not a permitted child of `role="menu"`.
		<div
			ref={ref}
			role="separator"
			className={mergeClasses('c-menu-divider', className)}
			{...props}
		/>
	)
)

export interface MenuHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode
}

export const MenuHeader = createComponent<HTMLDivElement, MenuHeaderProps>(
	'MenuHeader',
	({ className, children, ...props }, ref) => (
		// A generic element is not a permitted child of `role="menu"`.
		<div
			ref={ref}
			role="presentation"
			className={mergeClasses('c-menu-header', className)}
			{...props}
		>
			{children}
		</div>
	)
)

// SubMenuItem - a menu item that opens a nested submenu on hover/keyboard
export interface SubMenuItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
	icon?: React.ReactNode
	label: string
	/** Optional secondary label shown after the main label (e.g. current value) */
	detail?: string
	disabled?: boolean
	children?: React.ReactNode
}

export const SubMenuItem = createComponent<HTMLDivElement, SubMenuItemProps>(
	'SubMenuItem',
	({ icon, label, detail, disabled, children, className, ...props }, ref) => {
		const [isOpen, setIsOpen] = React.useState(false)
		const [triggerEl, setTriggerEl] = React.useState<HTMLDivElement | null>(null)
		const [popperEl, setPopperEl] = React.useState<HTMLDivElement | null>(null)
		const closeTimerRef = React.useRef<number | undefined>(undefined)
		const mergedRef = useMergedRefs(ref, setTriggerEl)

		const { styles: popperStyles, attributes } = usePopper(triggerEl, popperEl, {
			placement: 'right-start',
			strategy: 'fixed',
			modifiers: [
				{ name: 'flip', options: { fallbackPlacements: ['left-start'] } },
				{ name: 'preventOverflow', options: { padding: 8 } },
				{ name: 'offset', options: { offset: [-4, -4] } }
			]
		})

		function scheduleClose() {
			closeTimerRef.current = window.setTimeout(() => setIsOpen(false), 150)
		}

		function cancelClose() {
			if (closeTimerRef.current) {
				clearTimeout(closeTimerRef.current)
				closeTimerRef.current = undefined
			}
		}

		function handleMouseEnter() {
			if (disabled) return
			cancelClose()
			setIsOpen(true)
		}

		function handleMouseLeave() {
			scheduleClose()
		}

		function handleKeyDown(evt: React.KeyboardEvent) {
			if (disabled) return
			if (evt.key === 'ArrowRight' || evt.key === 'Enter') {
				evt.preventDefault()
				evt.stopPropagation()
				setIsOpen(true)
				requestAnimationFrame(() => {
					const firstItem = popperEl?.querySelector<HTMLButtonElement>(
						'.c-menu-item:not([disabled])'
					)
					firstItem?.focus()
				})
			}
		}

		function handleSubmenuKeyDown(evt: React.KeyboardEvent) {
			if (evt.key === 'ArrowLeft' || evt.key === 'Escape') {
				evt.preventDefault()
				evt.stopPropagation()
				setIsOpen(false)
				triggerEl?.querySelector<HTMLButtonElement>('.c-submenu-item')?.focus()
			}
		}

		React.useEffect(
			() => () => {
				if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
			},
			[]
		)

		return (
			<div
				ref={mergedRef}
				className={mergeClasses('c-submenu-container', className)}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				{...props}
			>
				<button
					type="button"
					role="menuitem"
					aria-haspopup="menu"
					aria-expanded={isOpen}
					className={mergeClasses('c-submenu-item', isOpen && 'active')}
					disabled={disabled}
					onKeyDown={handleKeyDown}
				>
					{icon && <span className="c-menu-item-icon">{icon}</span>}
					<span className="c-menu-item-label">
						{label}
						{detail && (
							<span
								style={{
									marginLeft: 'var(--space-1)',
									color: 'color-mix(in lch, var(--col-on-container), transparent 35%)',
									fontWeight: 'normal'
								}}
							>
								{detail}
							</span>
						)}
					</span>
					<span className="c-menu-item-chevron">&#x25B8;</span>
				</button>
				{isOpen &&
					createPortal(
						<div
							ref={setPopperEl}
							className="c-menu"
							role="menu"
							style={popperStyles.popper}
							onMouseEnter={cancelClose}
							onMouseLeave={scheduleClose}
							onKeyDown={handleSubmenuKeyDown}
							{...attributes.popper}
						>
							{children}
						</div>,
						document.getElementById('popper-container') || document.body
					)}
			</div>
		)
	}
)

// vim: ts=4

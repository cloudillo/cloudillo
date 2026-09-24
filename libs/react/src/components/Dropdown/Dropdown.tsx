// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'

import { useMenuKeyboard, useOutsideDismiss } from '../hooks.js'
import type { Elevation } from '../types.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface DropdownProps extends Omit<React.HTMLAttributes<HTMLDetailsElement>, 'children'> {
	trigger?: React.ReactNode
	triggerClassName?: string
	triggerProps?: React.HTMLAttributes<HTMLElement>
	menuClassName?: string
	/**
	 * Give the popper `role="menu"`.
	 *
	 * Set it when the content is `MenuItem`s: a `role="menuitem"` with no menu
	 * around it is an ARIA validity error, and a screen reader announces neither
	 * the menu nor its item count. Leave it off when the popper holds a list or
	 * arbitrary content — `menu` would be the wrong shape for it.
	 */
	asMenu?: boolean
	/** Accessible name for the popper. Only meaningful with `asMenu`. */
	menuLabel?: string
	elevation?: Elevation
	emph?: boolean
	placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
	children?: React.ReactNode
}

export const Dropdown = createComponent<HTMLDetailsElement, DropdownProps>(
	'Dropdown',
	(
		{
			className,
			trigger,
			triggerClassName,
			triggerProps,
			menuClassName,
			asMenu,
			menuLabel,
			elevation = 'high',
			emph,
			placement = 'bottom-start',
			children,
			...props
		},
		ref
	) => {
		const [popperRef, setPopperRef] = React.useState<HTMLElement | null>(null)
		const [popperEl, setPopperEl] = React.useState<HTMLElement | null>(null)
		const [isOpen, setIsOpen] = React.useState(false)
		const { styles: popperStyles, attributes } = usePopper(popperRef, popperEl, {
			placement,
			strategy: 'fixed'
		})

		useOutsideDismiss([popperEl], () => setIsOpen(false))

		React.useEffect(() => {
			if (!popperEl) return
			function handleKeyDown(evt: KeyboardEvent) {
				if (evt.key !== 'Escape') return
				evt.stopImmediatePropagation()
				evt.preventDefault()
				setIsOpen(false)
				// Focus is inside the popper, which is about to be unmounted — put
				// it back on the trigger rather than dropping it on `<body>`.
				popperRef?.focus()
			}
			document.addEventListener('keydown', handleKeyDown, true)
			return () => {
				document.removeEventListener('keydown', handleKeyDown, true)
			}
		}, [popperEl, popperRef])

		// Arrow/Home/End roving, shared with Menu. Grabbing focus on open is for
		// menus only: a plain dropdown is a popover of arbitrary content, and
		// pulling the caret into its first button or link on a mouse click is not
		// what any of the non-menu call sites asked for. The roving handler itself
		// stays on — it is inert while nothing inside is focused.
		const handleMenuKeyDown = useMenuKeyboard(popperEl, { autoFocus: !!asMenu })

		// Falling back to `body` matters: an app whose index.html has no
		// #popper-container would otherwise render the menu into nothing, silently.
		const popperContainer =
			typeof document !== 'undefined'
				? (document.getElementById('popper-container') ?? document.body)
				: null

		return (
			<details
				ref={ref}
				className={mergeClasses('c-dropdown-host', className)}
				open={isOpen}
				onClick={(evt) => {
					evt.stopPropagation()
					setIsOpen(!isOpen)
				}}
				{...props}
			>
				<summary
					ref={setPopperRef}
					className={mergeClasses('c-dropdown-host__trigger', triggerClassName)}
					{...triggerProps}
					aria-haspopup={triggerProps?.['aria-haspopup'] ?? true}
					aria-expanded={isOpen}
				>
					{trigger}
				</summary>
				{isOpen &&
					popperContainer &&
					createPortal(
						<div
							ref={setPopperEl}
							className={mergeClasses(
								'c-popper',
								elevation,
								emph && 'emph',
								menuClassName
							)}
							role={asMenu ? 'menu' : undefined}
							aria-label={asMenu ? menuLabel : undefined}
							style={popperStyles.popper}
							onClick={() => {
								setIsOpen(false)
								// A menu item's activation ends the menu, so focus
								// belongs back on the trigger. NOT for a plain
								// dropdown: its content is arbitrary, and pulling
								// the caret out of a field the user just clicked is
								// not a close.
								if (asMenu) popperRef?.focus()
							}}
							onKeyDown={handleMenuKeyDown}
							{...attributes.popper}
						>
							{children}
						</div>,
						popperContainer
					)}
			</details>
		)
	}
)

// vim: ts=4

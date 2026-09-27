// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Popover } from '../Popover/Popover.js'
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

/** @deprecated Use `Popover` (or `Menu` for action lists) with a Button `trigger`. Kept for app consumers. */
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
		const [isOpen, setIsOpen] = React.useState(false)

		return (
			<details
				ref={ref}
				className={mergeClasses('c-dropdown-host', className)}
				open={isOpen}
				// Portaled content bubbles through here in the React tree; keep it from rows behind
				onClick={(evt) => evt.stopPropagation()}
				{...props}
			>
				<Popover
					open={isOpen}
					onOpenChange={setIsOpen}
					placement={placement}
					elevation={elevation}
					role={asMenu ? 'menu' : 'dialog'}
					aria-label={asMenu ? menuLabel : undefined}
					className={mergeClasses(emph && 'emph', menuClassName)}
					onClick={() => setIsOpen(false)}
					trigger={
						<summary
							className={mergeClasses('c-dropdown-host__trigger', triggerClassName)}
							{...triggerProps}
							aria-haspopup={triggerProps?.['aria-haspopup'] ?? true}
							onClick={(evt) => {
								evt.preventDefault()
								triggerProps?.onClick?.(evt)
							}}
						>
							{trigger}
						</summary>
					}
				>
					{children}
				</Popover>
			</details>
		)
	}
)

// vim: ts=4

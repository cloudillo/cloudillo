// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'
import { mergeClasses, createComponent } from '../utils.js'
import type { Elevation } from '../types.js'

export interface DropdownProps extends Omit<React.HTMLAttributes<HTMLDetailsElement>, 'children'> {
	trigger?: React.ReactNode
	triggerClassName?: string
	triggerProps?: React.HTMLAttributes<HTMLElement>
	menuClassName?: string
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

		React.useEffect(() => {
			if (!popperEl) return
			function handleClickOutside(evt: MouseEvent) {
				if (!(evt.target instanceof Node) || !popperEl?.contains(evt.target)) {
					evt.stopPropagation()
					evt.preventDefault()
					setIsOpen(false)
				}
			}
			function handleKeyDown(evt: KeyboardEvent) {
				if (evt.key !== 'Escape') return
				evt.stopImmediatePropagation()
				evt.preventDefault()
				setIsOpen(false)
			}
			document.addEventListener('click', handleClickOutside, true)
			document.addEventListener('keydown', handleKeyDown, true)
			return () => {
				document.removeEventListener('click', handleClickOutside, true)
				document.removeEventListener('keydown', handleKeyDown, true)
			}
		}, [popperEl])

		const popperContainer =
			typeof document !== 'undefined' ? document.getElementById('popper-container') : null

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
							style={popperStyles.popper}
							onClick={() => setIsOpen(false)}
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

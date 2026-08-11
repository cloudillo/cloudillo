// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'

import type { Elevation } from '../types.js'
import { mergeClasses } from '../utils.js'

export interface PopperProps {
	className?: string
	menuClassName?: string
	contentClassName?: string
	elevation?: Elevation
	icon?: React.ReactNode
	label?: React.ReactNode
	'aria-label'?: string
	children?: React.ReactNode
}

export function Popper({
	className,
	menuClassName,
	contentClassName,
	elevation = 'high',
	icon,
	label,
	'aria-label': ariaLabel,
	children
}: PopperProps) {
	const [popperRef, setPopperRef] = React.useState<HTMLElement | null>(null)
	const [popperEl, setPopperEl] = React.useState<HTMLElement | null>(null)
	const [isOpen, setIsOpen] = React.useState(false)
	const { styles: popperStyles, attributes } = usePopper(popperRef, popperEl, {
		placement: 'bottom-start',
		strategy: 'fixed'
	})

	React.useEffect(() => {
		if (!popperEl) return

		function handleClickOutside(evt: MouseEvent) {
			// Same exemption as `Dropdown`: a synthetic click is a menu item doing
			// its job, and `preventDefault()` on one cancels the very default
			// action it was dispatched for (blob download, file picker). No shell
			// Popper menu triggers one yet, but the trap is identical.
			if (!evt.isTrusted) return
			if (!(evt.target instanceof Node) || !popperEl?.contains(evt.target)) {
				evt.stopPropagation()
				evt.preventDefault()
				setIsOpen(false)
			}
		}

		document.addEventListener('click', handleClickOutside, true)
		return () => {
			document.removeEventListener('click', handleClickOutside, true)
		}
	}, [popperEl])

	return (
		<details
			className={className}
			open={isOpen}
			onClick={(evt) => {
				evt.stopPropagation()
				setIsOpen(!isOpen)
			}}
		>
			<summary
				ref={setPopperRef}
				className={menuClassName || 'c-nav-item g-2'}
				onClick={(evt) => {
					evt.stopPropagation()
					setIsOpen(!isOpen)
				}}
				aria-label={ariaLabel}
				aria-expanded={isOpen}
				aria-haspopup="true"
			>
				{icon}
				{label}
			</summary>
			{isOpen &&
				createPortal(
					<div
						ref={setPopperEl}
						className={mergeClasses('c-popper', elevation, contentClassName)}
						style={popperStyles.popper}
						onClick={(_evt) => setIsOpen(false)}
						{...attributes.popper}
					>
						{children}
					</div>,
					// `body` fallback: a non-null assertion here THROWS in any app
					// whose index.html lacks the container.
					document.getElementById('popper-container') ?? document.body
				)}
		</details>
	)
}

// vim: ts=4

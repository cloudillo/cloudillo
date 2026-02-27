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
import { usePopper } from 'react-popper'
import { mergeClasses } from '../utils.js'
import type { Elevation } from '../types.js'

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
	children,
	...props
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

		async function handleClickOutside(evt: MouseEvent) {
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
			onClick={(evt) => (evt.stopPropagation(), setIsOpen(!isOpen))}
		>
			<summary
				ref={setPopperRef}
				className={menuClassName || 'c-nav-item g-2'}
				onClick={(evt) => (evt.stopPropagation(), setIsOpen(!isOpen))}
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
						onClick={(evt) => setIsOpen(false)}
						{...attributes.popper}
					>
						{children}
					</div>,
					document.getElementById('popper-container')!
				)}
		</details>
	)
}

// vim: ts=4

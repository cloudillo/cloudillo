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
import { mergeClasses, createComponent } from '../utils.js'
import type { Elevation } from '../types.js'

export interface DropdownProps extends React.HTMLAttributes<HTMLDetailsElement> {
	trigger?: React.ReactNode
	triggerClassName?: string
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
			menuClassName,
			elevation,
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

		// Close on click outside
		React.useEffect(() => {
			if (!popperEl) return

			function handleClickOutside(evt: MouseEvent) {
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

		const popperContainer =
			typeof document !== 'undefined' ? document.getElementById('popper-container') : null

		return (
			<details
				ref={ref}
				className={mergeClasses('c-dropdown', className)}
				open={isOpen}
				onClick={(evt) => {
					evt.stopPropagation()
					setIsOpen(!isOpen)
				}}
				{...props}
			>
				<summary
					ref={setPopperRef}
					className={triggerClassName}
					onClick={(evt) => {
						evt.stopPropagation()
						setIsOpen(!isOpen)
					}}
				>
					{trigger}
				</summary>
				{isOpen &&
					popperContainer &&
					createPortal(
						<div
							ref={setPopperEl}
							className={mergeClasses(
								'c-nav vertical',
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

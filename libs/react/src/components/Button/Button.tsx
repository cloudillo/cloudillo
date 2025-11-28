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
import { mergeClasses, createComponent, buttonSizeClass } from '../utils.js'
import type { ColorVariant, ContainerColorVariant, ButtonSize } from '../types.js'
import { delay } from '@cloudillo/base'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	// New variant prop (preferred)
	variant?: ColorVariant | ContainerColorVariant
	size?: ButtonSize
	mode?: 'icon' | 'float'
	active?: boolean
	icon?: React.ReactNode
	// Legacy boolean props for backwards compatibility
	primary?: boolean
	secondary?: boolean
	accent?: boolean
	link?: boolean
	children?: React.ReactNode
}

export const Button = createComponent<HTMLButtonElement, ButtonProps>(
	'Button',
	({
		className,
		type = 'button',
		onClick,
		variant,
		size,
		mode,
		active,
		icon,
		primary,
		secondary,
		accent,
		link,
		children,
		...props
	}, ref) => {
		const [clicked, setClicked] = React.useState(false)

		// Support both new variant prop and legacy boolean props
		const variantClass = variant
			|| (primary ? 'primary' : undefined)
			|| (secondary ? 'secondary' : undefined)
			|| (accent ? 'accent' : undefined)

		async function handleClick(evt: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
			evt.preventDefault()
			setClicked(true)
			await delay(200)
			setClicked(false)
			if (type === 'submit') {
				(evt.target as HTMLButtonElement).form?.requestSubmit()
			} else {
				onClick?.(evt)
			}
		}

		return (
			<button
				ref={ref}
				className={mergeClasses(
					link ? 'c-link' : 'c-button',
					variantClass,
					buttonSizeClass(size),
					mode,
					active && 'active',
					clicked && 'clicked',
					(icon && children) ? 'g-2' : undefined,
					className
				)}
				type={type}
				onClick={handleClick}
				{...props}
			>
				{icon}
				{children}
			</button>
		)
	}
)

// vim: ts=4

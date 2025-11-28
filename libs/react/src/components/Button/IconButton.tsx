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
import type { ColorVariant, ButtonSize } from '../types.js'
import { delay } from '@cloudillo/base'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ColorVariant
	size?: ButtonSize
	children?: React.ReactNode
}

export const IconButton = createComponent<HTMLButtonElement, IconButtonProps>(
	'IconButton',
	({ className, type = 'button', onClick, variant, size, children, ...props }, ref) => {
		const [clicked, setClicked] = React.useState(false)

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
					'c-icon',
					variant,
					buttonSizeClass(size),
					clicked && 'clicked',
					className
				)}
				type={type}
				onClick={handleClick}
				{...props}
			>
				{children}
			</button>
		)
	}
)

// vim: ts=4

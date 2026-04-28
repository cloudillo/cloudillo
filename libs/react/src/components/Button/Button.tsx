// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent, buttonSizeClass } from '../utils.js'
import type { ColorVariant, ContainerColorVariant, ButtonSize } from '../types.js'
import { delay } from '@cloudillo/core'

export type ButtonKind = 'button' | 'link' | 'nav-item' | 'nav-link'

const KIND_CLASS: Record<ButtonKind, string> = {
	button: 'c-button',
	link: 'c-link',
	'nav-item': 'c-nav-item',
	'nav-link': 'c-nav-link'
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	/**
	 * Base visual style.
	 * - `'button'` (default): primary action button (`c-button`).
	 * - `'link'`: text link styled as a button (`c-link`).
	 * - `'nav-item'`: menu / sidebar row (`c-nav-item`).
	 */
	kind?: ButtonKind
	variant?: ColorVariant | ContainerColorVariant
	size?: ButtonSize
	mode?: 'icon' | 'float'
	active?: boolean
	icon?: React.ReactNode
	children?: React.ReactNode
}

export const Button = createComponent<HTMLButtonElement, ButtonProps>(
	'Button',
	(
		{
			className,
			type = 'button',
			onClick,
			kind = 'button',
			variant,
			size,
			mode,
			active,
			icon,
			children,
			...props
		},
		ref
	) => {
		const [clicked, setClicked] = React.useState(false)

		async function handleClick(evt: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
			evt.preventDefault()
			const form = (evt.currentTarget as HTMLButtonElement).form

			// Animation
			setClicked(true)
			await delay(200)
			setClicked(false)

			if (type === 'submit') {
				form?.requestSubmit()
			} else if (onClick) {
				// Original event is stale after await — synthesize a minimal event object.
				const syntheticEvent = {
					preventDefault: () => {},
					stopPropagation: () => {},
					target: form,
					currentTarget: form
				} as unknown as React.MouseEvent<HTMLButtonElement, MouseEvent>
				onClick(syntheticEvent)
			}
		}

		return (
			<button
				ref={ref}
				className={mergeClasses(
					KIND_CLASS[kind],
					variant,
					buttonSizeClass(size),
					mode,
					active && 'active',
					clicked && 'clicked',
					icon && children ? 'g-2' : undefined,
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

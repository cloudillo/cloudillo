// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { Spacing } from '../Box/HBox.js'
import { Affix, type AffixPosition } from '../Layout/Affix.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface FABProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	icon: React.ReactNode
	/** Icon-only, so the label is required. */
	'aria-label': string
	size?: 'sm' | 'md' | 'lg'
	/** Defaults to `primary`. */
	color?: 'primary' | 'secondary' | 'accent'
	/** Where `Affix` pins it (default `bottom-end`); `false` renders it in flow. */
	affix?: AffixPosition | false
	/** Affix distance from the edge. Defaults to 3. */
	offset?: Spacing
}

/** Floating action button: the page's one primary action, pinned via `Affix`. */
export const FAB = createComponent<HTMLButtonElement, FABProps>(
	'FAB',
	(
		{
			className,
			icon,
			size = 'md',
			color = 'primary',
			affix = 'bottom-end',
			offset = 3,
			type = 'button',
			...props
		},
		ref
	) => {
		const button = (
			<button
				ref={ref}
				type={type}
				className={mergeClasses(
					'c-fab',
					color,
					size === 'sm' && 'small',
					size === 'lg' && 'large',
					!affix && 'inline',
					className
				)}
				{...props}
			>
				{icon}
			</button>
		)

		return affix ? (
			<Affix position={affix} offset={offset}>
				{button}
			</Affix>
		) : (
			button
		)
	}
)

// vim: ts=4

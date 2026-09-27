// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { ColorVariant, Size } from '../types.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
	/** Icon component, e.g. a react-icons `LuX` */
	as: React.ComponentType<React.SVGAttributes<SVGElement>>
	/** Omitted = inherits the surrounding font size */
	size?: Size
	color?: ColorVariant
	/** Accessible name; without it the icon is decorative */
	label?: string
}

export const Icon = createComponent<HTMLSpanElement, IconProps>(
	'Icon',
	({ as: Glyph, size, color, label, className, ...props }, ref) => {
		return (
			<span
				ref={ref}
				className={mergeClasses('c-icon', size, color && `text-${color}`, className)}
				{...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
				{...props}
			>
				<Glyph aria-hidden />
			</span>
		)
	}
)

// vim: ts=4
